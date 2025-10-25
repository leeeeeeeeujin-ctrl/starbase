'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

import styles from './StartClient.module.css';
import RosterPanel from './RosterPanel';
import TurnInfoPanel from './TurnInfoPanel';
import TurnSummaryPanel from './TurnSummaryPanel';
import ManualResponsePanel from './ManualResponsePanel';
import StatusBanner from './StatusBanner';
import {
  clearMatchFlow,
  createEmptyMatchFlowState,
  readMatchFlowState,
} from '../../../lib/rank/matchFlow';
import { subscribeGameMatchData } from '../../../modules/rank/matchDataStore';
import { normalizeRoleName } from '../../../lib/rank/roleLayoutLoader';
import { useStartClientEngine } from './useStartClientEngine';
import { supabase } from '../../../lib/supabase';
import { buildSessionMetaRequest, postSessionMeta } from '../../../lib/rank/sessionMetaClient';

function toTrimmedId(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function toSlotIndex(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function buildParticipantRoster(participants) {
  if (!Array.isArray(participants)) return [];
  return participants
    .map((participant, index) => {
      if (!participant) return null;
      const hero = participant.hero || {};
      const heroId =
        toTrimmedId(participant.heroId ?? participant.hero_id ?? participant.heroID ?? hero.id) ||
        null;
      const ownerId =
        toTrimmedId(
          participant.ownerId ??
            participant.owner_id ??
            participant.ownerID ??
            participant.owner?.id ??
            participant.user_id ??
            participant.userId
        ) || null;
      const slotIndex = toSlotIndex(participant.slotIndex ?? participant.slot_index, index);
      const role = participant.role || participant.role_name || '';
      const heroName =
        hero.name ?? participant.hero_name ?? participant.heroName ?? participant.displayName ?? '';
      const avatarUrl =
        hero.avatar_url ??
        hero.image_url ??
        participant.hero_avatar_url ??
        participant.avatar_url ??
        participant.avatarUrl ??
        null;
      return {
        slotIndex,
        role,
        heroId,
        ownerId,
        heroName,
        avatarUrl,
        ready: participant.ready === true,
      };
    })
    .filter(Boolean);
}

function buildMatchRoster(roster) {
  if (!Array.isArray(roster)) return [];
  return roster
    .map((entry, index) => {
      if (!entry) return null;
      const heroId = toTrimmedId(entry.heroId ?? entry.hero_id);
      const ownerId = toTrimmedId(entry.ownerId ?? entry.owner_id);
      const slotIndex = toSlotIndex(entry.slotIndex ?? entry.slot_index, index);
      return {
        slotIndex,
        role: entry.role || '',
        heroId,
        ownerId,
        heroName: entry.heroName || entry.hero_name || '',
        avatarUrl: entry.avatarUrl ?? entry.avatar_url ?? null,
        ready: entry.ready === true,
      };
    })
    .filter(Boolean);
}

function mergeRosterEntries(primary, fallback) {
  if (!primary.length) return fallback;
  return primary.map(entry => {
    const candidate = fallback.find(target => {
      if (!target) return false;
      if (entry.heroId && target.heroId && entry.heroId === target.heroId) return true;
      if (entry.ownerId && target.ownerId && entry.ownerId === target.ownerId) return true;
      return false;
    });
    if (!candidate) {
      return entry;
    }
    return {
      ...entry,
      role: entry.role || candidate.role || '',
      heroName: entry.heroName || candidate.heroName || '',
      avatarUrl: entry.avatarUrl || candidate.avatarUrl || null,
      ready: entry.ready || candidate.ready || false,
    };
  });
}

function findRosterEntry(roster, { heroId = null, ownerId = null } = {}) {
  if (!Array.isArray(roster) || roster.length === 0) return null;
  return (
    roster.find(entry => {
      if (!entry) return false;
      if (heroId && entry.heroId && entry.heroId === heroId) return true;
      if (ownerId && entry.ownerId && entry.ownerId === ownerId) return true;
      return false;
    }) || null
  );
}

function formatSlotSource({ standin = false, matchSource = '' } = {}) {
  if (standin) return '대역';
  if (!matchSource) return '';
  const normalized = String(matchSource).trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'host') return '호스트';
  if (normalized === 'queue') return '큐';
  if (normalized === 'participant_pool') return '참여자 풀';
  if (normalized === 'requeue') return '재합류';
  if (normalized === 'matchmaking') return '매칭';
  return matchSource;
}

const LogsPanel = dynamic(() => import('./LogsPanel'), {
  loading: () => <div className={styles.logsLoading}>로그 패널을 불러오는 중…</div>,
  ssr: false,
});

function buildSessionMeta(state) {
  if (!state) return [];
  const meta = [];
  if (state?.room?.code) {
    meta.push({ label: '방 코드', value: state.room.code });
  }
  if (state?.matchMode) {
    meta.push({ label: '매치 모드', value: state.matchMode });
  }
  if (state?.snapshot?.match?.matchType) {
    meta.push({ label: '매치 유형', value: state.snapshot.match.matchType });
  }
  if (
    Number.isFinite(Number(state?.snapshot?.match?.maxWindow)) &&
    Number(state.snapshot.match.maxWindow) > 0
  ) {
    meta.push({ label: '점수 범위', value: `±${Number(state.snapshot.match.maxWindow)}` });
  }
  if (state?.room?.realtimeMode) {
    meta.push({ label: '실시간 옵션', value: state.room.realtimeMode });
  }
  if (state?.rosterReadyCount != null && state?.totalSlots != null) {
    meta.push({ label: '참가자', value: `${state.rosterReadyCount}/${state.totalSlots}` });
  }
  return meta;
}

function formatHeaderDescription({ state, meta, game }) {
  const lines = [];
  if (game?.description) {
    const trimmed = String(game.description).trim();
    if (trimmed) {
      lines.push(trimmed);
    }
  }
  if (state?.room?.blindMode) {
    lines.push('블라인드 방에서 전투를 시작합니다. 이제 모든 참가자 정보가 공개됩니다.');
  }
  if (meta.length) {
    const summary = meta.map(item => `${item.label}: ${item.value}`).join(' · ');
    lines.push(summary);
  }
  return lines.join(' · ');
}

function toDisplayError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  return '세션을 불러오는 중 오류가 발생했습니다.';
}

export default function StartClient({ gameId: gameIdProp, onRequestClose }) {
  const router = useRouter();
  const trimmedPropId = typeof gameIdProp === 'string' ? gameIdProp.trim() : '';
  const usePropGameId = Boolean(trimmedPropId);
  const [gameId, setGameId] = useState(trimmedPropId);
  const [matchState, setMatchState] = useState(() => createEmptyMatchFlowState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (usePropGameId) {
      setGameId(trimmedPropId);
      setMatchState(readMatchFlowState(trimmedPropId));
      setReady(true);
      return;
    }
    if (!router.isReady) return undefined;
    const { id } = router.query;
    const resolvedId = typeof id === 'string' ? id.trim() : '';
    if (!resolvedId) {
      setGameId('');
      setMatchState(createEmptyMatchFlowState());
      setReady(true);
      return undefined;
    }
    setGameId(resolvedId);
    setMatchState(readMatchFlowState(resolvedId));
    setReady(true);

    return () => {
      clearMatchFlow(resolvedId);
    };
  }, [usePropGameId, trimmedPropId, router.isReady, router.query]);

  useEffect(() => {
    if (!gameId) return undefined;
    const unsubscribe = subscribeGameMatchData(gameId, () => {
      setMatchState(readMatchFlowState(gameId));
    });
    return unsubscribe;
  }, [gameId]);

  const hostOwnerId = useMemo(() => {
    const roomOwner = matchState?.room?.ownerId;
    if (roomOwner !== null && roomOwner !== undefined) {
      const trimmed = String(roomOwner).trim();
      if (trimmed) {
        return trimmed;
      }
    }
    const asyncHost = matchState?.sessionMeta?.asyncFill?.hostOwnerId;
    if (asyncHost !== null && asyncHost !== undefined) {
      const trimmed = String(asyncHost).trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return '';
  }, [matchState?.room?.ownerId, matchState?.sessionMeta?.asyncFill?.hostOwnerId]);

  const engine = useStartClientEngine(gameId, { hostOwnerId });
  const {
    loading: engineLoading,
    error: engineError,
    game,
    participants,
    currentNode,
    preflight,
    turn,
    activeGlobal,
    activeLocal,
    statusMessage,
    promptMetaWarning,
    apiKeyWarning,
    logs,
    aiMemory,
    playerHistories,
    apiKey,
    setApiKey,
    apiKeyCooldown,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    manualResponse,
    setManualResponse,
    isAdvancing,
    isStarting,
    handleStart,
    advanceWithAi,
    advanceWithManual,
    turnTimerSeconds,
    timeRemaining,
    turnDeadline,
    currentActor,
    canSubmitAction,
    sessionInfo,
    realtimePresence,
    realtimeEvents,
    dropInSnapshot,
    sessionOutcome,
    consensus,
    lastDropInTurn,
    turnTimerSnapshot,
    activeBackdropUrls,
    activeActorNames,
  } = engine;

  const sessionMetaSignatureRef = useRef('');
  const turnStateSignatureRef = useRef('');
  const sessionIdRef = useRef(null);

  useEffect(() => {
    const nextSessionId = sessionInfo?.id || null;
    if (sessionIdRef.current !== nextSessionId) {
      sessionIdRef.current = nextSessionId;
      sessionMetaSignatureRef.current = '';
      turnStateSignatureRef.current = '';
    }
  }, [sessionInfo?.id]);

  const sessionMeta = useMemo(() => buildSessionMeta(matchState), [matchState]);
  const headerTitle = useMemo(() => {
    if (game?.name) return game.name;
    if (matchState?.room?.mode) return `${matchState.room.mode} 메인 게임`;
    return '메인 게임';
  }, [game?.name, matchState?.room?.mode]);
  const headerDescription = useMemo(
    () => formatHeaderDescription({ state: matchState, meta: sessionMeta, game }),
    [matchState, sessionMeta, game]
  );

  const handleBackToRoom = useCallback(() => {
    if (typeof onRequestClose === 'function') {
      onRequestClose();
      return;
    }
    if (matchState?.room?.id) {
      router.push(`/rooms/${matchState.room.id}`).catch(() => {});
      return;
    }
    if (gameId) {
      router.push(`/rank/${gameId}`).catch(() => {});
      return;
    }
    router.push('/match').catch(() => {});
  }, [router, matchState?.room?.id, gameId, onRequestClose]);

  const statusMessages = useMemo(() => {
    const messages = [];
    const errorText = toDisplayError(engineError);
    if (errorText) messages.push(errorText);
    if (statusMessage) messages.push(statusMessage);
    if (apiKeyWarning) messages.push(apiKeyWarning);
    if (promptMetaWarning) messages.push(promptMetaWarning);
    const unique = [];
    messages.forEach(message => {
      if (!message) return;
      if (!unique.includes(message)) {
        unique.push(message);
      }
    });
    return unique;
  }, [engineError, statusMessage, apiKeyWarning, promptMetaWarning]);

  useEffect(() => {
    const sessionId = sessionInfo?.id;
    if (!sessionId) return;

    const stateForRequest = {
      sessionMeta: matchState?.sessionMeta || null,
      room: {
        realtimeMode: matchState?.room?.realtimeMode || null,
        id: matchState?.room?.id || null,
      },
      roster: Array.isArray(matchState?.roster) ? matchState.roster : [],
      matchInstanceId: matchState?.matchInstanceId || '',
    };

    const {
      metaPayload,
      turnStateEvent,
      metaSignature,
      turnStateSignature,
      roomId: requestRoomId,
      matchInstanceId: requestMatchInstanceId,
      collaborators: requestCollaborators,
    } = buildSessionMetaRequest({
      state: stateForRequest,
    });

    if (!metaPayload) return;

    const metaChanged = metaSignature && metaSignature !== sessionMetaSignatureRef.current;
    const turnChanged = turnStateSignature && turnStateSignature !== turnStateSignatureRef.current;

    if (!metaChanged && !turnChanged) {
      return;
    }

    sessionMetaSignatureRef.current = metaSignature || '';
    if (turnChanged) {
      turnStateSignatureRef.current = turnStateSignature;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('세션 토큰을 확인하지 못했습니다.');
        }

        await postSessionMeta({
          token,
          sessionId,
          gameId,
          roomId: requestRoomId,
          matchInstanceId: requestMatchInstanceId,
          collaborators: requestCollaborators,
          meta: metaPayload,
          turnStateEvent: turnChanged ? turnStateEvent : null,
          source: 'start-client',
        });
      } catch (error) {
        console.warn('[StartClient] 세션 메타 동기화 실패:', error);
        if (!cancelled) {
          if (metaChanged) {
            sessionMetaSignatureRef.current = '';
          }
          if (turnChanged) {
            turnStateSignatureRef.current = '';
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, matchState?.room?.realtimeMode, matchState?.sessionMeta, sessionInfo?.id]);

  const realtimeLockNotice = useMemo(() => {
    if (!consensus?.active) return '';
    if (consensus.viewerEligible) {
      return `동의 ${consensus.count}/${consensus.required}명 확보 중입니다.`;
    }
    return '다른 참가자의 동의를 기다리고 있습니다.';
  }, [consensus?.active, consensus?.viewerEligible, consensus?.count, consensus?.required]);

  const asyncFillInfo = matchState?.sessionMeta?.asyncFill || null;
  const sessionExtras = matchState?.sessionMeta?.extras || null;
  const isAsyncMode = asyncFillInfo?.mode === 'off';
  const blindMode = Boolean(matchState?.room?.blindMode);
  const rosterEntries = Array.isArray(matchState?.roster) ? matchState.roster : [];
  const matchRosterForChat = useMemo(
    () => buildMatchRoster(matchState?.roster),
    [matchState?.roster]
  );
  const participantRosterForChat = useMemo(
    () => buildParticipantRoster(participants),
    [participants]
  );
  const chatRoster = useMemo(
    () => mergeRosterEntries(matchRosterForChat, participantRosterForChat),
    [matchRosterForChat, participantRosterForChat]
  );
  const viewerOwnerId = useMemo(() => {
    const raw = matchState?.viewer?.ownerId || matchState?.viewer?.viewerId;
    return raw ? String(raw).trim() : '';
  }, [matchState?.viewer?.ownerId, matchState?.viewer?.viewerId]);
  const viewerHeroId = useMemo(() => {
    const direct =
      toTrimmedId(
        matchState?.viewer?.heroId ?? matchState?.viewer?.hero_id ?? matchState?.viewer?.hero?.id
      ) || null;
    if (direct) return direct;
    const ownerCandidate =
      toTrimmedId(matchState?.viewer?.ownerId ?? matchState?.viewer?.viewerId) ||
      (viewerOwnerId ? viewerOwnerId : null);
    if (ownerCandidate) {
      const entry = findRosterEntry(chatRoster, { ownerId: ownerCandidate });
      if (entry?.heroId) {
        return entry.heroId;
      }
    }
    return null;
  }, [
    chatRoster,
    matchState?.viewer?.hero?.id,
    matchState?.viewer?.heroId,
    matchState?.viewer?.hero_id,
    matchState?.viewer?.ownerId,
    matchState?.viewer?.viewerId,
    viewerOwnerId,
  ]);
  const viewerHeroProfile = useMemo(() => {
    const ownerCandidate =
      toTrimmedId(matchState?.viewer?.ownerId ?? matchState?.viewer?.viewerId) ||
      (viewerOwnerId ? viewerOwnerId : null);
    const rosterEntry = findRosterEntry(chatRoster, {
      heroId: viewerHeroId,
      ownerId: ownerCandidate,
    });
    const heroName =
      matchState?.viewer?.heroName ?? matchState?.viewer?.hero?.name ?? rosterEntry?.heroName ?? '';
    const avatarUrl =
      matchState?.viewer?.hero?.avatar_url ??
      matchState?.viewer?.avatarUrl ??
      matchState?.viewer?.avatar_url ??
      rosterEntry?.avatarUrl ??
      null;

    if (!viewerHeroId && !ownerCandidate && !heroName && !avatarUrl) {
      return null;
    }

    return {
      hero_id: viewerHeroId,
      owner_id: ownerCandidate,
      user_id: ownerCandidate || null,
      name: heroName || (viewerHeroId ? `캐릭터 #${viewerHeroId}` : '익명 참가자'),
      avatar_url: avatarUrl || null,
    };
  }, [
    chatRoster,
    matchState?.viewer?.avatarUrl,
    matchState?.viewer?.avatar_url,
    matchState?.viewer?.hero?.avatar_url,
    matchState?.viewer?.hero?.name,
    matchState?.viewer?.heroName,
    matchState?.viewer?.ownerId,
    matchState?.viewer?.viewerId,
    viewerHeroId,
    viewerOwnerId,
  ]);
  const asyncMatchInstanceId = useMemo(() => {
    if (!asyncFillInfo) return null;
    return (
      toTrimmedId(asyncFillInfo.matchInstanceId) ||
      toTrimmedId(asyncFillInfo.match_instance_id) ||
      null
    );
  }, [asyncFillInfo]);
  const extrasMatchInstanceId = useMemo(() => {
    if (!sessionExtras) return null;
    return (
      toTrimmedId(sessionExtras.matchInstanceId) ||
      toTrimmedId(sessionExtras.match_instance_id) ||
      null
    );
  }, [sessionExtras]);
  const sessionInfoMatchInstanceId = useMemo(() => {
    if (!sessionInfo) return null;
    return (
      toTrimmedId(sessionInfo.matchInstanceId) || toTrimmedId(sessionInfo.match_instance_id) || null
    );
  }, [sessionInfo]);
  const hostRoleName = useMemo(() => {
    if (typeof asyncFillInfo?.hostRole === 'string' && asyncFillInfo.hostRole.trim()) {
      return asyncFillInfo.hostRole.trim();
    }
    if (!hostOwnerId) return '';
    const hostEntry = rosterEntries.find(entry => {
      if (!entry) return false;
      const ownerId = entry.ownerId != null ? String(entry.ownerId).trim() : '';
      return ownerId === hostOwnerId;
    });
    return hostEntry?.role ? String(hostEntry.role).trim() : '';
  }, [asyncFillInfo?.hostRole, hostOwnerId, rosterEntries]);
  const normalizedHostRole = useMemo(() => normalizeRoleName(hostRoleName), [hostRoleName]);
  const normalizedViewerRole = useMemo(
    () => normalizeRoleName(matchState?.viewer?.role || ''),
    [matchState?.viewer?.role]
  );
  const restrictedContext = blindMode || isAsyncMode;
  const viewerIsHostOwner = Boolean(hostOwnerId && viewerOwnerId && viewerOwnerId === hostOwnerId);
  const viewerMatchesHostRole = Boolean(
    normalizedHostRole && normalizedViewerRole && normalizedHostRole === normalizedViewerRole
  );
  const viewerMaySeeFull = !restrictedContext || viewerIsHostOwner || viewerMatchesHostRole;
  const viewerCanToggleDetails = restrictedContext && (viewerIsHostOwner || viewerMatchesHostRole);
  const [showRosterDetails, setShowRosterDetails] = useState(() => viewerMaySeeFull);

  useEffect(() => {
    setShowRosterDetails(viewerMaySeeFull);
  }, [viewerMaySeeFull, normalizedHostRole, normalizedViewerRole, restrictedContext]);

  const manualDisabled = preflight || !canSubmitAction;
  const manualDisabledReason = preflight
    ? '먼저 게임을 시작해 주세요.'
    : '현재 차례의 플레이어만 응답을 제출할 수 있습니다.';

  const rosterBySlot = useMemo(() => {
    const roster = Array.isArray(matchState?.roster) ? matchState.roster : [];
    const map = new Map();
    roster.forEach(entry => {
      if (!entry) return;
      const slotIndex = entry.slotIndex != null ? Number(entry.slotIndex) : null;
      if (Number.isFinite(slotIndex)) {
        map.set(slotIndex, entry);
      }
    });
    return map;
  }, [matchState?.roster]);

  const rosterByHeroId = useMemo(() => {
    const roster = Array.isArray(matchState?.roster) ? matchState.roster : [];
    const map = new Map();
    roster.forEach(entry => {
      if (!entry) return;
      if (entry.heroId) {
        map.set(String(entry.heroId).trim(), entry);
      }
    });
    return map;
  }, [matchState?.roster]);

  const scoreboardRooms = useMemo(() => {
    const rooms = matchState?.snapshot?.rooms || matchState?.snapshot?.assignments;
    if (!Array.isArray(rooms) || !rooms.length) return [];
    return rooms.map((room, index) => {
      const slotSources = Array.isArray(room?.slots)
        ? room.slots
        : Array.isArray(room?.roleSlots)
          ? room.roleSlots.map(slot => ({
              role: slot?.role,
              slotIndex: slot?.slotIndex,
              member: slot?.member || (Array.isArray(slot?.members) ? slot.members[0] : null),
            }))
          : Array.isArray(room?.members)
            ? room.members.map(member => ({
                role: member?.role,
                slotIndex: member?.slotIndex,
                member,
              }))
            : [];

      const slots = slotSources.map((slot, slotIndex) => {
        const numericIndex = toSlotIndex(slot?.slotIndex, slotIndex);
        const normalizedHeroId = toTrimmedId(slot?.member?.heroId ?? slot?.member?.hero_id);
        const fallback =
          rosterBySlot.get(numericIndex) ||
          (normalizedHeroId ? rosterByHeroId.get(normalizedHeroId) : null);
        const heroName =
          slot?.member?.heroName || slot?.member?.hero_name || fallback?.heroName || '';
        const role = slot?.role || fallback?.role || '';
        const standin = slot?.member?.standin === true || fallback?.standin === true;
        const matchSource =
          slot?.member?.matchSource || slot?.member?.match_source || fallback?.matchSource || '';
        const ready = slot?.member?.ready === true || fallback?.ready === true;
        return {
          slotIndex: numericIndex,
          role,
          heroName: heroName || '빈 슬롯',
          standin,
          matchSource,
          ready,
        };
      });

      return {
        id: toTrimmedId(room?.id) || `room-${index + 1}`,
        label: room?.label || `룸 ${index + 1}`,
        anchorScore: room?.anchorScore ?? room?.anchor_score ?? null,
        ready: room?.ready === true,
        slots,
      };
    });
  }, [
    matchState?.snapshot?.rooms,
    matchState?.snapshot?.assignments,
    rosterByHeroId,
    rosterBySlot,
  ]);

  const roleBuckets = useMemo(() => {
    const raw = matchState?.snapshot?.roleBuckets || matchState?.snapshot?.role_buckets;
    if (!Array.isArray(raw)) return [];
    return raw.map((bucket, index) => {
      const roleName = bucket?.role || bucket?.name || `역할 ${index + 1}`;
      const total = Number(
        bucket?.total ?? bucket?.slotCount ?? bucket?.slot_count ?? bucket?.totalSlots
      );
      const filled = Number(bucket?.filled ?? bucket?.filledSlots ?? bucket?.filled_slots);
      const missing = Number(bucket?.missing ?? bucket?.missingSlots ?? bucket?.missing_slots);
      return {
        role: roleName,
        total: Number.isFinite(total) ? total : 0,
        filled: Number.isFinite(filled) ? filled : 0,
        missing: Number.isFinite(missing) ? missing : 0,
        ready: bucket?.ready === true,
      };
    });
  }, [matchState?.snapshot?.roleBuckets, matchState?.snapshot?.role_buckets]);

  const hasRoleSummary = roleBuckets.some(bucket => bucket.total > 0);

  const pageStyle = useMemo(() => {
    const baseGradient =
      'radial-gradient(circle at top, rgba(16,26,51,0.92) 0%, rgba(4,7,18,0.96) 55%, rgba(2,4,10,1) 100%)';
    const heroLayers = Array.isArray(activeBackdropUrls)
      ? activeBackdropUrls
          .map(url => (typeof url === 'string' ? url.trim() : ''))
          .filter(Boolean)
          .map(url => `url(${url})`)
      : [];
    return {
      backgroundImage: [baseGradient, ...heroLayers].join(', '),
      backgroundSize: ['cover', ...heroLayers.map(() => 'cover')].join(', '),
      backgroundPosition: ['center', ...heroLayers.map(() => 'center')].join(', '),
      backgroundRepeat: ['no-repeat', ...heroLayers.map(() => 'no-repeat')].join(', '),
    };
  }, [activeBackdropUrls]);

  const startLabel = isStarting ? '준비 중…' : preflight ? '게임 시작' : '다시 시작';
  const nextLabel = isAdvancing ? '진행 중…' : '다음 턴';
  const advanceDisabled = preflight || !sessionInfo?.id || engineLoading;
  const startButtonDisabled = isStarting || engineLoading;
  const consensusStatus = consensus?.active
    ? consensus.viewerEligible
      ? consensus.viewerHasConsented
        ? '내 동의 완료'
        : '내 동의 필요'
      : '동의 대상 아님'
    : '';
  const roleSummaryText = hasRoleSummary
    ? roleBuckets
        .map(bucket => {
          if (!bucket.role) return null;
          return `${bucket.role} ${bucket.filled}/${bucket.total}`;
        })
        .filter(Boolean)
        .join(' · ')
    : '';

  if (!ready) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.shell}>
          <p className={styles.status}>매칭 정보를 불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (!gameId || !matchState?.snapshot) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.shell}>
          <p className={styles.status}>활성화된 매치 정보를 찾지 못했습니다.</p>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleBackToRoom}>
              방 목록으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} style={pageStyle}>
      <div className={styles.shell}>
        <header className={styles.headerRow}>
          <div className={styles.headerSummary}>
            <div className={styles.headerLead}>{matchState?.matchMode || '랭크 매치'}</div>
            <h1 className={styles.headerTitle}>{headerTitle}</h1>
            {headerDescription ? (
              <p className={styles.headerDescription}>{headerDescription}</p>
            ) : null}
          </div>
          <div className={styles.headerControls}>
            <button type="button" className={styles.navButton} onClick={handleBackToRoom}>
              ← 로비로
            </button>
            <div className={styles.headerButtons}>
              <button
                type="button"
                onClick={handleStart}
                className={styles.primaryButton}
                disabled={startButtonDisabled}
              >
                {startLabel}
              </button>
              <button
                type="button"
                onClick={advanceWithAi}
                className={styles.advanceButton}
                disabled={isAdvancing || advanceDisabled}
              >
                {nextLabel}
              </button>
            </div>
            {consensus?.active ? (
              <span className={styles.consensusBadge}>{consensusStatus}</span>
            ) : null}
          </div>
        </header>

        {statusMessages.length ? (
          <div className={styles.statusGroup}>
            {statusMessages.map((message, index) => (
              <StatusBanner key={`${message}-${index}`} message={message} />
            ))}
          </div>
        ) : null}

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <header className={styles.summaryHeader}>
              <h2 className={styles.summaryTitle}>매치 정보</h2>
              {matchState?.room?.code ? (
                <span className={styles.matchCode}>코드 {matchState.room.code}</span>
              ) : null}
            </header>
            {sessionMeta.length ? (
              <ul className={styles.metaList}>
                {sessionMeta.map(item => (
                  <li key={item.label} className={styles.metaItem}>
                    <span className={styles.metaLabel}>{item.label}</span>
                    <span className={styles.metaValue}>{item.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.metaPlaceholder}>추가 매치 정보가 없습니다.</p>
            )}
          </article>

          <article className={`${styles.summaryCard} ${styles.viewerCard}`}>
            <header className={styles.viewerHeader}>
              <h2 className={styles.summaryTitle}>내 캐릭터</h2>
              {viewerHeroProfile?.avatar_url ? (
                <img
                  src={viewerHeroProfile.avatar_url}
                  alt={viewerHeroProfile?.name || '참가자'}
                  className={styles.viewerAvatar}
                />
              ) : null}
            </header>
            <div className={styles.viewerBody}>
              <div className={styles.viewerName}>{viewerHeroProfile?.name || '익명 참가자'}</div>
              <div className={styles.viewerRole}>{matchState?.viewer?.role || '역할 미지정'}</div>
              <dl className={styles.viewerMeta}>
                {hostRoleName ? (
                  <div className={styles.viewerMetaItem}>
                    <dt className={styles.viewerMetaLabel}>호스트 역할</dt>
                    <dd className={styles.viewerMetaValue}>{hostRoleName}</dd>
                  </div>
                ) : null}
                {asyncMatchInstanceId ? (
                  <div className={styles.viewerMetaItem}>
                    <dt className={styles.viewerMetaLabel}>비실시간 매치</dt>
                    <dd className={styles.viewerMetaValue}>{asyncMatchInstanceId}</dd>
                  </div>
                ) : null}
                {sessionInfoMatchInstanceId ? (
                  <div className={styles.viewerMetaItem}>
                    <dt className={styles.viewerMetaLabel}>세션</dt>
                    <dd className={styles.viewerMetaValue}>{sessionInfoMatchInstanceId}</dd>
                  </div>
                ) : null}
                {extrasMatchInstanceId ? (
                  <div className={styles.viewerMetaItem}>
                    <dt className={styles.viewerMetaLabel}>연결 코드</dt>
                    <dd className={styles.viewerMetaValue}>{extrasMatchInstanceId}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </article>

          <article className={`${styles.summaryCard} ${styles.assignmentCard}`}>
            <header className={styles.assignmentHeader}>
              <div>
                <h2 className={styles.summaryTitle}>매칭 편성</h2>
                <p className={styles.assignmentHint}>슬롯 상태와 대역 충원 현황을 확인하세요.</p>
              </div>
              {roleSummaryText ? (
                <span className={styles.roleSummaryText}>{roleSummaryText}</span>
              ) : null}
            </header>
            {scoreboardRooms.length ? (
              <div className={styles.roomGrid}>
                {scoreboardRooms.map(room => (
                  <div key={room.id} className={styles.roomCard}>
                    <div className={styles.roomHeader}>
                      <span className={styles.roomLabel}>{room.label}</span>
                      {room.anchorScore != null ? (
                        <span className={styles.roomStatus}>기준 점수 {room.anchorScore}</span>
                      ) : null}
                    </div>
                    <ul className={styles.slotList}>
                      {room.slots.map((slot, index) => {
                        const tag = formatSlotSource({
                          standin: slot.standin,
                          matchSource: slot.matchSource,
                        });
                        const statusClass = slot.ready
                          ? styles.slotReady
                          : slot.heroName === '빈 슬롯'
                            ? styles.slotEmpty
                            : styles.slotPending;
                        return (
                          <li key={`${room.id}-${index}`} className={styles.slotItem}>
                            <div className={styles.slotRole}>{slot.role || '슬롯'}</div>
                            <div className={`${styles.slotHero} ${statusClass}`}>
                              {slot.heroName}
                            </div>
                            <div className={styles.slotTagRow}>
                              {tag ? <span className={styles.slotTag}>{tag}</span> : null}
                              {!slot.ready && slot.heroName !== '빈 슬롯' ? (
                                <span className={styles.slotTag}>{'미확인'}</span>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.metaPlaceholder}>편성 데이터를 찾지 못했습니다.</p>
            )}
            {hasRoleSummary ? (
              <div className={styles.roleSummary}>
                {roleBuckets.map((bucket, index) => (
                  <span
                    key={`${bucket.role}-${index}`}
                    className={bucket.missing > 0 ? styles.roleBadgeMissing : styles.roleBadge}
                  >
                    {bucket.role} {bucket.filled}/{bucket.total}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        </section>

        <div className={styles.bodyGrid}>
          <div className={styles.playColumn}>
            <TurnSummaryPanel
              sessionMeta={matchState?.sessionMeta || null}
              turn={turn}
              turnTimerSeconds={turnTimerSeconds}
              timeRemaining={timeRemaining}
              turnDeadline={turnDeadline}
              turnTimerSnapshot={turnTimerSnapshot}
              lastDropInTurn={lastDropInTurn}
            />

            <div className={styles.engineRow}>
              <TurnInfoPanel
                turn={turn}
                currentNode={currentNode}
                activeGlobal={activeGlobal}
                activeLocal={activeLocal}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                apiVersion={apiVersion}
                onApiVersionChange={setApiVersion}
                geminiMode={geminiMode}
                onGeminiModeChange={setGeminiMode}
                geminiModel={geminiModel}
                onGeminiModelChange={setGeminiModel}
                geminiModelOptions={geminiModelOptions}
                geminiModelLoading={geminiModelLoading}
                geminiModelError={geminiModelError}
                onReloadGeminiModels={reloadGeminiModels}
                realtimeLockNotice={realtimeLockNotice}
                apiKeyNotice={apiKeyCooldown?.active ? apiKeyWarning : ''}
                currentActor={currentActor}
                timeRemaining={timeRemaining}
                turnTimerSeconds={turnTimerSeconds}
              />

              <ManualResponsePanel
                manualResponse={manualResponse}
                onChange={setManualResponse}
                onManualAdvance={advanceWithManual}
                onAiAdvance={advanceWithAi}
                isAdvancing={isAdvancing}
                disabled={manualDisabled}
                disabledReason={manualDisabled ? manualDisabledReason : ''}
                timeRemaining={timeRemaining}
                turnTimerSeconds={turnTimerSeconds}
              />
            </div>
          </div>

          <aside className={styles.sideColumn}>
            {restrictedContext ? (
              <section className={`${styles.summaryCard} ${styles.visibilityCard}`}>
                <div className={styles.visibilityHeader}>
                  <h2 className={styles.summaryTitle}>정보 가시성</h2>
                  {Array.isArray(activeActorNames) && activeActorNames.length ? (
                    <div className={styles.actorBadgeRow}>
                      {activeActorNames.map((name, index) => (
                        <span key={`${name}-${index}`} className={styles.actorBadge}>
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className={styles.visibilityHint}>
                  블라인드 또는 비실시간 모드에서는 호스트 역할군만 상세한 캐릭터 정보를 확인할 수
                  있습니다.
                </p>
                <div className={styles.visibilityControls}>
                  <button
                    type="button"
                    className={
                      !showRosterDetails || !viewerCanToggleDetails
                        ? styles.visibilityButtonActive
                        : styles.visibilityButton
                    }
                    onClick={() => setShowRosterDetails(false)}
                  >
                    요약 보기
                  </button>
                  <button
                    type="button"
                    className={
                      showRosterDetails ? styles.visibilityButtonActive : styles.visibilityButton
                    }
                    onClick={() => {
                      if (!viewerMaySeeFull) return;
                      setShowRosterDetails(true);
                    }}
                    disabled={!viewerCanToggleDetails}
                  >
                    상세 보기
                  </button>
                </div>
                {!viewerMaySeeFull && (
                  <p className={styles.visibilityNotice}>
                    호스트와 동일한 역할군만 상세 정보를 열람할 수 있습니다.
                  </p>
                )}
              </section>
            ) : null}

            <div className={`${styles.summaryCard} ${styles.sideCard}`}>
              <RosterPanel
                participants={participants}
                realtimePresence={realtimePresence}
                dropInSnapshot={dropInSnapshot}
                sessionOutcome={sessionOutcome}
                showDetails={!restrictedContext || (showRosterDetails && viewerMaySeeFull)}
                viewerOwnerId={viewerOwnerId}
                normalizedHostRole={normalizedHostRole}
                normalizedViewerRole={normalizedViewerRole}
              />
            </div>

            <div className={`${styles.summaryCard} ${styles.sideCard}`}>
              <LogsPanel
                logs={logs}
                aiMemory={aiMemory}
                playerHistories={playerHistories}
                realtimeEvents={realtimeEvents}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
