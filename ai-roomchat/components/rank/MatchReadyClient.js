'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

import styles from './MatchReadyClient.module.css';
import { createEmptyMatchFlowState, readMatchFlowState } from '../../lib/rank/matchFlow';
import {
  setGameMatchParticipation,
  setGameMatchSlotTemplate,
  setGameMatchSnapshot,
  setGameMatchSessionMeta,
  setGameMatchSessionHistory,
  subscribeGameMatchData,
} from '../../modules/rank/matchDataStore';
import {
  TURN_TIMER_OPTIONS,
  sanitizeSecondsOption,
  formatSecondsLabel,
  sanitizeTurnTimerVote,
  buildTurnTimerVotePatch,
} from '../../lib/rank/turnTimerMeta';
import { subscribeToBroadcastTopic } from '../../lib/realtime/broadcast';
import { supabase } from '../../lib/supabase';
import { loadMatchFlowSnapshot } from '../../modules/rank/matchRealtimeSync';
import { requestMatchReadySignal } from '../../lib/rank/readyCheckClient';
import { addDebugEvent } from '../../lib/debugCollector';

const StartClient = dynamic(() => import('./StartClient'), {
  ssr: false,
  loading: () => (
    <div className={styles.overlayLoading}>
      <p className={styles.overlayLoadingText}>본게임 화면을 준비하고 있습니다…</p>
    </div>
  ),
});

function createInitialDiagnostics() {
  return {
    sessionId: '',
    roomId: '',
    rosterCount: 0,
    readyCount: 0,
    hasActiveKey: false,
    sessionMetaUpdatedAt: null,
    turnStateVersion: null,
    lastSnapshotAt: null,
    lastRefreshAt: null,
    lastRefreshSource: '',
    lastRefreshError: null,
    lastRefreshHint: null,
    lastRefreshRequestedAt: null,
    pendingRefresh: false,
    realtime: {
      status: 'idle',
      updatedAt: null,
      lastEvent: null,
      lastError: null,
    },
  };
}

function deriveRealtimeErrorHint(message = '') {
  if (typeof message !== 'string') return null;
  if (message.includes('Unable to subscribe to changes with given parameters')) {
    return [
      'Supabase Realtime이 해당 테이블을 전파하도록 설정되어 있는지 확인하세요.',
      '다음 SQL을 실행해 rank_match_roster, rank_sessions, rank_rooms, rank_session_meta를 supabase_realtime 게시에 추가한 뒤 대시보드에서 Realtime을 활성화해야 합니다.',
      'alter publication supabase_realtime add table public.rank_match_roster, public.rank_sessions, public.rank_rooms, public.rank_session_meta;',
    ].join(' ');
  }
  return null;
}

function normalizeRealtimeError(error) {
  if (!error) {
    return { message: 'unknown_error', hint: null };
  }

  if (typeof error === 'string') {
    return { message: error, hint: deriveRealtimeErrorHint(error) };
  }

  if (error instanceof Error) {
    const message = error.message || 'unknown_error';
    return { message, hint: deriveRealtimeErrorHint(message) };
  }

  if (error?.payload) {
    return normalizeRealtimeError(error.payload);
  }

  const message =
    error?.message || error?.msg || error?.reason || error?.error || error?.code || 'unknown_error';

  const combined = [
    error?.message,
    error?.msg,
    error?.hint,
    error?.details,
    error?.code,
    error?.status,
  ]
    .filter(Boolean)
    .join(' ');

  return { message, hint: deriveRealtimeErrorHint(combined || message) };
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function useMatchReadyState(gameId) {
  const [state, setState] = useState(() => ({
    ...createEmptyMatchFlowState(),
    sessionId: null,
    roomId: null,
  }));
  const [diagnostics, setDiagnostics] = useState(() => createInitialDiagnostics());
  const refreshPromiseRef = useRef(null);
  const latestRef = useRef({
    slotTemplateVersion: null,
    slotTemplateUpdatedAt: null,
    sessionId: null,
    roomId: null,
  });
  const refreshTimeoutRef = useRef(null);

  const applySnapshot = useCallback(() => {
    if (!gameId && gameId !== 0) {
      const empty = {
        ...createEmptyMatchFlowState(),
        sessionId: null,
        roomId: null,
      };
      setState(empty);
      setDiagnostics(prev => ({
        ...createInitialDiagnostics(),
        lastSnapshotAt: Date.now(),
        lastRefreshError: prev.lastRefreshError,
        lastRefreshHint: prev.lastRefreshHint,
      }));
      return empty;
    }
    const snapshot = readMatchFlowState(gameId);
    const storedSessionId = snapshot?.sessionHistory?.sessionId || null;
    if (storedSessionId && !latestRef.current.sessionId) {
      const trimmed = String(storedSessionId).trim();
      latestRef.current.sessionId = trimmed || latestRef.current.sessionId;
    }
    const effectiveSessionId =
      latestRef.current.sessionId ||
      (storedSessionId ? String(storedSessionId).trim() || null : null);
    const effectiveRoomId =
      latestRef.current.roomId ||
      (snapshot?.room?.id ? String(snapshot.room.id).trim() || null : null);
    const augmented = {
      ...snapshot,
      sessionId: effectiveSessionId,
      roomId: effectiveRoomId,
    };
    setState(augmented);
    setDiagnostics(prev => {
      const roster = Array.isArray(augmented?.roster) ? augmented.roster : [];
      const readyCount = roster.filter(entry => entry?.ready).length;
      return {
        ...prev,
        sessionId: augmented?.sessionId ? String(augmented.sessionId).trim() : prev.sessionId,
        roomId: augmented?.room?.id
          ? String(augmented.room.id).trim()
          : effectiveRoomId
            ? String(effectiveRoomId).trim()
            : prev.roomId,
        rosterCount: roster.length,
        readyCount,
        hasActiveKey: !!augmented?.hasActiveKey,
        sessionMetaUpdatedAt:
          augmented?.sessionMeta?.updatedAt != null
            ? augmented.sessionMeta.updatedAt
            : prev.sessionMetaUpdatedAt,
        turnStateVersion:
          augmented?.sessionMeta?.turnState?.version != null
            ? augmented.sessionMeta.turnState.version
            : prev.turnStateVersion,
        lastSnapshotAt: Date.now(),
      };
    });
    return augmented;
  }, [gameId]);

  const syncFromRemote = useCallback(async () => {
    if (!gameId && gameId !== 0) {
      latestRef.current = {
        slotTemplateVersion: null,
        slotTemplateUpdatedAt: null,
        sessionId: null,
        roomId: null,
      };
      const empty = {
        ...createEmptyMatchFlowState(),
        sessionId: null,
        roomId: null,
      };
      setState(empty);
      setDiagnostics(prev => ({
        ...createInitialDiagnostics(),
        lastSnapshotAt: Date.now(),
        lastRefreshAt: Date.now(),
        lastRefreshSource: 'reset',
        lastRefreshError: null,
        lastRefreshHint: null,
      }));
      return empty;
    }

    try {
      const payload = await loadMatchFlowSnapshot(supabase, gameId);
      if (payload) {
        if (Array.isArray(payload.roster) && payload.roster.length) {
          setGameMatchParticipation(gameId, {
            roster: payload.roster,
            participantPool: payload.participantPool,
            heroOptions: payload.heroOptions,
            heroMap: payload.heroMap,
            realtimeMode: payload.realtimeMode,
            hostOwnerId: payload.hostOwnerId,
            hostRoleLimit: payload.hostRoleLimit,
          });
        }

        if (payload.slotTemplate) {
          setGameMatchSlotTemplate(gameId, payload.slotTemplate);
        }

        if (payload.matchSnapshot) {
          setGameMatchSnapshot(gameId, payload.matchSnapshot);
        }

        if (payload.sessionMeta) {
          setGameMatchSessionMeta(gameId, payload.sessionMeta);
        }

        if (payload.sessionHistory !== undefined) {
          setGameMatchSessionHistory(gameId, payload.sessionHistory);
        }

        latestRef.current = {
          slotTemplateVersion:
            payload.slotTemplateVersion != null
              ? payload.slotTemplateVersion
              : latestRef.current.slotTemplateVersion,
          slotTemplateUpdatedAt:
            payload.slotTemplateUpdatedAt != null
              ? payload.slotTemplateUpdatedAt
              : latestRef.current.slotTemplateUpdatedAt,
          sessionId:
            payload.sessionId != null
              ? String(payload.sessionId).trim()
              : latestRef.current.sessionId,
          roomId: payload.roomId != null ? String(payload.roomId).trim() : latestRef.current.roomId,
        };
        setDiagnostics(prev => ({
          ...prev,
          sessionId: payload.sessionId != null ? String(payload.sessionId).trim() : prev.sessionId,
          roomId: payload.roomId != null ? String(payload.roomId).trim() : prev.roomId,
          sessionMetaUpdatedAt:
            payload.sessionMeta?.updatedAt != null
              ? payload.sessionMeta.updatedAt
              : prev.sessionMetaUpdatedAt,
          turnStateVersion:
            payload.sessionMeta?.turnState?.version != null
              ? payload.sessionMeta.turnState.version
              : prev.turnStateVersion,
          lastRefreshAt: Date.now(),
          lastRefreshSource: 'snapshot',
          lastRefreshError: null,
          lastRefreshHint: null,
        }));
      }
    } catch (error) {
      console.warn('[MatchReadyClient] 실시간 매치 데이터를 불러오지 못했습니다:', error);
      setDiagnostics(prev => ({
        ...prev,
        lastRefreshAt: Date.now(),
        lastRefreshSource: 'snapshot',
        lastRefreshError: error?.message || 'load_failed',
        lastRefreshHint: error?.hint || prev.lastRefreshHint,
      }));
      addDebugEvent({
        level: 'error',
        source: 'match-ready-sync',
        message: 'Failed to load match flow snapshot',
        details: {
          gameId,
          error: error?.message || 'unknown_error',
        },
      });
    }

    return applySnapshot();
  }, [gameId, applySnapshot]);

  const refresh = useCallback(() => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    setDiagnostics(prev => ({
      ...prev,
      pendingRefresh: true,
      lastRefreshRequestedAt: Date.now(),
    }));
    const promise = syncFromRemote().finally(() => {
      refreshPromiseRef.current = null;
      setDiagnostics(prev => ({
        ...prev,
        pendingRefresh: false,
      }));
    });
    refreshPromiseRef.current = promise;
    return promise;
  }, [syncFromRemote]);

  useEffect(() => {
    let storedSessionId = null;
    let storedRoomId = null;
    if (gameId || gameId === 0) {
      const storedState = readMatchFlowState(gameId);
      if (storedState?.sessionHistory?.sessionId) {
        const trimmed = String(storedState.sessionHistory.sessionId).trim();
        if (trimmed) {
          storedSessionId = trimmed;
        }
      }
      if (storedState?.room?.id) {
        const trimmedRoom = String(storedState.room.id).trim();
        if (trimmedRoom) {
          storedRoomId = trimmedRoom;
        }
      }
    }

    latestRef.current = {
      slotTemplateVersion: null,
      slotTemplateUpdatedAt: null,
      sessionId: storedSessionId,
      roomId: storedRoomId,
    };
    refresh();
  }, [gameId, refresh]);

  useEffect(() => {
    if (!gameId && gameId !== 0) return undefined;
    const unsubscribe = subscribeGameMatchData(gameId, () => {
      applySnapshot();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [gameId, applySnapshot]);

  useEffect(() => {
    if (!gameId && gameId !== 0) return undefined;

    let alive = true;

    const scheduleRefresh = payload => {
      if (!alive || refreshTimeoutRef.current) return;

      const eventType = payload?.eventType || payload?.event || null;
      const tableName = payload?.table || null;
      const schemaName = payload?.schema || null;
      const commitTimestamp = payload?.commit_timestamp || null;

      setDiagnostics(prev => ({
        ...prev,
        realtime: {
          ...prev.realtime,
          status: 'connected',
          updatedAt: Date.now(),
          lastError: null,
          lastEvent: {
            event: eventType,
            table: tableName,
            schema: schemaName,
            commitTimestamp,
            receivedAt: Date.now(),
          },
        },
      }));

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        refresh();
      }, 250);
    };

    const handleStatusUpdate = (status, context = {}) => {
      if (!alive) return;

      const normalizedStatus =
        status === 'SUBSCRIBED'
          ? 'connected'
          : status === 'SUBSCRIBING'
            ? 'connecting'
            : status === 'CLOSED'
              ? 'closed'
              : String(status || '').toLowerCase();

      const errorPayload = context?.error ? normalizeRealtimeError(context.error) : null;

      setDiagnostics(prev => ({
        ...prev,
        realtime: {
          ...prev.realtime,
          status: normalizedStatus || prev.realtime.status,
          updatedAt: Date.now(),
          lastError:
            status === 'CHANNEL_ERROR'
              ? errorPayload || { topic: context.topic || null }
              : prev.realtime.lastError,
        },
      }));

      if (status === 'CHANNEL_ERROR') {
        refresh().catch(() => {});
      }
    };

    setDiagnostics(prev => ({
      ...prev,
      realtime: {
        ...prev.realtime,
        status: 'connecting',
        updatedAt: Date.now(),
        lastError: null,
      },
    }));

    const unsubscribers = [
      subscribeToBroadcastTopic(
        `rank_match_roster:game:${gameId}`,
        change => {
          if (!alive) return;
          scheduleRefresh(change);
        },
        { events: ['INSERT', 'UPDATE', 'DELETE'], onStatus: handleStatusUpdate }
      ),
      subscribeToBroadcastTopic(
        `rank_sessions:game:${gameId}`,
        change => {
          if (!alive) return;
          scheduleRefresh(change);
        },
        { events: ['INSERT', 'UPDATE', 'DELETE'], onStatus: handleStatusUpdate }
      ),
      subscribeToBroadcastTopic(
        `rank_rooms:game:${gameId}`,
        change => {
          if (!alive) return;
          scheduleRefresh(change);
        },
        { events: ['INSERT', 'UPDATE', 'DELETE'], onStatus: handleStatusUpdate }
      ),
      subscribeToBroadcastTopic(
        `rank_session_meta:game:${gameId}`,
        change => {
          if (!alive) return;
          const sessionId = latestRef.current.sessionId;
          if (!sessionId) return;
          const record = change?.new || null;
          if (!record || typeof record !== 'object') return;
          const incoming = record.session_id ?? record.sessionId ?? null;
          if (!incoming) return;
          if (String(incoming).trim() !== String(sessionId).trim()) return;
          scheduleRefresh(change);
        },
        { events: ['INSERT', 'UPDATE', 'DELETE'], onStatus: handleStatusUpdate }
      ),
    ];

    return () => {
      alive = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      unsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    };
  }, [gameId, refresh]);

  const allowStart = useMemo(
    () => Boolean(gameId && state?.snapshot && state?.hasActiveKey && state?.sessionId),
    [gameId, state?.snapshot, state?.hasActiveKey, state?.sessionId]
  );

  const missingKey = Boolean(state?.snapshot && !state?.hasActiveKey);

  return { state, refresh, allowStart, missingKey, diagnostics };
}

function getViewerIdentity(state) {
  const ownerId = state?.viewer?.ownerId ? String(state.viewer.ownerId).trim() : '';
  if (ownerId) return ownerId;
  const viewerId = state?.viewer?.viewerId ? String(state.viewer.viewerId).trim() : '';
  if (viewerId) return viewerId;
  const authId = state?.authSnapshot?.userId;
  return authId ? String(authId).trim() : '';
}

function formatDiagnosticsTimestamp(value) {
  if (!value) return '—';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : String(value);
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatRealtimeStatus(realtime) {
  if (!realtime) return 'idle';
  return realtime.status || 'idle';
}

function formatRealtimeEventSummary(event) {
  if (!event) return '없음';
  const schema = event.schema || 'public';
  const table = event.table || '*';
  const type = event.event || 'unknown';
  return `${schema}.${table} · ${type}`;
}

function buildMetaLines(state) {
  const lines = [];
  if (!state?.snapshot) return lines;

  const code = state.snapshot?.match?.matchCode;
  if (code) {
    lines.push(`방 코드 ${code}`);
  }

  const windowSize = state.snapshot?.match?.maxWindow;
  if (Number.isFinite(Number(windowSize)) && Number(windowSize) > 0) {
    lines.push(`점수 범위 ±${Number(windowSize)}`);
  }

  const modeLabel = state.matchMode ? `모드 ${state.matchMode}` : '';
  if (modeLabel) {
    lines.push(modeLabel);
  }

  if (state.room?.realtimeMode === 'pulse') {
    lines.push('Pulse 실시간 규칙 적용');
    if (Number.isFinite(Number(state.room?.hostRoleLimit))) {
      lines.push(`호스트 역할군 제한 ${state.room.hostRoleLimit}명`);
    }
  } else if (state.room?.realtimeMode === 'standard') {
    lines.push('실시간 매치 준비 완료');
  }

  if (state.snapshot?.match?.matchType === 'drop_in') {
    lines.push('난입 매치 진행 중');
  }

  const asyncFill = state?.sessionMeta?.asyncFill;
  if (asyncFill?.mode === 'off' && asyncFill?.seatLimit) {
    const allowed = Number(asyncFill.seatLimit.allowed) || 0;
    const total = Number(asyncFill.seatLimit.total) || 0;
    const queueCount = Array.isArray(asyncFill.fillQueue) ? asyncFill.fillQueue.length : 0;
    const roleLabel = asyncFill.hostRole || '역할 미지정';
    if (total > 0) {
      lines.push(`비실시간 충원 · ${roleLabel} 좌석 ${allowed}/${total} · 대기열 ${queueCount}명`);
    }
  }

  return lines;
}

function buildRosterDisplay(roster, viewer, blindMode, asyncFill) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return [
      {
        key: 'empty',
        label: '참가자 정보가 없습니다.',
        status: '',
      },
    ];
  }

  const viewerOwnerId = viewer?.ownerId ? String(viewer.ownerId).trim() : '';
  const seatIndexes = new Set(
    Array.isArray(asyncFill?.seatIndexes)
      ? asyncFill.seatIndexes.map(value => Number(value)).filter(Number.isFinite)
      : []
  );
  const overflowIndexes = new Set(
    Array.isArray(asyncFill?.overflow)
      ? asyncFill.overflow
          .map(entry => Number(entry?.slotIndex))
          .filter(value => Number.isFinite(value))
      : []
  );
  const pendingIndexes = new Set(
    Array.isArray(asyncFill?.pendingSeatIndexes)
      ? asyncFill.pendingSeatIndexes
          .map(value => Number(value))
          .filter(value => Number.isFinite(value))
      : []
  );
  const hasSeatLimit = seatIndexes.size > 0;

  return roster.map((entry, index) => {
    const isOccupied = entry.heroId && entry.ownerId;
    const hideIdentity =
      blindMode && isOccupied && (!viewerOwnerId || String(entry.ownerId).trim() !== viewerOwnerId);
    const heroLabel = hideIdentity
      ? '비공개 참가자'
      : entry.heroName || (entry.heroId ? `캐릭터 #${entry.heroId}` : '빈 슬롯');
    const roleLabel = entry.role || '역할 미지정';
    const slotIndex = Number.isFinite(Number(entry.slotIndex)) ? Number(entry.slotIndex) : index;
    let readyLabel = isOccupied ? '착석 완료' : '대기';

    if (overflowIndexes.has(slotIndex)) {
      readyLabel = isOccupied ? '대기열 (자동 충원 대기)' : '대기열 슬롯';
    } else if (hasSeatLimit && !seatIndexes.has(slotIndex)) {
      readyLabel = isOccupied ? '예비 슬롯' : '예비 슬롯';
    } else if (!isOccupied && pendingIndexes.has(slotIndex)) {
      readyLabel = '자동 충원 예정';
    }

    return {
      key: `${entry.slotId || index}-${entry.heroId || index}`,
      label: `${roleLabel} · ${heroLabel}`,
      status: readyLabel,
    };
  });
}

export default function MatchReadyClient({ gameId }) {
  const router = useRouter();
  const { state, refresh, allowStart, missingKey, diagnostics } = useMatchReadyState(gameId);
  const [showGame, setShowGame] = useState(false);
  const [voteNotice, setVoteNotice] = useState('');
  const [readyBusy, setReadyBusy] = useState(false);
  const [readyError, setReadyError] = useState('');
  const [readyCountdownMs, setReadyCountdownMs] = useState(null);
  const [readyTimeoutBusy, setReadyTimeoutBusy] = useState(false);
  const readySignalControllerRef = useRef(null);
  const readyTimeoutTriggeredRef = useRef(false);
  const autoOpenRef = useRef(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const metaLines = useMemo(() => buildMetaLines(state), [state]);
  const asyncFillInfo = useMemo(
    () => state?.sessionMeta?.asyncFill || null,
    [state?.sessionMeta?.asyncFill]
  );
  const rosterDisplay = useMemo(
    () => buildRosterDisplay(state?.roster, state?.viewer, state?.room?.blindMode, asyncFillInfo),
    [state?.roster, state?.viewer, state?.room?.blindMode, asyncFillInfo]
  );
  const asyncFillSummary = useMemo(() => {
    if (!asyncFillInfo || asyncFillInfo.mode !== 'off') return null;
    const seatLimit = asyncFillInfo.seatLimit || {};
    const allowed = Number(seatLimit.allowed) || 0;
    const total = Number(seatLimit.total) || 0;
    const pendingCount = Array.isArray(asyncFillInfo.pendingSeatIndexes)
      ? asyncFillInfo.pendingSeatIndexes.length
      : 0;
    const queue = Array.isArray(asyncFillInfo.fillQueue) ? asyncFillInfo.fillQueue : [];
    return {
      role: asyncFillInfo.hostRole || '역할 미지정',
      allowed,
      total,
      pendingCount,
      queue,
    };
  }, [asyncFillInfo]);

  const viewerIdentity = useMemo(() => getViewerIdentity(state), [state]);
  const viewerOwnerId = useMemo(() => {
    if (state?.viewer?.ownerId !== null && state?.viewer?.ownerId !== undefined) {
      const trimmed = String(state.viewer.ownerId).trim();
      if (trimmed) return trimmed;
    }
    return '';
  }, [state?.viewer?.ownerId]);

  const sessionId = useMemo(() => {
    if (state?.sessionId !== null && state?.sessionId !== undefined) {
      const trimmed = String(state.sessionId).trim();
      if (trimmed) return trimmed;
    }
    if (state?.sessionHistory?.sessionId) {
      const trimmed = String(state.sessionHistory.sessionId).trim();
      if (trimmed) return trimmed;
    }
    return '';
  }, [state?.sessionId, state?.sessionHistory?.sessionId]);

  const matchInstanceId = useMemo(() => {
    if (state?.matchInstanceId !== null && state?.matchInstanceId !== undefined) {
      const trimmed = String(state.matchInstanceId).trim();
      if (trimmed) return trimmed;
    }
    if (state?.snapshot?.match?.matchInstanceId) {
      const trimmed = String(state.snapshot.match.matchInstanceId).trim();
      if (trimmed) return trimmed;
    }
    if (state?.snapshot?.match?.match_instance_id) {
      const trimmed = String(state.snapshot.match.match_instance_id).trim();
      if (trimmed) return trimmed;
    }
    return '';
  }, [
    state?.matchInstanceId,
    state?.snapshot?.match?.matchInstanceId,
    state?.snapshot?.match?.match_instance_id,
  ]);

  const readyCheck = state?.sessionMeta?.extras?.readyCheck || null;
  const readyStatus = typeof readyCheck?.status === 'string' ? readyCheck.status : 'idle';
  const readyWindowActive = readyStatus === 'pending' || readyStatus === 'ready';
  const readyExpiresAtMsRaw = Number(readyCheck?.expiresAtMs);
  const readyExpiresAtMs = Number.isFinite(readyExpiresAtMsRaw) ? readyExpiresAtMsRaw : null;
  const readyReadyIds = Array.isArray(readyCheck?.readyOwnerIds)
    ? readyCheck.readyOwnerIds.map(id => String(id))
    : [];
  const readyMissingIds = Array.isArray(readyCheck?.missingOwnerIds)
    ? readyCheck.missingOwnerIds.map(id => String(id))
    : [];
  const viewerReady = viewerOwnerId ? readyReadyIds.includes(viewerOwnerId) : false;
  const totalReady = Number.isFinite(Number(readyCheck?.readyCount))
    ? Number(readyCheck.readyCount)
    : readyReadyIds.length;
  const totalCount = Number.isFinite(Number(readyCheck?.totalCount))
    ? Number(readyCheck.totalCount)
    : readyReadyIds.length + readyMissingIds.length;
  const readyProgressLabel =
    totalCount > 0 ? `${Math.min(totalReady, totalCount)}/${totalCount}` : '';
  const readyCountdownSeconds =
    readyCountdownMs != null ? Math.max(0, Math.ceil(readyCountdownMs / 1000)) : null;

  const diagnosticsRosterLabel = useMemo(() => {
    if (!diagnostics?.rosterCount) return '0';
    if (!Number.isFinite(Number(diagnostics.readyCount))) {
      return String(diagnostics.rosterCount);
    }
    return `${diagnostics.readyCount}/${diagnostics.rosterCount}`;
  }, [diagnostics?.readyCount, diagnostics?.rosterCount]);

  const handleToggleDiagnostics = useCallback(() => {
    setShowDiagnostics(prev => !prev);
  }, []);

  const appliedTurnTimerSeconds = useMemo(() => {
    const metaSeconds = Number(state?.sessionMeta?.turnTimer?.baseSeconds);
    if (Number.isFinite(metaSeconds) && metaSeconds > 0) {
      return Math.floor(metaSeconds);
    }
    return null;
  }, [state?.sessionMeta?.turnTimer?.baseSeconds]);

  const voteSnapshot = useMemo(
    () => sanitizeTurnTimerVote(state?.sessionMeta?.vote?.turnTimer),
    [state?.sessionMeta?.vote?.turnTimer]
  );

  const viewerSelection = useMemo(() => {
    if (!viewerIdentity) return null;
    return sanitizeSecondsOption(voteSnapshot.voters?.[viewerIdentity]);
  }, [viewerIdentity, voteSnapshot.voters]);

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const resolveAccessToken = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        const tokenValue = data?.session?.access_token;
        if (tokenValue) {
          return String(tokenValue).trim();
        }
      }
    } catch (error) {
      // ignore session resolution failures
    }
    return '';
  }, []);

  const handleReturnToRoom = useCallback(() => {
    if (state?.room?.id) {
      router.push(`/rooms/${state.room.id}`).catch(() => {});
      return;
    }
    router.push('/match').catch(() => {});
  }, [router, state?.room?.id]);

  const handleReadySignal = useCallback(async () => {
    if (!allowStart || readyBusy) return;
    if (!sessionId) {
      setReadyError('세션 정보가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      addDebugEvent({
        level: 'warn',
        source: 'match-ready',
        message: 'Ready signal blocked: missing sessionId',
        details: {
          gameId,
          matchInstanceId: matchInstanceId || null,
          viewerOwnerId,
        },
      });
      refresh().catch(() => {});
      return;
    }

    if (readySignalControllerRef.current) {
      try {
        readySignalControllerRef.current.abort();
      } catch (error) {
        // ignore abort failures
      }
    }

    const controller = new AbortController();
    readySignalControllerRef.current = controller;
    setReadyBusy(true);
    setReadyError('');

    try {
      const response = await requestMatchReadySignal({
        sessionId,
        gameId,
        matchInstanceId: matchInstanceId || null,
        windowSeconds: 15,
        signal: controller.signal,
      });

      if (response?.readyCheck) {
        const currentExtras =
          state?.sessionMeta?.extras && typeof state.sessionMeta.extras === 'object'
            ? state.sessionMeta.extras
            : {};
        const mergedExtras = { ...currentExtras, readyCheck: response.readyCheck };
        setGameMatchSessionMeta(gameId, {
          extras: mergedExtras,
          source: 'match-ready-ready-check',
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('[MatchReadyClient] 준비 신호 전송 실패:', error);
        const supabaseMessage =
          error?.payload?.supabaseError?.message ||
          error?.payload?.supabaseError?.details ||
          error?.payload?.error ||
          error?.message;
        const payloadError =
          error?.payload?.error ||
          error?.payload?.code ||
          error?.payload?.supabaseError?.code ||
          error?.payload?.supabaseError?.error ||
          '';
        const normalizedError = typeof payloadError === 'string' ? payloadError.trim() : '';

        if (normalizedError === 'missing_access_token' || normalizedError === 'unauthorized') {
          setReadyError(
            '세션 인증이 만료되었습니다. 페이지를 새로고침하거나 다시 로그인해 주세요.'
          );
          refresh().catch(() => {});
        } else if (normalizedError === 'forbidden') {
          setReadyError('이 매치에 참여할 권한이 없습니다. 매치 초대 상태를 확인해 주세요.');
        } else if (normalizedError === 'session_not_found') {
          setReadyError('세션을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
          refresh().catch(() => {});
        } else {
          setReadyError(
            supabaseMessage
              ? `준비 신호 실패: ${supabaseMessage}`
              : '준비 신호를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          );
        }
      }
    } finally {
      if (readySignalControllerRef.current === controller) {
        readySignalControllerRef.current = null;
      }
      setReadyBusy(false);
    }
  }, [
    allowStart,
    readyBusy,
    sessionId,
    gameId,
    matchInstanceId,
    state?.sessionMeta?.extras,
    refresh,
    viewerOwnerId,
  ]);

  const handleReadyTimeoutReplacement = useCallback(async () => {
    if (readyTimeoutBusy) return;
    if (!allowStart) return;
    if (!matchInstanceId) return;
    if (!gameId) return;
    if (!readyMissingIds.length) return;

    setReadyTimeoutBusy(true);

    try {
      const token = await resolveAccessToken();
      if (!token) {
        setReadyError('세션 인증이 만료되었습니다. 페이지를 새로고침한 뒤 다시 로그인해 주세요.');
        readyTimeoutTriggeredRef.current = false;
        return;
      }

      const response = await fetch('/api/rank/ready-timeout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          match_instance_id: matchInstanceId,
          game_id: gameId,
          room_id: state?.room?.id || null,
          missing_owner_ids: readyMissingIds,
        }),
      });

      const text = await response.text().catch(() => '');
      const data = safeJsonParse(text) || {};

      if (!response.ok) {
        const message = data?.error || 'ready_timeout_failed';
        setReadyError(
          '준비하지 않은 참가자를 대역으로 교체하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        );
        addDebugEvent({
          level: 'warn',
          source: 'ready-timeout',
          message: 'Ready timeout stand-in request failed',
          details: {
            status: response.status,
            error: message,
            hint: data?.hint || null,
          },
        });
        readyTimeoutTriggeredRef.current = false;
        return;
      }

      const currentExtras =
        state?.sessionMeta?.extras && typeof state.sessionMeta.extras === 'object'
          ? state.sessionMeta.extras
          : {};

      const mergedExtras = {
        ...currentExtras,
        readyTimeout: {
          triggeredAt: Date.now(),
          assignments: Array.isArray(data.assignments) ? data.assignments : [],
          placeholders: Number.isFinite(Number(data.placeholders)) ? Number(data.placeholders) : 0,
          diagnostics: data.diagnostics || null,
        },
      };

      if (currentExtras.readyCheck) {
        mergedExtras.readyCheck = currentExtras.readyCheck;
      }
      if (readyCheck) {
        mergedExtras.readyCheck = readyCheck;
      }

      setGameMatchSessionMeta(gameId, {
        extras: mergedExtras,
        source: 'match-ready-timeout',
      });

      addDebugEvent({
        level: 'info',
        source: 'ready-timeout',
        message: 'Ready timeout stand-in triggered',
        details: {
          assignments: Array.isArray(data.assignments) ? data.assignments.length : 0,
          placeholders: Number.isFinite(Number(data.placeholders)) ? Number(data.placeholders) : 0,
        },
      });

      readyTimeoutTriggeredRef.current = false;
      refresh().catch(() => {});
    } catch (error) {
      console.error('[MatchReadyClient] ready-timeout replacement failed:', error);
      setReadyError(
        '준비하지 않은 참가자를 대역으로 교체하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
      addDebugEvent({
        level: 'error',
        source: 'ready-timeout',
        message: 'Ready timeout replacement threw',
        details: { message: error?.message || 'unknown_error' },
      });
      readyTimeoutTriggeredRef.current = false;
    } finally {
      setReadyTimeoutBusy(false);
    }
  }, [
    readyTimeoutBusy,
    allowStart,
    matchInstanceId,
    gameId,
    readyMissingIds,
    resolveAccessToken,
    state?.room?.id,
    state?.sessionMeta?.extras,
    readyCheck,
    refresh,
  ]);

  const handleStart = useCallback(() => {
    if (!gameId) return;
    if (readyStatus === 'ready' && viewerReady) {
      setShowGame(true);
      return;
    }
    handleReadySignal();
  }, [gameId, readyStatus, viewerReady, handleReadySignal]);

  useEffect(() => {
    if (showGame) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [showGame]);

  useEffect(() => {
    if (!allowStart && showGame) {
      setShowGame(false);
    }
  }, [allowStart, showGame]);

  useEffect(() => {
    if (!voteNotice) return undefined;
    const timer = setTimeout(() => {
      setVoteNotice('');
    }, 2800);
    return () => clearTimeout(timer);
  }, [voteNotice]);

  useEffect(() => {
    if (!readyWindowActive || !readyExpiresAtMs) {
      setReadyCountdownMs(null);
      return undefined;
    }
    const update = () => {
      setReadyCountdownMs(Math.max(0, readyExpiresAtMs - Date.now()));
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [readyWindowActive, readyExpiresAtMs]);

  useEffect(() => {
    if (!readyWindowActive || readyStatus === 'ready') {
      readyTimeoutTriggeredRef.current = false;
      return;
    }

    if (readyTimeoutBusy) {
      return;
    }

    if (!readyMissingIds.length) {
      readyTimeoutTriggeredRef.current = false;
      return;
    }

    if (readyCountdownSeconds != null && readyCountdownSeconds <= 0) {
      if (!readyTimeoutTriggeredRef.current) {
        readyTimeoutTriggeredRef.current = true;
        handleReadyTimeoutReplacement();
      }
    } else {
      readyTimeoutTriggeredRef.current = false;
    }
  }, [
    readyWindowActive,
    readyStatus,
    readyCountdownSeconds,
    readyMissingIds,
    handleReadyTimeoutReplacement,
    readyTimeoutBusy,
  ]);

  useEffect(() => {
    if (!allowStart) {
      autoOpenRef.current = false;
      return;
    }
    if (readyStatus === 'ready') {
      if (viewerReady && !autoOpenRef.current) {
        autoOpenRef.current = true;
        setShowGame(true);
      }
    } else {
      autoOpenRef.current = false;
    }
  }, [allowStart, readyStatus, viewerReady]);

  useEffect(() => {
    if (!readyWindowActive) {
      setReadyError('');
      setReadyCountdownMs(null);
    }
  }, [readyWindowActive]);

  useEffect(
    () => () => {
      if (readySignalControllerRef.current) {
        try {
          readySignalControllerRef.current.abort();
        } catch (error) {
          // ignore abort failures
        }
        readySignalControllerRef.current = null;
      }
    },
    []
  );

  const handleVoteSelection = useCallback(
    seconds => {
      const normalized = sanitizeSecondsOption(seconds);
      if (!normalized || !gameId) return;

      const now = Date.now();
      setGameMatchSessionMeta(gameId, {
        turnTimer: {
          baseSeconds: normalized,
          source: 'match-ready-vote',
          updatedAt: now,
        },
        vote: buildTurnTimerVotePatch(state?.sessionMeta?.vote, normalized, viewerIdentity),
        source: 'match-ready-client',
      });

      refresh();
      setVoteNotice(`${formatSecondsLabel(normalized)} 제한시간이 적용되었습니다.`);
    },
    [gameId, refresh, state?.sessionMeta?.vote, viewerIdentity]
  );

  const voteCounts = useMemo(() => {
    const entries = Object.entries(voteSnapshot.selections || {})
      .map(([key, value]) => {
        const option = sanitizeSecondsOption(key);
        const count = Number(value);
        if (!option || !Number.isFinite(count) || count <= 0) return null;
        return { option, count: Math.floor(count) };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || a.option - b.option);
    return entries;
  }, [voteSnapshot.selections]);

  const readyHint = useMemo(() => {
    if (readyError) return readyError;
    if (readyStatus === 'ready') {
      if (viewerReady) {
        return readyProgressLabel
          ? `모든 참가자가 준비되었습니다 (${readyProgressLabel}). 본게임 화면을 여는 중입니다.`
          : '모든 참가자가 준비되었습니다. 본게임 화면을 여는 중입니다.';
      }
      return readyProgressLabel
        ? `모든 참가자가 준비되었습니다 (${readyProgressLabel}).`
        : '모든 참가자가 준비되었습니다.';
    }
    if (readyWindowActive) {
      if (viewerReady) {
        if (readyCountdownSeconds != null) {
          return readyProgressLabel
            ? `다른 참가자를 기다리는 중… (${readyProgressLabel}) 남은 시간 ${readyCountdownSeconds}초`
            : `다른 참가자를 기다리는 중… 남은 시간 ${readyCountdownSeconds}초`;
        }
        return readyProgressLabel
          ? `다른 참가자를 기다리는 중입니다. (${readyProgressLabel})`
          : '다른 참가자를 기다리는 중입니다.';
      }
      if (readyCountdownSeconds != null) {
        return readyProgressLabel
          ? `준비 버튼을 눌러 주세요 (${readyProgressLabel}). 남은 시간 ${readyCountdownSeconds}초`
          : `준비 버튼을 눌러 주세요. 남은 시간 ${readyCountdownSeconds}초`;
      }
      return '게임 화면을 열기 전에 준비 버튼을 눌러 주세요.';
    }
    return '';
  }, [
    readyError,
    readyStatus,
    readyWindowActive,
    viewerReady,
    readyCountdownSeconds,
    readyProgressLabel,
  ]);

  const readyHintClassName = useMemo(() => {
    if (!readyHint) return '';
    if (readyError) return styles.readyHintError;
    if (readyStatus === 'ready') return styles.readyHintSuccess;
    return styles.readyHint;
  }, [readyHint, readyError, readyStatus]);

  const startButtonLabel = useMemo(() => {
    if (readyTimeoutBusy) return '대역 교체 중…';

    const countdownSuffix =
      readyWindowActive && readyCountdownSeconds != null
        ? ` (${Math.max(0, readyCountdownSeconds)}초)`
        : '';

    if (!allowStart) return `게임 화면 열기${countdownSuffix}`;
    if (readyStatus === 'ready') return '게임 화면 열기';
    if (readyWindowActive) {
      if (viewerReady) return `대기 중${countdownSuffix}`;
      const baseLabel = readyBusy ? '준비 중…' : '준비하기';
      return `${baseLabel}${countdownSuffix}`;
    }
    return readyBusy ? '준비 중…' : '게임 화면 열기';
  }, [
    allowStart,
    readyStatus,
    readyWindowActive,
    viewerReady,
    readyBusy,
    readyCountdownSeconds,
    readyTimeoutBusy,
  ]);

  const disableStartButton =
    !allowStart ||
    readyBusy ||
    readyTimeoutBusy ||
    (readyWindowActive && viewerReady && readyStatus !== 'ready');

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>
              {state?.room?.mode ? `${state.room.mode} 매치 준비` : '매치 준비'}
            </h1>
            <p className={styles.subtitle}>
              {state?.room?.code
                ? `코드 ${state.room.code} · 참가자 ${state.rosterReadyCount}/${state.totalSlots}`
                : '방 정보를 확인하고 있습니다.'}
            </p>
          </div>
          <div className={styles.headerControls}>
            <div className={styles.actionsInline}>
              <button type="button" className={styles.secondaryButton} onClick={handleRefresh}>
                정보 새로고침
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleReturnToRoom}>
                방으로 돌아가기
              </button>
            </div>
            <div className={styles.diagnosticsToolbar}>
              <button
                type="button"
                className={styles.diagnosticsToggle}
                onClick={handleToggleDiagnostics}
              >
                {showDiagnostics ? '디버그 닫기' : '디버그 보기'}
              </button>
              <div className={styles.diagnosticsSummary}>
                <span className={styles.diagnosticsSummaryLabel}>세션</span>
                <span className={styles.diagnosticsSummaryValue}>
                  {diagnostics?.sessionId ? diagnostics.sessionId : '없음'}
                </span>
              </div>
              <div className={styles.diagnosticsSummary}>
                <span className={styles.diagnosticsSummaryLabel}>실시간</span>
                <span className={styles.diagnosticsSummaryValue}>
                  {formatRealtimeStatus(diagnostics?.realtime)}
                </span>
              </div>
              <div className={styles.diagnosticsSummary}>
                <span className={styles.diagnosticsSummaryLabel}>착석</span>
                <span className={styles.diagnosticsSummaryValue}>{diagnosticsRosterLabel}</span>
              </div>
            </div>
          </div>
        </header>

        {metaLines.length > 0 && (
          <section className={styles.meta}>
            {metaLines.map(line => (
              <p key={line} className={styles.metaLine}>
                {line}
              </p>
            ))}
          </section>
        )}

        {showDiagnostics && (
          <section className={styles.diagnosticsPanel} data-testid="match-ready-diagnostics">
            <h2 className={styles.diagnosticsTitle}>진단 정보</h2>
            <dl className={styles.diagnosticsGrid}>
              <div className={styles.diagnosticsItem}>
                <dt>세션 ID</dt>
                <dd>{diagnostics?.sessionId || '없음'}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>룸 ID</dt>
                <dd>{diagnostics?.roomId || '없음'}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>마지막 스냅샷</dt>
                <dd>{formatDiagnosticsTimestamp(diagnostics?.lastSnapshotAt)}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>마지막 새로고침</dt>
                <dd>{formatDiagnosticsTimestamp(diagnostics?.lastRefreshAt)}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>요청 상태</dt>
                <dd>{diagnostics?.pendingRefresh ? '진행 중' : '대기'}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>실시간 상태</dt>
                <dd>{formatRealtimeStatus(diagnostics?.realtime)}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>실시간 최신 이벤트</dt>
                <dd>{formatRealtimeEventSummary(diagnostics?.realtime?.lastEvent)}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>세션 메타 업데이트</dt>
                <dd>{formatDiagnosticsTimestamp(diagnostics?.sessionMetaUpdatedAt)}</dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>턴 상태 버전</dt>
                <dd>
                  {diagnostics?.turnStateVersion != null
                    ? diagnostics.turnStateVersion
                    : '알 수 없음'}
                </dd>
              </div>
              <div className={styles.diagnosticsItem}>
                <dt>활성 키 보유</dt>
                <dd>{diagnostics?.hasActiveKey ? '예' : '아니요'}</dd>
              </div>
            </dl>
            {diagnostics?.lastRefreshError && (
              <p className={styles.diagnosticsError}>
                마지막 새로고침 오류: {diagnostics.lastRefreshError}
              </p>
            )}
            {diagnostics?.lastRefreshHint && (
              <p className={styles.diagnosticsHint}>{diagnostics.lastRefreshHint}</p>
            )}
            {diagnostics?.realtime?.lastError && (
              <p className={styles.diagnosticsError}>
                실시간 채널 오류: {diagnostics.realtime.lastError?.message || 'unknown_error'}
              </p>
            )}
            {diagnostics?.realtime?.lastError?.hint && (
              <p className={styles.diagnosticsHint}>{diagnostics.realtime.lastError.hint}</p>
            )}
          </section>
        )}

        {state?.room?.blindMode ? (
          <section className={styles.bannerInfo}>
            <p className={styles.bannerTitle}>블라인드 모드가 활성화된 매치입니다.</p>
            <p className={styles.bannerBody}>
              전투가 시작되기 전까지는 다른 참가자의 캐릭터 정보가 공개되지 않습니다. 준비를 마친 뒤
              메인 게임으로 이동하면 전체 로스터가 표시됩니다.
            </p>
          </section>
        ) : null}

        {missingKey && (
          <section className={styles.bannerWarning}>
            <p className={styles.bannerTitle}>활성화된 AI API 키가 필요합니다.</p>
            <p className={styles.bannerBody}>
              방 찾기 헤더에서 API 키를 등록하고 사용 설정해야 전투를 시작할 수 있습니다.
            </p>
          </section>
        )}

        <section className={styles.voteSection}>
          <div className={styles.voteHeader}>
            <h2 className={styles.sectionTitle}>턴 제한시간 투표</h2>
            <p className={styles.voteDescription}>
              참가자들이 원하는 제한시간을 선택하면 메인 게임의 기본 타이머로 적용됩니다.
            </p>
          </div>
          <div className={styles.voteOptions}>
            {TURN_TIMER_OPTIONS.map(option => {
              const seconds = sanitizeSecondsOption(option);
              if (!seconds) return null;
              const isApplied = appliedTurnTimerSeconds === seconds;
              const isMine = viewerSelection === seconds;
              const summary = voteCounts.find(entry => entry.option === seconds);
              return (
                <button
                  key={seconds}
                  type="button"
                  className={`${styles.voteOptionButton} ${
                    isApplied ? styles.voteOptionButtonActive : ''
                  }`}
                  onClick={() => handleVoteSelection(seconds)}
                >
                  <span className={styles.voteOptionLabel}>{formatSecondsLabel(seconds)}</span>
                  <span className={styles.voteOptionHint}>
                    {isApplied ? '적용 중' : isMine ? '내 선택' : '선택'}
                  </span>
                  {summary ? (
                    <span className={styles.voteOptionBadge}>{summary.count}표</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className={styles.voteSummary}>
            <p className={styles.voteSummaryLine}>
              현재 적용된 제한시간: {formatSecondsLabel(appliedTurnTimerSeconds || 60)}
              {appliedTurnTimerSeconds ? '' : ' (기본값)'}
            </p>
            {voteCounts.length > 0 ? (
              <p className={styles.voteSummaryLine}>
                선호도 순위:{' '}
                {voteCounts
                  .map(entry => `${formatSecondsLabel(entry.option)} ${entry.count}표`)
                  .join(' · ')}
              </p>
            ) : (
              <p className={styles.voteSummaryLine}>
                아직 저장된 투표가 없습니다. 원하는 제한시간을 선택해 주세요.
              </p>
            )}
            {voteNotice ? <p className={styles.voteNotice}>{voteNotice}</p> : null}
          </div>
        </section>

        <section className={styles.rosterSection}>
          <h2 className={styles.sectionTitle}>참가자 구성</h2>
          <ul className={styles.rosterList}>
            {rosterDisplay.map(entry => (
              <li key={entry.key} className={styles.rosterItem}>
                <span className={styles.rosterLabel}>{entry.label}</span>
                <span className={styles.rosterStatus}>{entry.status}</span>
              </li>
            ))}
          </ul>
          {asyncFillSummary ? (
            <div className={styles.asyncFillSummary}>
              <div className={styles.asyncFillTitle}>비실시간 자동 충원</div>
              <p className={styles.asyncFillText}>
                {`${asyncFillSummary.role} 좌석 ${asyncFillSummary.allowed}/${asyncFillSummary.total} · 대기 슬롯 ${asyncFillSummary.pendingCount}개`}
              </p>
              {asyncFillSummary.queue.length ? (
                <div className={styles.asyncFillQueue}>
                  <span className={styles.asyncFillQueueLabel}>대기 후보:</span>
                  <span className={styles.asyncFillQueueNames}>
                    {asyncFillSummary.queue
                      .map(candidate => candidate.heroName || candidate.ownerId)
                      .join(', ')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStart}
            disabled={disableStartButton}
          >
            {startButtonLabel}
          </button>
          {readyHint ? (
            <p className={`${styles.footerHint} ${readyHintClassName}`}>{readyHint}</p>
          ) : null}
          {!allowStart && state?.snapshot && (
            <p className={styles.footerHint}>
              {!state.hasActiveKey
                ? 'AI API 키를 사용 설정한 뒤 다시 시도해 주세요.'
                : '참가자 정보를 준비하고 있습니다.'}
            </p>
          )}
        </footer>
      </div>
      {showGame ? (
        <div className={styles.overlayRoot}>
          <div className={styles.overlayBackdrop} />
          <div className={styles.overlayContent}>
            <div className={styles.overlayScrollArea}>
              <StartClient gameId={gameId} onRequestClose={() => setShowGame(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
