'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { subscribeToBroadcastTopic } from '../../../lib/realtime/broadcast';
import { supabase } from '../../../lib/supabase';
import { withTable } from '../../../lib/supabaseTables';
import {
  buildSlotsFromParticipants,
  makeNodePrompt,
  parseOutcome,
} from '../../../lib/promptEngine';
import { loadGameBundle } from './engine/loadGameBundle';
import { pickNextEdge } from './engine/graph';
import { buildSystemMessage, parseRules } from './engine/systemPrompt';
import { resolveSlotBinding } from './engine/slotBindingResolver';
import { createBridgeContext } from './engine/bridgeContext';
import {
  buildUserActionPersona,
  normalizeHeroName,
  resolveActorContext,
} from './engine/actorContext';
import { buildBattleLogDraft } from './engine/battleLogBuilder';
import { formatRealtimeReason } from './engine/timelineLogBuilder';
import {
  buildLogEntriesFromEvents,
  initializeRealtimeEvents,
  appendSnapshotEvents,
} from './engine/timelineState';
import { reconcileParticipantsForGame, formatPreflightSummary } from './engine/preflight';
import {
  buildOwnerParticipantMap,
  buildOwnerRosterSnapshot,
  collectUniqueOwnerIds,
  createOwnerDisplayMap,
  deriveParticipantOwnerId,
} from './engine/participants';
import {
  initialMainGameState,
  mainGameReducer,
  patchMainGameState,
  replaceMainGameLogs,
} from './engine/mainGameMachine';
import {
  createOutcomeLedger,
  syncOutcomeLedger,
  recordOutcomeLedger,
  buildOutcomeSnapshot,
} from './engine/outcomeLedger';
import { isApiKeyError } from './engine/apiKeyUtils';
import { createTurnTimerService } from './services/turnTimerService';
import { createTurnVoteController, deriveEligibleOwnerIds } from './services/turnVoteController';
import { createRealtimeSessionManager } from './services/realtimeSessionManager';
import { createDropInQueueService } from './services/dropInQueueService';
import { createAsyncSessionManager } from './services/asyncSessionManager';
import { mergeTimelineEvents, normalizeTimelineStatus } from '@/lib/rank/timelineEvents';
import { buildDropInExtensionTimelineEvent } from '@/lib/rank/dropInTimeline';
import { prepareHistoryPayload } from '@/lib/rank/chatHistory';
import { buildHistorySeedEntries } from '@/lib/rank/historySeeds';
import { useHistoryBuffer } from './hooks/useHistoryBuffer';
import { useStartSessionLifecycle } from './hooks/useStartSessionLifecycle';
import { useStartApiKeyManager } from './hooks/useStartApiKeyManager';
import { useStartCooldown } from './hooks/useStartCooldown';
import { useStartManualResponse } from './hooks/useStartManualResponse';
import { useStartSessionWatchdog } from './hooks/useStartSessionWatchdog';
import useBootLocalSession from './hooks/useBootLocalSession';
import useTurnTimer from './hooks/useTurnTimer';
import useParticipantDropInSync from './hooks/useParticipantDropInSync';
import useAdvanceTurn from './hooks/useAdvanceTurn';
import { consumeStartMatchMeta } from '../startConfig';
import {
  clearGameMatchData,
  hydrateGameMatchData,
  setGameMatchSessionMeta,
} from '../../../modules/rank/matchDataStore';
import { fetchLatestSessionRow } from '@/modules/rank/matchRealtimeSync';
import {
  START_SESSION_KEYS,
  readStartSessionValue,
  readStartSessionValues,
} from '@/lib/rank/startSessionChannel';
  // Delegate advanceTurn to the extracted hook to reduce local complexity.
  // Use a minimal dependency object to keep the hook contract explicit and
  // reduce coupling. If tests fail, we'll reintroduce missing deps iteratively.
  const advanceTurnDeps = {
    preflight,
    currentNodeId,
    graph,
    slots,
    history,
    aiMemory,
    activeGlobal,
    activeLocal,
    manualResponse,
    effectiveApiKey,
    apiVersion,
    systemPrompt,
    turn,
    participants,
    realtimeEnabled,
    brawlEnabled,
    winCount,
    viewerId,
    gameId,
    sessionInfo,

    // setters / side-effect helpers
    updateHeroAssets,
    logTurnEntries,
    ensureApiKeyReady,
    persistApiKeyOnServer,
    applyRealtimeSnapshot,
    recordTurnState,
    captureBattleLog,
    clearSessionRecord,
    finalizeSessionRemotely,
    patchEngineState,
    setActiveGlobal,
    setActiveLocal,
    setCurrentNodeId,
    setIsAdvancing,
    setLogs,
    setStatusMessage,
    setTimeRemaining,
    setTurn,
    setTurnDeadline,
    setWinCount,

  // refs / helpers
    realtimeManagerRef,
  statusMessageRef,
  // NOTE: several pure helpers (makeNodePrompt, prepareHistoryPayload,
  // buildUserActionPersona, pickNextEdge, resolveActorContext,
  // resolveSlotBinding, deriveEligibleOwnerIds) are imported directly
  // inside `useAdvanceTurn` to shrink this call-site deps object.
  outcomeLedgerRef,
  recordOutcomeLedger,
  buildOutcomeSnapshot,

    // utils
    isApiKeyError,
  };

  const advanceTurn = useAdvanceTurn(advanceTurnDeps);
        patchEngineState({ currentNodeId: next ?? null });
      } else {
        patchEngineState({ currentNodeId: value ?? null });
      }
    },
    [patchEngineState]
  );
  const setPreflight = useCallback(
    value => {
      patchEngineState({ preflight: !!value });
    },
    [patchEngineState]
  );
  const setTurn = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(turnRef.current);
        patchEngineState({ turn: next });
      } else {
        patchEngineState({ turn: value });
      }
    },
    [patchEngineState]
  );
  useEffect(() => {
    setTurnCallbackRef.current = setTurn;
    return () => {
      if (setTurnCallbackRef.current === setTurn) {
        setTurnCallbackRef.current = null;
      }
    };
  }, [setTurn]);
  const setLogs = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(logsRef.current);
        replaceEngineLogs(Array.isArray(next) ? next : []);
      } else {
        replaceEngineLogs(Array.isArray(value) ? value : []);
      }
    },
    [replaceEngineLogs]
  );
  const setBattleLogDraft = useCallback(
    value => {
      patchEngineState({ battleLogDraft: value });
    },
    [patchEngineState]
  );
  const setPromptMetaWarning = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(promptMetaWarningRef.current);
        patchEngineState({ promptMetaWarning: next });
      } else {
        patchEngineState({ promptMetaWarning: value });
      }
    },
    [patchEngineState]
  );
  const setIsAdvancing = useCallback(
    value => {
      patchEngineState({ isAdvancing: !!value });
    },
    [patchEngineState]
  );
  const setWinCount = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(winCountRef.current);
        patchEngineState({ winCount: next });
      } else {
        patchEngineState({ winCount: value });
      }
    },
    [patchEngineState]
  );
  const setLastDropInTurn = useCallback(
    value => {
      patchEngineState({ lastDropInTurn: value });
    },
    [patchEngineState]
  );
  useEffect(() => {
    setLastDropInTurnCallbackRef.current = setLastDropInTurn;
    return () => {
      if (setLastDropInTurnCallbackRef.current === setLastDropInTurn) {
        setLastDropInTurnCallbackRef.current = null;
      }
    };
  }, [setLastDropInTurn]);
  const setViewerId = useCallback(
    value => {
      patchEngineState({ viewerId: value });
    },
    [patchEngineState]
  );
  const setTurnDeadline = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(turnDeadlineRef.current);
        patchEngineState({ turnDeadline: next });
      } else {
        patchEngineState({ turnDeadline: value });
      }
    },
    [patchEngineState]
  );
  useEffect(() => {
    setTurnDeadlineCallbackRef.current = setTurnDeadline;
    return () => {
      if (setTurnDeadlineCallbackRef.current === setTurnDeadline) {
        setTurnDeadlineCallbackRef.current = null;
      }
    };
  }, [setTurnDeadline]);
  const setTimeRemaining = useCallback(
    value => {
      if (typeof value === 'function') {
        const next = value(timeRemainingRef.current);
        patchEngineState({ timeRemaining: next });
      } else {
        patchEngineState({ timeRemaining: value });
      }
    },
    [patchEngineState]
  );
  useEffect(() => {
    setTimeRemainingCallbackRef.current = setTimeRemaining;
    return () => {
      if (setTimeRemainingCallbackRef.current === setTimeRemaining) {
        setTimeRemainingCallbackRef.current = null;
      }
    };
  }, [setTimeRemaining]);
  const recordTurnState = useCallback(
    (patch = {}, options = {}) => {
      if (preflight) return;
      if (!gameId) return;

      let turnStatePatch;
      if (patch === null) {
        turnStatePatch = null;
      } else if (typeof patch === 'object') {
        turnStatePatch = { ...patch };
        if (!turnStatePatch.source) {
          turnStatePatch.source = 'start-client';
        }
      } else {
        return;
      }

      const metaPatch =
        options &&
        typeof options === 'object' &&
        options.metaPatch &&
        typeof options.metaPatch === 'object'
          ? options.metaPatch
          : null;

      const payload = metaPatch ? { ...metaPatch } : {};
      payload.turnState = turnStatePatch;
      payload.source = 'start-client/turn-state';

      setGameMatchSessionMeta(gameId, payload);
    },
    [gameId, preflight]
  );
  const setActiveHeroAssets = useCallback(
    value => {
      patchEngineState({ activeHeroAssets: value });
    },
    [patchEngineState]
  );
  const setActiveActorNames = useCallback(
    value => {
      patchEngineState({ activeActorNames: Array.isArray(value) ? value : [] });
    },
    [patchEngineState]
  );
  const setActiveGlobal = useCallback(
    value => {
      patchEngineState({ activeGlobal: Array.isArray(value) ? value : [] });
    },
    [patchEngineState]
  );
  const setActiveLocal = useCallback(
    value => {
      patchEngineState({ activeLocal: Array.isArray(value) ? value : [] });
    },
    [patchEngineState]
  );
  // setParticipants: ?��??�서 ?�용?��? ?�으므�??�거?�습?�다.
  // ?�요 ??patchEngineState�?직접 ?�출?�거?????�수�?복원?�세??
  const [turnTimerSeconds] = useState(() => {
    const timerFromMeta = Number(initialSessionMeta?.turnTimer?.baseSeconds);
    if (Number.isFinite(timerFromMeta) && timerFromMeta > 0) {
      return timerFromMeta;
    }
    if (typeof window === 'undefined') return 60;
    const stored = Number(readStartSessionValue(START_SESSION_KEYS.TURN_TIMER));
    if (Number.isFinite(stored) && stored > 0) return stored;
    return 60;
  });
  const realtimeManagerRef = useRef(null);
  if (!realtimeManagerRef.current) {
    realtimeManagerRef.current = createRealtimeSessionManager();
  }
  const dropInQueueRef = useRef(null);
  if (!dropInQueueRef.current) {
    dropInQueueRef.current = createDropInQueueService();
  }
  const processedDropInReleasesRef = useRef(new Set());
  const asyncSessionManagerRef = useRef(null);
  if (!asyncSessionManagerRef.current) {
    asyncSessionManagerRef.current = createAsyncSessionManager({
      dropInQueue: dropInQueueRef.current,
    });
  }
  const turnTimerServiceRef = useRef(null);
  if (!turnTimerServiceRef.current) {
    turnTimerServiceRef.current = createTurnTimerService({
      baseSeconds: turnTimerSeconds,
    });
  } else {
    turnTimerServiceRef.current.configureBase(turnTimerSeconds);
  }
  const turnVoteControllerRef = useRef(null);
  if (!turnVoteControllerRef.current) {
    turnVoteControllerRef.current = createTurnVoteController();
  }
  const initialRealtimeSnapshotRef = useRef(null);
  if (!initialRealtimeSnapshotRef.current) {
    initialRealtimeSnapshotRef.current = realtimeManagerRef.current
      ? realtimeManagerRef.current.getSnapshot()
      : null;
  }
  const [consensusState, setConsensusState] = useState(() =>
    turnVoteControllerRef.current.getSnapshot()
  );
  const [realtimePresence, setRealtimePresence] = useState(initialRealtimeSnapshotRef.current);
  const [realtimeEvents, setRealtimeEvents] = useState(() =>
    initializeRealtimeEvents(initialRealtimeSnapshotRef.current)
  );
  const realtimeEventsRef = useRef(realtimeEvents);
  const [dropInSnapshot, setDropInSnapshot] = useState(null);
  const dropInSnapshotRef = useRef(null);

  useEffect(() => {
    logsRef.current = Array.isArray(logs) ? logs : [];
  }, [logs]);

  useEffect(() => {
    const list = Array.isArray(participants) ? participants : [];
    participantsRef.current = list;
    if (outcomeLedgerRef.current) {
      const changed = syncOutcomeLedger(outcomeLedgerRef.current, { participants: list });
      if (changed) {
        setSessionOutcome(buildOutcomeSnapshot(outcomeLedgerRef.current));
      }
    }
  }, [participants]);

  useEffect(() => {
    outcomeLedgerRef.current = createOutcomeLedger({ participants: participantsRef.current });
    setSessionOutcome(buildOutcomeSnapshot(outcomeLedgerRef.current));
    sessionFinalizedRef.current = false;
  }, [gameId]);

  useEffect(() => {
    currentNodeIdRef.current = currentNodeId ?? null;
  }, [currentNodeId]);

  useEffect(() => {
    statusMessageRef.current = typeof statusMessage === 'string' ? statusMessage : '';
  }, [statusMessage]);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  useEffect(() => {
    promptMetaWarningRef.current = typeof promptMetaWarning === 'string' ? promptMetaWarning : '';
  }, [promptMetaWarning]);

  useEffect(() => {
    winCountRef.current = Number.isFinite(Number(winCount)) ? Number(winCount) : 0;
  }, [winCount]);

  useEffect(() => {
    turnDeadlineRef.current = turnDeadline ?? null;
  }, [turnDeadline, setTimeRemaining]);

  useEffect(() => {
    timeRemainingRef.current = timeRemaining ?? null;
  }, [timeRemaining]);

  useEffect(() => {
    realtimeEventsRef.current = Array.isArray(realtimeEvents) ? realtimeEvents : [];
  }, [realtimeEvents]);

  useEffect(() => {
    dropInSnapshotRef.current = dropInSnapshot || null;
  }, [dropInSnapshot]);

  useEffect(() => {
    startMatchMetaRef.current = startMatchMeta;
  }, [startMatchMeta]);
  const matchingMetadata = useMemo(() => {
    if (!startMatchMeta) return null;
    try {
      return JSON.parse(
        JSON.stringify({
          source: startMatchMeta.source || 'client_start',
          matchType: startMatchMeta.matchType || null,
          matchCode: startMatchMeta.matchCode || null,
          dropInTarget: startMatchMeta.dropInTarget || null,
          dropInMeta: startMatchMeta.dropInMeta || null,
          sampleMeta: startMatchMeta.sampleMeta || null,
          roleStatus: startMatchMeta.roleStatus || null,
          assignments: Array.isArray(startMatchMeta.assignments) ? startMatchMeta.assignments : [],
          slotLayout: Array.isArray(startMatchMeta.slotLayout) ? startMatchMeta.slotLayout : [],
          heroMap:
            startMatchMeta.heroMap && typeof startMatchMeta.heroMap === 'object'
              ? startMatchMeta.heroMap
              : null,
          storedAt: startMatchMeta.storedAt || null,
          mode: startMatchMeta.mode || null,
          turnTimer: startMatchMeta.turnTimer || null,
        })
      );
    } catch (error) {
      console.warn('[StartClient] 매칭 메�??�이??직렬???�패:', error);
      return null;
    }
  }, [startMatchMeta]);
  const lastScheduledTurnRef = useRef(0);
  const participantIdSetRef = useRef(new Set());

  const applyRealtimeSnapshot = useCallback(snapshot => {
    if (!snapshot) {
      setRealtimePresence(null);
      setRealtimeEvents([]);
      return;
    }
    setRealtimePresence(snapshot);
    setRealtimeEvents(prev => appendSnapshotEvents(prev, snapshot));
  }, []);

  const clearConsensusVotes = useCallback(() => {
    const controller = turnVoteControllerRef.current;
    if (!controller) return;
    const snapshot = controller.clear();
    setConsensusState(snapshot);
  }, []);

  const { rememberActiveSession, updateSessionRecord, clearSessionRecord, markSessionDefeated } =
    useStartSessionLifecycle({
      gameId,
      game,
      activeActorNames,
      sessionInfo,
      setSessionInfo,
      realtimeManagerRef,
      dropInQueueRef,
      asyncSessionManagerRef,
      applyRealtimeSnapshot,
      setTurnDeadline,
      setTimeRemaining,
    });

  const adoptRemoteSession = useCallback(
    async sessionRow => {
      if (!sessionRow || typeof sessionRow !== 'object') {
        return false;
      }

      const sessionId = sessionRow.id || sessionRow.session_id || sessionRow.sessionId;
      if (!sessionId) {
        return false;
      }

      if (remoteSessionAdoptedRef.current && sessionInfo?.id === sessionId) {
        return false;
      }

      const statusToken = sessionRow.status
        ? String(sessionRow.status).trim().toLowerCase()
        : 'active';
      if (statusToken && statusToken !== 'active') {
        return false;
      }

      const ownerSource =
        sessionRow.owner_id ??
        sessionRow.ownerId ??
        sessionRow.ownerID ??
        (sessionRow.owner && typeof sessionRow.owner === 'object' ? sessionRow.owner.id : null);
      const ownerToken =
        ownerSource !== null && ownerSource !== undefined ? String(ownerSource).trim() : '';
      if (normalizedHostOwnerId && ownerToken && ownerToken !== normalizedHostOwnerId) {
        return false;
      }

      if (!preflight) {
        if (!sessionInfo?.id) {
          setSessionInfo({
            id: sessionId,
            status: sessionRow.status || 'active',
            createdAt: sessionRow.created_at || sessionRow.createdAt || null,
            reused: true,
          });
        }
        return false;
      }

      if (!participants || participants.length === 0) {
        return false;
      }

      setSessionInfo({
        id: sessionId,
        status: sessionRow.status || 'active',
        createdAt: sessionRow.created_at || sessionRow.createdAt || null,
        reused: true,
      });

      remoteSessionAdoptedRef.current = true;

      let sessionParticipants = participants;
      try {
        const { participants: sanitized, removed } = reconcileParticipantsForGame({
          participants,
          slotLayout,
          matchingMetadata,
        });

        if (!sanitized || sanitized.length === 0) {
          remoteSessionAdoptedRef.current = false;
          setStatusMessage('참�???구성???�효?��? ?�아 게임??참여?????�습?�다.');
          return false;
        }

        sessionParticipants = sanitized;

        if (removed.length) {
          const summary = formatPreflightSummary(removed);
          if (summary) {
            console.warn('[StartClient] ?�격 ?�보???�외 참�???\n' + summary);
            setPromptMetaWarning(prev => {
              const trimmed = prev ? String(prev).trim() : '';
              const notice = `[?�보?? ?�외??참�???\n${summary}`;
              return trimmed ? `${trimmed}\n\n${notice}` : notice;
            });
          }
        }
      } catch (error) {
        remoteSessionAdoptedRef.current = false;
        console.error('[StartClient] ?�격 ?�션 검�??�패:', error);
        setStatusMessage('매칭 ?�이?��? 검증하지 못했?�니?? ?�시 ???�시 ?�도??주세??');
        return false;
      }

      setStatusMessage('?�스?��? 게임???�작?�습?�다. ?�투???�류?�니??');
      const bootSession =
        typeof bootLocalSessionRef.current === 'function' ? bootLocalSessionRef.current : null;
      if (!bootSession) {
        remoteSessionAdoptedRef.current = false;
        console.warn('[StartClient] 로컬 ?�션 부??콜백??초기?�되지 ?�았?�니??');
        setStatusMessage(
          '게임 ?�면??초기?�하??�?문제가 발생?�습?�다. ?�시 ???�시 ?�도??주세??'
        );
        return false;
      }

      bootSession(sessionParticipants);
      return true;
    },
    [
      preflight,
      participants,
      slotLayout,
      matchingMetadata,
      setPromptMetaWarning,
      setStatusMessage,
      sessionInfo?.id,
      normalizedHostOwnerId,
      setSessionInfo,
    ]
  );

  useEffect(() => {
    if (!gameId) return undefined;
    if (sessionInfo?.id) return undefined;
    if (!preflight) return undefined;
    if (startingSession) return undefined;
    if (remoteSessionAdoptedRef.current) return undefined;
    if (!participants || participants.length === 0) return undefined;

    const now = Date.now();
    if (remoteSessionFetchRef.current.running) {
      return undefined;
    }
    if (now - remoteSessionFetchRef.current.lastFetchedAt < 2000) {
      return undefined;
    }

    let cancelled = false;
    remoteSessionFetchRef.current.running = true;
    (async () => {
      try {
        let sessionRow = await fetchLatestSessionRow(supabase, gameId, {
          ownerId: normalizedHostOwnerId || null,
        });

        if (cancelled) {
          return;
        }

        if (!sessionRow && normalizedHostOwnerId) {
          sessionRow = await fetchLatestSessionRow(supabase, gameId);
        }

        if (cancelled) {
          return;
        }

        if (sessionRow) {
          adoptRemoteSession(sessionRow);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[StartClient] ?�격 ?�션 조회 �??�류:', error);
        }
      } finally {
        remoteSessionFetchRef.current.running = false;
        remoteSessionFetchRef.current.lastFetchedAt = Date.now();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gameId,
    sessionInfo?.id,
    preflight,
    startingSession,
    participants,
    adoptRemoteSession,
    normalizedHostOwnerId,
  ]);

  useEffect(() => {
    if (!gameId) return undefined;

    const unsubscribe = subscribeToBroadcastTopic(
      `rank_sessions:game:${gameId}`,
      change => {
        const eventType = change?.eventType || change?.event || '';
        if (eventType === 'DELETE') {
          return;
        }

        const record = change?.new || null;
        if (!record || typeof record !== 'object') {
          return;
        }

        const recordGameId = record.game_id ?? record.gameId ?? null;
        if (recordGameId && String(recordGameId).trim() !== String(gameId).trim()) {
          return;
        }

        const statusToken = record.status ? String(record.status).trim().toLowerCase() : 'active';
        if (statusToken && statusToken !== 'active') {
          return;
        }

        const ownerSource =
          record.owner_id ??
          record.ownerId ??
          record.ownerID ??
          (record.owner && typeof record.owner === 'object' ? record.owner.id : null);
        const ownerToken =
          ownerSource !== null && ownerSource !== undefined ? String(ownerSource).trim() : '';
        if (normalizedHostOwnerId && ownerToken && ownerToken !== normalizedHostOwnerId) {
          return;
        }

        adoptRemoteSession(record);
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [gameId, adoptRemoteSession, normalizedHostOwnerId]);

  const logTurnEntries = useCallback(
    async ({ entries, turnNumber }) => {
      if (!sessionInfo?.id) {
        return;
      }

      const normalized = [];
      if (Array.isArray(entries)) {
        entries.forEach(entry => {
          if (!entry) return;
          const rawRole = typeof entry.role === 'string' ? entry.role.trim() : '';
          const role = rawRole || 'narration';
          let content = '';
          if (typeof entry.content === 'string') {
            content = entry.content;
          } else if (entry.content != null) {
            try {
              content = JSON.stringify(entry.content);
            } catch {
              content = String(entry.content);
            }
          }
          if (!content || !content.trim()) {
            return;
          }
          const visibilityValue =
            typeof entry.visibility === 'string' ? entry.visibility.trim().toLowerCase() : '';

          let summary = null;
          const summaryCandidates = [entry.summary, entry.summary_payload, entry.summaryPayload];
          for (const candidate of summaryCandidates) {
            if (candidate && typeof candidate === 'object') {
              try {
                summary = JSON.parse(JSON.stringify(candidate));
                break;
              } catch {
                summary = null;
              }
            }
          }

          const prompt = typeof entry.prompt === 'string' ? entry.prompt : null;
          const actors = Array.isArray(entry.actors)
            ? entry.actors
                .map(actor => (typeof actor === 'string' ? actor.trim() : ''))
                .filter(Boolean)
            : null;
          const extra =
            entry.extra && typeof entry.extra === 'object'
              ? JSON.parse(JSON.stringify(entry.extra))
              : null;

          const normalizedEntry = {
            role,
            content,
            public: entry.public !== false,
          };

          if (typeof entry.isVisible === 'boolean') {
            normalizedEntry.isVisible = entry.isVisible;
          }

          if (visibilityValue) {
            normalizedEntry.visibility = visibilityValue;
          }

          if (summary) {
            normalizedEntry.summary = summary;
          }

          if (prompt) {
            normalizedEntry.prompt = prompt;
          }

          if (actors && actors.length) {
            normalizedEntry.actors = actors;
          }

          if (extra) {
            normalizedEntry.extra = extra;
          }

          normalized.push(normalizedEntry);
        });
      }

      if (!normalized.length) {
        return;
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('?�션 ?�큰???�인?????�습?�다.');
        }

        const payload = {
          session_id: sessionInfo.id,
          game_id: gameId,
          entries: normalized,
        };
        const numericTurn = Number(turnNumber);
        if (Number.isFinite(numericTurn) && numericTurn > 0) {
          payload.turn_number = numericTurn;
        }

        const response = await fetch('/api/rank/log-turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let detail = null;
          try {
            detail = await response.json();
          } catch {
            detail = null;
          }
          const message = detail?.error || '??기록???�패?�습?�다.';
          throw new Error(message);
        }
      } catch (err) {
        console.error('??기록 ?�패:', err);
      }
    },
    [gameId, sessionInfo?.id]
  );

  useEffect(() => {
    if (!gameId) return;

    let alive = true;

    async function load() {
      patchEngineState({ loading: true, error: '' });
      try {
        const bundle = await loadGameBundle(supabase, gameId, {
          rosterSnapshot,
          matchInstanceId,
          roomId: stagedRoomId,
        });
        if (!alive) return;

        const participantsFromBundle = Array.isArray(bundle.participants)
          ? bundle.participants.map(participant => ({ ...participant }))
          : [];
        const slotLayoutFromBundle = Array.isArray(bundle.slotLayout)
          ? bundle.slotLayout.map(slot => ({ ...slot }))
          : [];

        const hydratedParticipants = rosterSnapshot.length
          ? hydrateParticipantsWithRoster(participantsFromBundle, rosterSnapshot)
          : participantsFromBundle;

        const baseSlotLayout = rosterSnapshot.length
          ? buildSlotLayoutFromRosterSnapshot(rosterSnapshot)
          : slotLayoutSeed.length
            ? slotLayoutSeed
            : [];

        const mergedSlotLayout = mergeSlotLayoutSeed(baseSlotLayout, slotLayoutFromBundle);

        const finalSlotLayout =
          mergedSlotLayout.length > 0 ? mergedSlotLayout : slotLayoutFromBundle;

        patchEngineState({
          game: bundle.game,
          participants: hydratedParticipants,
          slotLayout: finalSlotLayout,
          graph: bundle.graph,
        });
        if (Array.isArray(bundle.warnings) && bundle.warnings.length) {
          bundle.warnings.forEach(warning => {
            if (warning) console.warn('[StartClient] ?�롬?�트 변??경고:', warning);
          });
          setPromptMetaWarning(bundle.warnings.filter(Boolean).join('\n'));
        } else {
          setPromptMetaWarning('');
        }
      } catch (err) {
        if (!alive) return;
        console.error(err);
        patchEngineState({
          error: err?.message || '게임 ?�이?��? 불러?��? 못했?�니??',
          slotLayout: [],
        });
        setPromptMetaWarning('');
      } finally {
        if (alive) patchEngineState({ loading: false });
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [gameId, matchInstanceId, patchEngineState, rosterSnapshot, setPromptMetaWarning, slotLayoutSeed, stagedRoomId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error) {
          console.warn('뷰어 ?�보�?불러?��? 못했?�니??', error);
          setViewerId(null);
          return;
        }
        setViewerId(data?.user?.id || null);
      } catch (err) {
        if (!alive) return;
        console.warn('뷰어 ?�보�??�인?�는 �??�류 발생:', err);
        setViewerId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setViewerId]);

  const participantsStatus = useMemo(
    () =>
      participants.map(participant => ({
        role: participant.role,
        status: participant.status,
      })),
    [participants]
  );
  const ownerDisplayMap = useMemo(() => createOwnerDisplayMap(participants), [participants]);
  const ownerParticipantMap = useMemo(() => buildOwnerParticipantMap(participants), [participants]);
  const sharedTurnRoster = useMemo(() => {
    const roster = [];
    ownerParticipantMap.forEach((participant, ownerId) => {
      roster.push({
        ownerId,
        participant,
        hero: participant?.hero || null,
        heroId: participant?.hero?.id ?? participant?.hero_id ?? participant?.heroId ?? null,
        role: participant?.role || null,
        status: participant?.status || null,
      });
    });
    return roster;
  }, [ownerParticipantMap]);
  const ownerRosterSnapshot = useMemo(() => buildOwnerRosterSnapshot(participants), [participants]);
  // �? react-hooks/exhaustive-deps 규칙???�동 ?�제?�습?�다 ???�도???�략?�니??
  // ??useMemo/useEffect???�생 컬렉???? managedOwnerIds)?�나 viewerId처럼
  // ?�주 변경되??값들???��??�으�??�용?�니?? 모든 값을 deps??추�??�면
  // ?�로?�일링에??과도???�실?�이 발생?????�어 ?�도?�으�??�략?�습?�다.
  // 권장 처리: 리팩?�링 ???�당 값들???�정??useMemo/useRef)?�거??effect�?  // ???��? ?�위�?분리???? ?�요??최소?�의 deps�?추�???주세??
  const managedOwnerIds = useMemo(() => {
    const owners = collectUniqueOwnerIds(participants);
    const viewerKey = viewerId ? String(viewerId).trim() : '';
    if (!viewerKey) {
      return owners;
    }
    const filtered = owners.filter(ownerId => ownerId !== viewerKey);
    return [viewerKey, ...filtered];
  }, [participants, viewerId]);

  useEffect(() => {
    if (!gameId || preflight) return;
    updateSessionRecord({
      turn,
      actorNames: activeActorNames,
      sharedOwners: managedOwnerIds,
      ownerRoster: ownerRosterSnapshot,
    });
  }, [
    gameId,
    preflight,
    turn,
    activeActorNames,
    updateSessionRecord,
    managedOwnerIds,
    ownerRosterSnapshot,
  ]);

  const scheduleTurnTimer = useCallback(
    turnNumber => {
      if (preflight) return;
      if (!currentNodeId) return;
      if (!turnTimerServiceRef.current) return;
      if (!gameId) return;
      const durationSeconds = turnTimerServiceRef.current.nextTurnDuration(turnNumber);
      const numericTurn = Number.isFinite(Number(turnNumber)) ? Math.floor(Number(turnNumber)) : 0;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        setTurnDeadline(null);
        setTimeRemaining(null);
        recordTurnState({
          turnNumber: numericTurn,
          status: 'idle',
          deadline: 0,
          durationSeconds: 0,
          remainingSeconds: 0,
        });
        lastBroadcastTurnStateRef.current = { turnNumber: numericTurn, deadline: 0 };
        return;
      }
      const scheduledAt = Date.now();
      const deadline = scheduledAt + durationSeconds * 1000;
      setTurnDeadline(deadline);
      setTimeRemaining(durationSeconds);
      recordTurnState({
        turnNumber: numericTurn,
        scheduledAt,
        deadline,
        durationSeconds,
        remainingSeconds: durationSeconds,
        status: 'scheduled',
      });
      lastScheduledTurnRef.current = turnNumber;
      lastBroadcastTurnStateRef.current = { turnNumber: numericTurn, deadline };
    },
    [preflight, currentNodeId, gameId, recordTurnState, setTurnDeadline, setTimeRemaining]
  );

  useEffect(() => {
    if (preflight) return;
    if (!currentNodeId) return;
    if (isAdvancing) return;
    if (!turn || turn <= 0) return;
    if (lastScheduledTurnRef.current === turn && turnDeadline) return;
    scheduleTurnTimer(turn);
  }, [preflight, currentNodeId, turn, turnDeadline, isAdvancing, scheduleTurnTimer]);

  useEffect(() => {
    if (preflight) return;
    if (!gameId) return;

    const previous = lastBroadcastTurnStateRef.current || { turnNumber: 0, deadline: 0 };
    const currentDeadline = typeof turnDeadline === 'number' && turnDeadline > 0 ? turnDeadline : 0;
    const numericTurn = Number.isFinite(Number(turn))
      ? Math.floor(Number(turn))
      : previous.turnNumber || 0;

    if (previous.deadline && !currentDeadline && numericTurn > 0) {
      recordTurnState({
        turnNumber: numericTurn,
        deadline: 0,
        remainingSeconds: 0,
        status: 'idle',
      });
      lastBroadcastTurnStateRef.current = { turnNumber: numericTurn, deadline: 0 };
    } else if (currentDeadline && currentDeadline !== previous.deadline) {
      lastBroadcastTurnStateRef.current = { turnNumber: numericTurn, deadline: currentDeadline };
    }
  }, [preflight, gameId, turnDeadline, turn, recordTurnState]);

  useEffect(() => {
    if (!realtimeManagerRef.current) return;
    const snapshot = realtimeManagerRef.current.syncParticipants(participants);
    applyRealtimeSnapshot(snapshot);
  }, [participants, applyRealtimeSnapshot]);

  useEffect(() => {
    if (!realtimeManagerRef.current) return;
    if (!realtimeEnabled) {
      const snapshot = realtimeManagerRef.current.setManagedOwners([]);
      applyRealtimeSnapshot(snapshot);
      return;
    }
    const snapshot = realtimeManagerRef.current.setManagedOwners(managedOwnerIds);
    applyRealtimeSnapshot(snapshot);
  }, [managedOwnerIds, realtimeEnabled, applyRealtimeSnapshot]);

  useEffect(() => {
    if (preflight) return;
    if (!realtimeEnabled) return;
    if (!turn || turn <= 0) return;
    if (!realtimeManagerRef.current) return;
    const snapshot = realtimeManagerRef.current.beginTurn({
      turnNumber: turn,
      eligibleOwnerIds: deriveEligibleOwnerIds(participants),
    });
    applyRealtimeSnapshot(snapshot);
  }, [preflight, realtimeEnabled, turn, participants, applyRealtimeSnapshot]);

  useEffect(() => {
    if (!currentNodeId) {
      setLastDropInTurn(null);
    }
  }, [currentNodeId, setLastDropInTurn]);

  // ?�?�머 로직??분리???�으�??�동?�습?�다 (useTurnTimer).
  // 목적: effect??캡처 범위�?줄이�??�사???�스?��? ?�게 ?�기 ?�함?�니??
  useTurnTimer(turnDeadline, setTimeRemaining);

  const systemPrompt = useMemo(() => buildSystemMessage(game || {}), [game]);
  // useTurnTimer ?�을 ?�해 turnDeadline 기반 ?�?�머�?분리?�습?�다.
  const parsedRules = useMemo(() => parseRules(game || {}), [game]);
  const brawlEnabled = parsedRules?.brawl_rule === 'allow-brawl';
  const endConditionVariable = useMemo(() => {
    const raw = parsedRules?.end_condition_variable;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      return trimmed || null;
    }
    return null;
  }, [parsedRules]);
  const slots = useMemo(() => buildSlotsFromParticipants(participants), [participants]);
  const heroLookup = useMemo(() => {
    const map = new Map();
    participants.forEach((participant, index) => {
      const heroName = participant?.hero?.name;
      if (!heroName) return;
      const key = normalizeHeroName(heroName);
      if (!key) return;
      const entry = {
        hero: participant.hero,
        participant,
        slotIndex: index,
      };
      if (!map.has(key)) {
        map.set(key, [entry]);
      } else {
        map.get(key).push(entry);
      }
    });
    return map;
  }, [participants]);
  const resolveHeroAssets = useCallback(
    (names, fallbackContext) => {
      const trimmed = Array.isArray(names)
        ? names.map(name => String(name || '').trim()).filter(Boolean)
        : [];

      const matchedEntries = [];
      const resolvedNames = [];
      const seen = new Set();

      for (const raw of trimmed) {
        const key = normalizeHeroName(raw);
        if (!key || seen.has(key)) continue;
        const candidates = heroLookup.get(key);
        if (candidates && candidates.length) {
          seen.add(key);
          resolvedNames.push(raw);
          matchedEntries.push(candidates[0]);
        }
      }

      if (!matchedEntries.length) {
        const fallbackHero = fallbackContext?.participant?.hero || null;
        if (fallbackHero) {
          matchedEntries.push({
            hero: fallbackHero,
            participant: fallbackContext?.participant || null,
            slotIndex: fallbackContext?.slotIndex ?? null,
          });
          if (fallbackHero.name) {
            resolvedNames.push(fallbackHero.name);
          }
        } else if (fallbackContext?.heroSlot?.name) {
          resolvedNames.push(fallbackContext.heroSlot.name);
        }
      }

      const backgrounds = matchedEntries
        .map(entry => entry.hero?.background_url || entry.hero?.image_url || '')
        .filter(Boolean);
      const bgmSource = matchedEntries.find(entry => entry.hero?.bgm_url);

      const audioProfile = bgmSource
        ? {
            heroId: bgmSource.hero?.id || null,
            heroName: bgmSource.hero?.name || '',
            bgmUrl: bgmSource.hero?.bgm_url || null,
            bgmDuration: Number(bgmSource.hero?.bgm_duration_seconds) || null,
            equalizer: null,
            reverb: null,
            compressor: null,
          }
        : null;

      return {
        backgrounds,
        bgmUrl: audioProfile?.bgmUrl || null,
        bgmDuration: audioProfile?.bgmDuration || null,
        actorNames: resolvedNames,
        audioProfile,
      };
    },
    [heroLookup]
  );

  const updateHeroAssets = useCallback(
    (names, fallbackContext) => {
      const { backgrounds, bgmUrl, bgmDuration, actorNames, audioProfile } = resolveHeroAssets(
        names,
        fallbackContext
      );
      setActiveHeroAssets({
        backgrounds,
        bgmUrl,
        bgmDuration,
        audioProfile,
      });
      setActiveActorNames(actorNames);
    },
    [resolveHeroAssets, setActiveHeroAssets, setActiveActorNames]
  );
  const recordTimelineEvents = useCallback(
    (events, { turnNumber: overrideTurn, logEntries = null, buildLogs = true } = {}) => {
      if (!Array.isArray(events) || events.length === 0) return;
      setRealtimeEvents(prev => mergeTimelineEvents(prev, events));

      let entries = logEntries;
      if (!entries && buildLogs) {
        const defaultTurn =
          Number.isFinite(Number(overrideTurn)) && Number(overrideTurn) > 0
            ? Number(overrideTurn)
            : Number.isFinite(Number(turn)) && Number(turn) > 0
              ? Number(turn)
              : null;
        entries = buildLogEntriesFromEvents(events, {
          ownerDisplayMap,
          defaultTurn,
          defaultMode: realtimeEnabled ? 'realtime' : 'async',
        });
      }

      if (Array.isArray(entries) && entries.length) {
        const effectiveTurn =
          Number.isFinite(Number(overrideTurn)) && Number(overrideTurn) > 0
            ? Number(overrideTurn)
            : Number.isFinite(Number(turn)) && Number(turn) > 0
              ? Number(turn)
              : null;
        logTurnEntries({ entries, turnNumber: effectiveTurn }).catch(error => {
          console.error('[StartClient] ?�?�라???�벤??로그 ?�패:', error);
        });
      }
    },
    [ownerDisplayMap, realtimeEnabled, turn, logTurnEntries]
  );

  useParticipantDropInSync({
    participants,
    preflight,
    participantIdSetRef,
    dropInQueueRef,
    setDropInSnapshot,
    processedDropInReleasesRef,
    asyncSessionManagerRef,
    turnTimerServiceRef,
    turnDeadlineRef,
    turnDeadline,
    timeRemainingRef,
    setTurnDeadline,
    setTimeRemaining,
    turn,
    realtimeEnabled,
    recordTimelineEvents,
    recordTurnState,
    setLastDropInTurn,
    setGameMatchSessionMeta,
    withTable,
    supabase,
    buildDropInExtensionTimelineEvent,
    buildDropInMetaPayload,
    gameId,
    participantIdSetRef,
  });

  const captureBattleLog = useCallback(
    (outcome, { reason, turnNumber: overrideTurn } = {}) => {
      try {
        const finalTurn = Number.isFinite(Number(overrideTurn))
          ? Number(overrideTurn)
          : Number.isFinite(Number(turn))
            ? Number(turn)
            : null;
        const draft = buildBattleLogDraft({
          gameId,
          sessionId: sessionInfo?.id || null,
          gameName: game?.name || null,
          result: outcome || 'unknown',
          reason: reason || null,
          logs: logsRef.current || [],
          historyEntries: history.getAll(),
          timelineEvents: realtimeEventsRef.current || [],
          participants,
          realtimePresence,
          dropInSnapshot: dropInSnapshotRef.current || null,
          winCount,
          endTurn: finalTurn,
          endedAt: Date.now(),
        });
        setBattleLogDraft(draft);
      } catch (error) {
        console.warn('[StartClient] 배�? 로그 캡처 ?�패:', error);
      }
    },
    [
      gameId,
  // �? ?�래 useCallback?� ?�양???��? ?�태(history, participants, realtime ??�??�습?�다.
  // 모든 참조�?deps??추�??�면 매우 많�? ?�생?�이 발생?????�어 ?�동 ?�제?�습?�다.
  // 권장: ?�요 ???�수 ?��?�?분리?�거?? ?�는 값들???�정??useMemo/useRef)????  // 최소?�의 deps�?추�???주세?? 변�??�에???�향 범위�?�?검?�하?�요.
  sessionInfo?.id,
      game?.name,
      participants,
      realtimePresence,
      winCount,
      history,
      turn,
      setBattleLogDraft,
    ]
  );

  const persistBattleLogDraft = useCallback(
    async draft => {
      if (!draft || !sessionInfo?.id || !gameId) return;
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('?�션 ?�큰???�인?��? 못했?�니??');
        }

        const response = await fetch('/api/rank/save-battle-log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionInfo.id,
            game_id: gameId,
            draft,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(detail || '배�? 로그 ?�?�에 ?�패?�습?�다.');
        }
      } catch (error) {
        console.warn('[StartClient] battleLogDraft ?�???�패:', error);
      }
    },
    [gameId, sessionInfo?.id]
  );

  useEffect(() => {
    if (!battleLogDraft) return;
    const signature = JSON.stringify({
      session: sessionInfo?.id || null,
      generatedAt: battleLogDraft?.meta?.generatedAt || null,
      result: battleLogDraft?.meta?.result || null,
      endTurn: battleLogDraft?.meta?.endTurn ?? null,
    });
    if (lastBattleLogSignatureRef.current === signature) {
      return;
    }
    lastBattleLogSignatureRef.current = signature;
    persistBattleLogDraft(battleLogDraft);
  }, [battleLogDraft, persistBattleLogDraft, sessionInfo?.id]);

  const finalizeSessionRemotely = useCallback(
    async ({ snapshot, reason, responseText, turnNumber }) => {
      if (!sessionInfo?.id || !gameId) return;
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('?�션 ?�큰???�인?��? 못했?�니??');
        }

        const payload = {
          sessionId: sessionInfo.id,
          gameId,
          turnNumber,
          reason: reason || 'roles_resolved',
          outcome: snapshot || buildOutcomeSnapshot(outcomeLedgerRef.current),
          finalResponse: responseText || '',
        };

        const response = await fetch('/api/rank/complete-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(detail || '?�션 결과 ?�산 ?�청???�패?�습?�다.');
        }
      } catch (error) {
        console.warn('[StartClient] ?�션 결과 ?�산 ?�청 ?�패:', error);
      }
    },
    [sessionInfo?.id, gameId]
  );

  const {
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    apiKeyCooldown,
    apiKeyWarning,
  evaluateApiKeyCooldown,
    effectiveApiKey,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    normalizedGeminiMode,
    normalizedGeminiModel,
    persistApiKeyOnServer,
    applyCooldownInfo,
  } = useStartApiKeyManager({
    initialApiKey: initialStoredApiKey,
    initialApiVersion,
    initialGeminiConfig,
    viewerId,
    turn,
    recordTimelineEvents,
  });

  const { ensureApiKeyReady, voidSession } = useStartCooldown({
    evaluateApiKeyCooldown,
    applyCooldownInfo,
    setStatusMessage,
    setGameVoided,
    setCurrentNodeId,
    setTurnDeadline,
    setTimeRemaining,
    clearConsensusVotes,
    updateHeroAssets,
    updateSessionRecord,
    clearSessionRecord,
    viewerId,
    apiVersion,
    gameId,
    game,
    sessionInfo,
    onSessionVoided: (payload = {}) => {
      const reason =
        payload?.options?.reason || payload?.reason || payload?.options?.message || 'void';
      captureBattleLog('void', { reason, turnNumber: turn });
    },
  });

  useStartSessionWatchdog({
    enabled: !preflight && !!sessionInfo?.id && !!currentNodeId && !gameVoided,
    turn,
    historyVersion,
    logsLength: Array.isArray(logs) ? logs.length : 0,
    timelineVersion: Array.isArray(realtimeEvents) ? realtimeEvents.length : 0,
    turnDeadline,
    turnTimerSeconds,
    isAdvancing,
    gameVoided,
    currentNodeId,
    voidSession,
    recordTimelineEvents,
    sessionInfo,
    gameId,
  });

  const visitedSlotIds = useRef(new Set());
  const apiVersionLock = useRef(null);
  const advanceIntentRef = useRef(null);

  useEffect(() => {
    if (matchMetaLoggedRef.current) return;
    const meta = startMatchMetaRef.current;
    if (!meta) return;
    if (preflight) return;
    const metadata = {
      matching: {
        source: meta.source || 'client_start',
        matchType: meta.matchType || null,
        matchCode: meta.matchCode || null,
        dropInTarget: meta.dropInTarget || null,
        dropInMeta: meta.dropInMeta || null,
        sampleMeta: meta.sampleMeta || null,
        roleStatus: meta.roleStatus || null,
        assignments: Array.isArray(meta.assignments) ? meta.assignments : [],
        storedAt: meta.storedAt || Date.now(),
        mode: meta.mode || null,
        turnTimer: meta.turnTimer || null,
      },
    };
    recordTimelineEvents(
      [
        {
          type: 'drop_in_matching_context',
          ownerId: null,
          reason: metadata.matching.matchType || 'matched',
          turn: 0,
          timestamp: metadata.matching.storedAt,
          context: { actorLabel: '?�스??, matchType: metadata.matching.matchType || null },
          metadata,
        },
      ],
      { turnNumber: 0 }
    );
    matchMetaLoggedRef.current = true;
  }, [preflight, recordTimelineEvents]);
  const normalizedViewerId = useMemo(() => {
    if (!viewerId) return '';
    return String(viewerId).trim();
  }, [viewerId]);
  const eligibleOwnerIds = consensusState?.eligibleOwnerIds || [];
  const consentedOwnerIds = consensusState?.consentedOwnerIds || [];
  const consensusCount = consensusState?.consensusCount || 0;
  const needsConsensus = !preflight && Boolean(consensusState?.needsConsensus);
  const viewerCanConsent =
    needsConsensus && normalizedViewerId ? eligibleOwnerIds.includes(normalizedViewerId) : false;
  const viewerHasConsented = viewerCanConsent && consentedOwnerIds.includes(normalizedViewerId);
  const currentNode = useMemo(
    () => graph.nodes.find(node => node.id === currentNodeId) || null,
    [graph.nodes, currentNodeId]
  );
  const aiMemory = useMemo(() => history.getAiMemory({ last: 24 }), [history]);
  const playerHistories = useMemo(
    () =>
      participants.map((participant, index) => ({
        slotIndex: index,
        role: participant?.role || '',
        heroName:
          participant?.hero?.name ||
          participant?.name ||
          participant?.hero_name ||
          participant?.heroName ||
          '',
        entries: history.getVisibleForSlot(index, { onlyPublic: true, last: 10 }),
      })),
    [participants, history]
  );
  const currentActorContext = useMemo(
    () => resolveActorContext({ node: currentNode, slots, participants }),
    [currentNode, slots, participants]
  );
  const slotType = currentNode?.slot_type || 'ai';
  const isUserActionSlot = slotType === 'user_action' || slotType === 'manual';
  const viewerOwnsSlot =
    isUserActionSlot && viewerId && currentActorContext?.participant?.owner_id === viewerId;
  const canSubmitAction = !isUserActionSlot || viewerOwnsSlot;
  const currentActorInfo = useMemo(
    () => ({
      slotIndex: currentActorContext?.slotIndex ?? null,
      role: currentActorContext?.participant?.role || currentActorContext?.heroSlot?.role || '',
      name:
        currentActorContext?.participant?.hero?.name || currentActorContext?.heroSlot?.name || '',
      isUserAction: isUserActionSlot,
    }),
    [currentActorContext, isUserActionSlot]
  );
  // �? ??useMemo??`participants`?� `viewerId`�?기반?�로 뷰어 참�???객체�?계산?�니??
  // deps??모든 관??값을 추�??�면 불필?�한 ?�계?�이 발생?????�어 ?�동 ?�제?�습?�다.
  // 권장: ?�요??경우 계산 로직?????��? ?�닛?�로 분리?�거?? 참조�??�정?�한 ??  // 최소 deps�?명시??주세??
  const viewerParticipant = useMemo(() => {
    if (!viewerId) return null;
    return (
      participants.find(participant => {
        const ownerId =
          participant?.owner_id ||
          participant?.ownerId ||
          participant?.ownerID ||
          participant?.owner?.id ||
          null;
        return ownerId === viewerId;
      }) || null
    );
  }, [participants, viewerId]);
  // �? bootLocalSession?� 부?�스?�랩 ???�러 ?��? ?�태�??�고 초기?�합?�다.
  // 모든 참조�?deps???�으�?불필?�한 ?�실?�이 발생?????�어 ?�동 ?�제?�습?�다.
  // 권장: ???�수???�요 ?????��? ?�위�?분리?�거?? ?�정?�한 참조�??�용????  // 최소 deps�?추�???주세?? 변�????�향 범위�?검?�해 주세??
  const bootLocalSession = useBootLocalSession({
    graph,
    history,
    historySeedRef,
    systemPrompt,
    participants,
    updateHeroAssets,
    rememberActiveSession,
    turnTimerSeconds,
    realtimeEnabled,
    viewerId,
    applyRealtimeSnapshot,
    bumpHistoryVersion,
    clearConsensusVotes,
    patchEngineState,
    setActiveGlobal,
    setActiveLocal,
    setBattleLogDraft,
    setCurrentNodeId,
    setLastDropInTurn,
    setLogs,
    setPreflight,
    setStatusMessage,
    setTimeRemaining,
    setTurn,
    setTurnDeadline,
    setWinCount,
    realtimeManagerRef,
    visitedSlotIds,
    apiVersionLock,
    turnTimerServiceRef,
    dropInQueueRef,
    processedDropInReleasesRef,
    asyncSessionManagerRef,
    participantIdSetRef,
    lastScheduledTurnRef,
    logsRef,
    buildSlotsFromParticipants,
    deriveEligibleOwnerIds,
    collectUniqueOwnerIds,
    buildOwnerRosterSnapshot,
    resolveActorContext,
  });
  bootLocalSessionRef.current = bootLocalSession;

  const handleStart = useCallback(async () => {
    if (graph.nodes.length === 0) {
      setStatusMessage('?�작???�롬?�트 ?�트�?찾을 ???�습?�다.');
      return;
    }

    if (startingSession) {
      return;
    }

    if (!gameId) {
      setStatusMessage('게임 ?�보�?찾을 ???�습?�다.');
      return;
    }

    if (effectiveApiKey) {
      if (!ensureApiKeyReady(effectiveApiKey)) {
        return;
      }

      await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
        geminiMode: normalizedGeminiMode,
        geminiModel: normalizedGeminiModel,
      });
    }

  // �? ??블록(?�션 ?�작 로직)?� ?��? ?�태?� 비동�??�출???�함?�니??
  // deps??모든 관??값을 추�??�면 반복 ?�출/?�능 문제가 발생?????�어
  // ?�동?�로 ?�제?�습?�다. ?�전?�게 변경하?�면 로직??분리?�거??  // ?��? 참조�??�정?�한 ??최소 deps�?추�??�세??
    setStartingSession(true);
    setStartingSession(true);
    setStatusMessage('?�션??준비하??중입?�다??);

    let sessionReady = false;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('?�션 ?�보가 만료?�었?�니?? ?�시 로그?�해 주세??');
      }

      const response = await fetch('/api/rank/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          mode: realtimeEnabled ? 'realtime' : 'manual',
          role: viewerParticipant?.role || null,
          match_code: null,
        }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.detail ||
          '?�투 ?�션??준비하지 못했?�니?? ?�시 ???�시 ?�도??주세??';
        throw new Error(message);
      }

      if (!payload?.ok) {
        const message =
          payload?.error || '?�투 ?�션??준비하지 못했?�니?? ?�시 ???�시 ?�도??주세??';
        throw new Error(message);
      }

      const sessionPayload = payload?.session || null;
      if (!sessionPayload?.id) {
        throw new Error('?�션 ?�보�?받�? 못했?�니?? ?�시 ???�시 ?�도??주세??');
      }

      setSessionInfo({
        id: sessionPayload.id,
        status: sessionPayload.status || 'active',
        createdAt: sessionPayload.created_at || null,
        reused: Boolean(sessionPayload.reused),
      });

      sessionReady = true;
    } catch (error) {
      console.error('?�션 준�??�패:', error);
      const message =
        error?.message || '?�투 ?�션??준비하지 못했?�니?? ?�시 ???�시 ?�도??주세??';
      setStatusMessage(message);
    } finally {
      setStartingSession(false);
    }

    if (!sessionReady) {
      return;
    }

    setStatusMessage('매칭 ?�이?��? 검증하??중입?�다??);
    await new Promise(resolve => setTimeout(resolve, 200));

    let sessionParticipants = participants;
    try {
      const { participants: sanitized, removed } = reconcileParticipantsForGame({
        participants,
        slotLayout,
        matchingMetadata,
      });

      if (!sanitized || sanitized.length === 0) {
        setStatusMessage('??��??맞는 참�??��? 찾을 ???�어 게임???�작?????�습?�다.');
        return;
      }

      sessionParticipants = sanitized;

      if (removed.length) {
        const summary = formatPreflightSummary(removed);
        if (summary) {
          console.warn('[StartClient] ?�보?�으�??�외??참�???목록:\n' + summary);
          setPromptMetaWarning(prev => {
            const trimmed = prev ? String(prev).trim() : '';
            const notice = `[?�보?? ??�� 검증에???�외??참�???\n${summary}`;
            return trimmed ? `${trimmed}\n\n${notice}` : notice;
          });
        }
        setStatusMessage('??��??맞�? ?�는 참�??��? ?�외?�고 게임???�작?�니??');
      } else {
        setStatusMessage('게임 준비�? ?�료?�었?�니??');
      }
    } catch (error) {
      console.error('?�보??검�??�패:', error);
      setStatusMessage('매칭 ?�이?��? 검증하지 못했?�니?? ?�시 ???�시 ?�도??주세??');
      return;
    }

    bootLocalSession(sessionParticipants);
  }, [
    apiVersion,
    bootLocalSession,
    realtimeEnabled,
    gameId,
    graph.nodes,
    startingSession,
    viewerParticipant?.role,
    effectiveApiKey,
    ensureApiKeyReady,
    persistApiKeyOnServer,
    normalizedGeminiMode,
    normalizedGeminiModel,
    participants,
    slotLayout,
    matchingMetadata,
    setPromptMetaWarning,
    setStatusMessage,
  ]);

  const advanceTurn = useCallback(
    async (overrideResponse = null, options = {}) => {
      if (preflight) {
        setStatusMessage('먼�? "게임 ?�작"???�러 주세??');
        return;
      }
      if (!currentNodeId) {
        setStatusMessage('진행 가?�한 ?�드가 ?�습?�다.');
        return;
      }

      const node = graph.nodes.find(entry => entry.id === currentNodeId);
      if (!node) {
        setStatusMessage('?�재 ?�드 ?�보�?찾을 ???�습?�다.');
        return;
      }

      if (gameVoided) {
        setStatusMessage('게임??무효 처리?�어 ???�상 진행?????�습?�다.');
        return;
      }

  // �? advanceTurn?� 많�? ?��? ?�태?� 콜백(graph, history, participants, API ????  // ?�존?�니?? 모든 참조�?deps??추�??�면 ?�생?�이 ??��?�으�??�어???�능/?�작??  // ?�향??�????�으므�??�동?�로 ?�제?�습?�다. 리팩?�링 ?�에???��? 참조�?  // ?�정??useMemo/useRef)?�거?? ?�수�????��? ?�위�?분리????최소 deps�?  // 추�???주세?? 변�????�향 범위�?반드??검?�하?�요.
      const advanceReason =
        typeof options?.reason === 'string' && options.reason.trim()
          ? options.reason.trim()
          : 'unspecified';

      const actorContext = resolveActorContext({ node, slots, participants });
      const slotBinding = resolveSlotBinding({ node, actorContext });
      const slotTypeValue = node.slot_type || 'ai';
      const isUserAction = slotTypeValue === 'user_action' || slotTypeValue === 'manual';
      const historyRole = isUserAction ? 'user' : 'assistant';
      const actingOwnerId = actorContext?.participant?.owner_id || null;

      const finalizeRealtimeTurn = reason => {
        if (!realtimeEnabled) return;
        const manager = realtimeManagerRef.current;
        if (!manager) return;
        const result = manager.completeTurn({
          turnNumber: turn,
          reason: reason || advanceReason,
          eligibleOwnerIds: deriveEligibleOwnerIds(participants),
        });
        if (!result) return;
        const numericTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
        recordTurnState({
          turnNumber: numericTurn,
          status: reason ? `completed:${reason}` : `completed:${advanceReason}`,
          deadline: 0,
          remainingSeconds: 0,
        });
        lastBroadcastTurnStateRef.current = { turnNumber: numericTurn, deadline: 0 };
        applyRealtimeSnapshot(result.snapshot);

        const warningReasonMap = new Map();
        const escalationReasonMap = new Map();

        if (Array.isArray(result.events) && result.events.length) {
          const warningLimitValue = Number.isFinite(Number(result.snapshot?.warningLimit))
            ? Number(result.snapshot.warningLimit)
            : undefined;
          const eventEntries = [];
          result.events.forEach(event => {
            if (!event) return;
            const ownerId = event.ownerId ? String(event.ownerId).trim() : '';
            if (!ownerId) return;
            const info = ownerDisplayMap.get(ownerId);
            const displayName = info?.displayName || `?�레?�어 ${ownerId.slice(0, 6)}`;
            const baseLimit = Number.isFinite(Number(event.limit))
              ? Number(event.limit)
              : warningLimitValue;
            const reasonLabel = formatRealtimeReason(event.reason);
            const eventId = event.id || event.eventId || null;
            if (event.type === 'warning') {
              if (reasonLabel) {
                warningReasonMap.set(ownerId, reasonLabel);
              }
              const strikeText = Number.isFinite(Number(event.strike))
                ? `${Number(event.strike)}??
                : '1??;
              const remainingText =
                Number.isFinite(Number(event.remaining)) && Number(event.remaining) > 0
                  ? ` (?��? 기회 ${Number(event.remaining)}??`
                  : '';
              const reasonSuffix = reasonLabel ? ` ??${reasonLabel}` : '';
              eventEntries.push({
                role: 'system',
                content: `?�️ ${displayName} 경고 ${strikeText}${remainingText}${reasonSuffix}`,
                public: true,
                visibility: 'public',
                extra: {
                  eventType: 'warning',
                  ownerId,
                  strike: Number.isFinite(Number(event.strike)) ? Number(event.strike) : null,
                  remaining:
                    Number.isFinite(Number(event.remaining)) && Number(event.remaining) >= 0
                      ? Number(event.remaining)
                      : null,
                  limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
                  reason: event.reason || null,
                  turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
                  timestamp: Number.isFinite(Number(event.timestamp))
                    ? Number(event.timestamp)
                    : Date.now(),
                  eventId,
                  status: event.status || null,
                },
              });
            } else if (event.type === 'proxy_escalated') {
              if (reasonLabel) {
                escalationReasonMap.set(ownerId, reasonLabel);
              }
              const strikeText = Number.isFinite(Number(event.strike))
                ? ` (경고 ${Number(event.strike)}???�적)`
                : '';
              const reasonSuffix = reasonLabel ? ` ??${reasonLabel}` : '';
              eventEntries.push({
                role: 'system',
                content: `?�� ${displayName} ?�???�환${strikeText}${reasonSuffix}`,
                public: true,
                visibility: 'public',
                extra: {
                  eventType: 'proxy_escalated',
                  ownerId,
                  strike: Number.isFinite(Number(event.strike)) ? Number(event.strike) : null,
                  limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
                  reason: event.reason || null,
                  turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
                  timestamp: Number.isFinite(Number(event.timestamp))
                    ? Number(event.timestamp)
                    : Date.now(),
                  status: 'proxy',
                  eventId,
                },
              });
            }
          });
          if (eventEntries.length) {
            logTurnEntries({ entries: eventEntries, turnNumber: turn }).catch(error => {
              console.error('[StartClient] 경고/?�???�벤??로그 ?�패:', error);
            });
          }
        }

        if (Array.isArray(result.warnings) && result.warnings.length) {
          const messages = result.warnings
            .map(({ ownerId, strike, remaining, reason }) => {
              if (!ownerId) return null;
              const normalized = String(ownerId).trim();
              if (!normalized) return null;
              const info = ownerDisplayMap.get(normalized);
              const displayName = info?.displayName || `?�레?�어 ${normalized.slice(0, 6)}`;
              const remainText = remaining > 0 ? ` (?��? 기회 ${remaining}??` : '';
              const reasonLabel = warningReasonMap.get(normalized) || formatRealtimeReason(reason);
              const reasonSuffix = reasonLabel ? ` ??${reasonLabel}` : '';
              return `${displayName} 경고 ${strike}??{remainText}${reasonSuffix}`;
            })
            .filter(Boolean);
          if (messages.length) {
            const notice = `경고: ${messages.join(', ')} - "?�음" 버튼???�러 참여??주세??`;
            const prevMessage = statusMessageRef.current;
            const nextMessage = !prevMessage
              ? notice
              : prevMessage.includes(notice)
                ? prevMessage
                : `${prevMessage}\n${notice}`;
            patchEngineState({ statusMessage: nextMessage });
          }
        }

        if (Array.isArray(result.escalated) && result.escalated.length) {
          const escalatedSet = new Set(
            result.escalated.map(ownerId => (ownerId ? String(ownerId).trim() : '')).filter(Boolean)
          );
          if (escalatedSet.size) {
            const updatedParticipants = participantsRef.current.map(participant => {
              const ownerId = deriveParticipantOwnerId(participant);
              if (!ownerId) return participant;
              const normalized = String(ownerId).trim();
              if (!escalatedSet.has(normalized)) return participant;
              const statusValue = String(participant?.status || '').toLowerCase();
              if (statusValue === 'proxy') return participant;
              return { ...participant, status: 'proxy' };
            });
            patchEngineState({ participants: updatedParticipants });
            const names = Array.from(escalatedSet).map(ownerId => {
              const info = ownerDisplayMap.get(ownerId);
              const displayName = info?.displayName || `?�레?�어 ${ownerId.slice(0, 6)}`;
              const reasonLabel = escalationReasonMap.get(ownerId);
              return reasonLabel ? `${displayName} (${reasonLabel})` : displayName;
            });
            const notice = `?�???�환: ${names.join(', ')} ??3???�상 ?�답?��? ?�아 ?�??���?교체?�었?�니??`;
            const prevMessage = statusMessageRef.current;
            const nextMessage = !prevMessage
              ? notice
              : prevMessage.includes(notice)
                ? prevMessage
                : `${prevMessage}\n${notice}`;
            patchEngineState({ statusMessage: nextMessage });
          }
        }
      };

      const recordRealtimeParticipation = (ownerId, type) => {
        if (!realtimeEnabled) return;
        if (!ownerId) return;
        const manager = realtimeManagerRef.current;
        if (!manager) return;
        const snapshot = manager.recordParticipation(ownerId, turn, { type });
        applyRealtimeSnapshot(snapshot);
      };

      if (isUserAction && (!viewerId || actingOwnerId !== viewerId)) {
        setStatusMessage('?�재 차�????�레?�어�??�동???�출?????�습?�다.');
        return;
      }

      if (isUserAction && actingOwnerId) {
        recordRealtimeParticipation(actingOwnerId, 'action');
      }

      setIsAdvancing(true);
      setStatusMessage('');
      setTurnDeadline(null);
      setTimeRemaining(null);

      try {
        const compiled = makeNodePrompt({
          node,
          slots,
          historyText: history.joinedText({ onlyPublic: false, last: 12 }),
          activeGlobalNames: activeGlobal,
          activeLocalNames: activeLocal,
          currentSlot: slotBinding.templateSlotRef,
        });

        const promptText = compiled.text;
        const historyPayload = prepareHistoryPayload(aiMemory, { limit: 32 });
        if (compiled.pickedSlot != null) {
          visitedSlotIds.current.add(String(compiled.pickedSlot));
        }

        let responseText =
          typeof overrideResponse === 'string' ? overrideResponse.trim() : manualResponse.trim();

        let loggedByServer = false;
        let loggedTurnNumber = null;
        let serverSummary = null;

        let effectiveSystemPrompt = systemPrompt;
        let effectivePrompt = promptText;

        if (!realtimeEnabled && isUserAction) {
          const persona = buildUserActionPersona(actorContext);
          effectiveSystemPrompt = [systemPrompt, persona.system].filter(Boolean).join('\n\n');
          effectivePrompt = persona.prompt ? `${persona.prompt}\n\n${promptText}` : promptText;
        }

        if (!responseText) {
          if (!effectiveApiKey) {
            setStatusMessage(
              'AI API ?��? ?�력?��? ?�았?�니?? ?�쪽 ?�널?�서 ?��? ?�력?????�시 ?�도??주세??'
            );
            return;
          }

          if (realtimeEnabled) {
            if (apiVersionLock.current && apiVersionLock.current !== apiVersion) {
              throw new Error('?�시�?매칭?�서??처음 ?�택??API 버전??변경할 ???�습?�다.');
            }
          }

          if (!sessionInfo?.id) {
            throw new Error('?�션 ?�보�??�인?????�습?�다. ?�이지�??�로고침??주세??');
          }

          if (!ensureApiKeyReady(effectiveApiKey)) {
            return;
          }

          await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
            geminiMode: normalizedGeminiMode,
            geminiModel: normalizedGeminiModel,
          });

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }

          const token = sessionData?.session?.access_token;
          if (!token) {
            throw new Error('?�션 ?�큰???�인?????�습?�다.');
          }

          const res = await fetch('/api/rank/run-turn', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              apiKey: effectiveApiKey,
              system: effectiveSystemPrompt,
              prompt: effectivePrompt,
              apiVersion,
              geminiMode: apiVersion === 'gemini' ? normalizedGeminiMode : undefined,
              geminiModel: apiVersion === 'gemini' ? normalizedGeminiModel : undefined,
              session_id: sessionInfo.id,
              game_id: gameId,
              prompt_role: 'system',
              response_role: historyRole,
              response_public: true,
              history: historyPayload,
            }),
          });

          let payload = {};
          try {
            payload = await res.json();
          } catch {
            payload = {};
          }

          if (!res.ok) {
            const error = new Error(payload?.error || payload?.detail || 'AI ?�출???�패?�습?�다.');
            if (payload?.error) {
              error.code = payload.error;
            }
            if (typeof payload?.detail === 'string' && payload.detail.trim()) {
              error.detail = payload.detail.trim();
            }
            throw error;
          }

          if (payload?.error) {
            const error = new Error(payload.error);
            error.code = payload.error;
            throw error;
          }

          responseText =
            (typeof payload?.text === 'string' && payload.text.trim()) ||
            payload?.choices?.[0]?.message?.content ||
            payload?.content ||
            '';

          if (payload?.logged) {
            loggedByServer = true;
            const numericTurn = Number(payload?.turn_number);
            if (Number.isFinite(numericTurn)) {
              loggedTurnNumber = numericTurn;
            }
            if (Array.isArray(payload?.entries)) {
              const responseEntry = payload.entries.find(entry => entry?.role === historyRole);
                  if (responseEntry?.summary_payload) {
                    try {
                      serverSummary = JSON.parse(JSON.stringify(responseEntry.summary_payload));
                    } catch {
                      serverSummary = responseEntry.summary_payload;
                    }
                  }
            }
          }

          if (realtimeEnabled && !apiVersionLock.current) {
            apiVersionLock.current = apiVersion;
          }
        }

        if (!responseText) {
          responseText = ['(?�플 ?�답)', '', '', '', '', '무승부'].join('\n');
        }

        const slotIndex = slotBinding.slotIndex;
        const promptAudiencePayload =
          slotBinding.promptAudience.audience === 'slots'
            ? { audience: 'slots', slots: slotBinding.visibleSlots }
            : { audience: 'all' };
        const responseAudiencePayload =
          slotBinding.responseAudience.audience === 'slots'
            ? { audience: 'slots', slots: slotBinding.visibleSlots }
            : { audience: 'all' };
        const responseIsPublic = !slotBinding.hasLimitedAudience;
        const promptVisibility = slotBinding.hasLimitedAudience ? 'private' : 'hidden';
        const responseVisibility = responseIsPublic ? 'public' : 'private';

        const fallbackActorNames = [];
        if (actorContext?.participant?.hero?.name) {
          fallbackActorNames.push(actorContext.participant.hero.name);
        } else if (actorContext?.heroSlot?.name) {
          fallbackActorNames.push(actorContext.heroSlot.name);
        }

        const promptEntry = history.push({
          role: 'system',
          content: `[PROMPT]\n${effectivePrompt}`,
          public: false,
          includeInAi: true,
          ...promptAudiencePayload,
          meta: { slotIndex },
        });
        const responseEntry = history.push({
          role: historyRole,
          content: responseText,
          public: responseIsPublic,
          includeInAi: true,
          ...responseAudiencePayload,
          meta: { slotIndex },
        });
        bumpHistoryVersion();

        const outcome = parseOutcome(responseText);
        const outcomeVariables = outcome.variables || [];
        const { body: visibleResponse } = stripOutcomeFooter(responseText);
        const triggeredEnd = endConditionVariable
          ? outcomeVariables.includes(endConditionVariable)
          : false;
        const resolvedActorNames =
          outcome.actors && outcome.actors.length ? outcome.actors : fallbackActorNames;
        updateHeroAssets(resolvedActorNames, actorContext);
        if (promptEntry?.meta) {
          promptEntry.meta = { ...promptEntry.meta, actors: resolvedActorNames };
        }
        if (responseEntry?.meta) {
          responseEntry.meta = { ...responseEntry.meta, actors: resolvedActorNames };
        }
        const nextActiveGlobal = Array.from(
          new Set([...activeGlobal, ...(outcome.variables || [])])
        );

        let fallbackSummary = null;
        if (!loggedByServer) {
          fallbackSummary = {
            preview: visibleResponse.slice(0, 240),
            promptPreview: promptText.slice(0, 240),
            outcome: {
              lastLine: outcome.lastLine || undefined,
              variables:
                outcome.variables && outcome.variables.length ? outcome.variables : undefined,
              actors:
                resolvedActorNames && resolvedActorNames.length ? resolvedActorNames : undefined,
            },
            extra: {
              slotIndex,
              nodeId: node?.id ?? null,
              source: 'fallback-log',
            },
          };

          await logTurnEntries({
            entries: [
              {
                role: promptEntry?.role || 'system',
                content: promptEntry?.content || promptText,
                public: promptEntry?.public,
                visibility: slotBinding.hasLimitedAudience
                  ? promptVisibility
                  : promptEntry?.public === false
                    ? 'hidden'
                    : 'public',
                extra: { slotIndex },
              },
              {
                role: historyRole,
                content: responseText,
                public: responseEntry?.public,
                visibility: responseIsPublic ? 'public' : responseVisibility,
                actors: resolvedActorNames,
                summary: fallbackSummary,
                extra: {
                  slotIndex,
                  nodeId: node?.id ?? null,
                },
              },
            ],
            turnNumber: loggedTurnNumber ?? turn,
          });
        }

        setActiveLocal(outcomeVariables);
        setActiveGlobal(nextActiveGlobal);

        const context = createBridgeContext({
          turn,
          historyUserText: history.joinedText({ onlyPublic: true, last: 5 }),
          historyAiText: history.joinedText({ onlyPublic: false, last: 5 }),
          visitedSlotIds: visitedSlotIds.current,
          participantsStatus,
          activeGlobalNames: nextActiveGlobal,
          activeLocalNames: outcomeVariables,
          currentRole: actorContext?.participant?.role || actorContext?.heroSlot?.role || null,
          sessionFlags: {
            brawlEnabled,
            gameVoided,
            winCount,
            lastDropInTurn,
            endTriggered: triggeredEnd,
            dropInGraceTurns: 0,
          },
        });

        const outgoing = graph.edges.filter(
          edge => edge.from === String(node.id) || edge.from === node.id
        );
        const chosenEdge = pickNextEdge(outgoing, context);

        setLogs(prev => {
          const nextLogs = [
            ...prev,
            {
              turn,
              nodeId: node.id,
              slotIndex,
              promptAudience: slotBinding.promptAudience,
              responseAudience: slotBinding.responseAudience,
              prompt: promptText,
              response: responseText,
              visibleResponse,
              outcome: outcome.lastLine || '',
              variables: outcomeVariables,
              next: chosenEdge?.to || null,
              action: chosenEdge?.data?.action || 'continue',
              actors: resolvedActorNames,
              summary: serverSummary || fallbackSummary || null,
            },
          ];
          logsRef.current = nextLogs;
          return nextLogs;
        });

        clearManualResponse();

        if (outcomeLedgerRef.current) {
          const recordResult = recordOutcomeLedger(outcomeLedgerRef.current, {
            turn,
            slotIndex,
            resultLine: outcome.lastLine || '',
            variables: outcomeVariables,
            actors: resolvedActorNames,
            participantsSnapshot: participantsRef.current,
            brawlEnabled,
          });

          if (recordResult.changed) {
            const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
            setSessionOutcome(snapshot);

            if (recordResult.completed && !sessionFinalizedRef.current) {
              sessionFinalizedRef.current = true;
              const statusMessageText = buildOutcomeStatusMessage(snapshot);
              setStatusMessage(statusMessageText);
              finalizeRealtimeTurn('roles_resolved');
              setCurrentNodeId(null);
              setTurnDeadline(null);
              setTimeRemaining(null);
              captureBattleLog(
                snapshot.overallResult === 'won'
                  ? 'win'
                  : snapshot.overallResult === 'lost'
                    ? 'lose'
                    : 'draw',
                { reason: 'roles_resolved', turnNumber: turn }
              );
              clearSessionRecord();
              void finalizeSessionRemotely({
                snapshot,
                reason: 'roles_resolved',
                responseText,
                turnNumber: turn,
              });
              return;
            }
          }
        }

        if (!chosenEdge) {
          finalizeRealtimeTurn('no-bridge');
          setCurrentNodeId(null);
          setStatusMessage('???�상 진행??경로가 ?�어 ?�션??종료?�니??');
          setTurnDeadline(null);
          setTimeRemaining(null);
          captureBattleLog('terminated', { reason: 'no_path', turnNumber: turn });
          clearSessionRecord();
          return;
        }

        const action = chosenEdge.data?.action || 'continue';
        const nextNodeId = chosenEdge.to != null ? String(chosenEdge.to) : null;

        if (action === 'win') {
          const upcomingWin = winCount + 1;
          if (brawlEnabled && !triggeredEnd) {
            setWinCount(prev => prev + 1);
            setStatusMessage(`?�리 ${upcomingWin}???�성! ?�입 ?�용 규칙?�로 ?�투가 계속?�니??`);
          } else {
            if (brawlEnabled) {
              setWinCount(() => upcomingWin);
            }
            finalizeRealtimeTurn('win');
            setCurrentNodeId(null);
            const suffix = brawlEnabled ? ` ?�적 ?�리 ${upcomingWin}?��? 기록?�습?�다.` : '';
            setStatusMessage(`?�리 조건??충족?�었?�니??${suffix}`);
            setTurnDeadline(null);
            setTimeRemaining(null);
            captureBattleLog('win', { reason: 'win', turnNumber: turn });
            sessionFinalizedRef.current = true;
            if (outcomeLedgerRef.current) {
              const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
              setSessionOutcome(snapshot);
              void finalizeSessionRemotely({
                snapshot,
                reason: 'win',
                responseText,
                turnNumber: turn,
              });
            } else {
              void finalizeSessionRemotely({
                snapshot: null,
                reason: 'win',
                responseText,
                turnNumber: turn,
              });
            }
            clearSessionRecord();
            return;
          }
        } else if (action === 'lose') {
          finalizeRealtimeTurn('lose');
          setCurrentNodeId(null);
          setStatusMessage(
            brawlEnabled
              ? '?�배�??�당 ??��군이 ?�장?�서 추방?�었?�니??'
              : '?�배 조건??충족?�었?�니??'
          );
          setTurnDeadline(null);
          setTimeRemaining(null);
          captureBattleLog('lose', { reason: 'lose', turnNumber: turn });
          sessionFinalizedRef.current = true;
          if (outcomeLedgerRef.current) {
            const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
            setSessionOutcome(snapshot);
            void finalizeSessionRemotely({
              snapshot,
              reason: 'lose',
              responseText,
              turnNumber: turn,
            });
          } else {
            void finalizeSessionRemotely({
              snapshot: null,
              reason: 'lose',
              responseText,
              turnNumber: turn,
            });
          }
          if (viewerId && actingOwnerId === viewerId) {
            markSessionDefeated();
          } else {
            clearSessionRecord();
          }
          return;
        } else if (action === 'draw') {
          finalizeRealtimeTurn('draw');
          setCurrentNodeId(null);
          setStatusMessage('무승부�?종료?�었?�니??');
          setTurnDeadline(null);
          setTimeRemaining(null);
          captureBattleLog('draw', { reason: 'draw', turnNumber: turn });
          sessionFinalizedRef.current = true;
          if (outcomeLedgerRef.current) {
            const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
            setSessionOutcome(snapshot);
            void finalizeSessionRemotely({
              snapshot,
              reason: 'draw',
              responseText,
              turnNumber: turn,
            });
          } else {
            void finalizeSessionRemotely({
              snapshot: null,
              reason: 'draw',
              responseText,
              turnNumber: turn,
            });
          }
          clearSessionRecord();
          return;
        }

        if (!nextNodeId) {
          finalizeRealtimeTurn('missing-next');
          setCurrentNodeId(null);
          setStatusMessage('?�음??진행???�드�?찾을 ???�습?�다.');
          setTurnDeadline(null);
          setTimeRemaining(null);
          captureBattleLog('terminated', { reason: 'missing_next', turnNumber: turn });
          clearSessionRecord();
          return;
        }

        finalizeRealtimeTurn('continue');
        setCurrentNodeId(nextNodeId);
        setTurn(prev => prev + 1);
      } catch (err) {
        console.error(err);
        if (isApiKeyError(err)) {
          const reason = err?.code || 'api_key_error';
          const fallback =
            reason === 'quota_exhausted'
              ? '?�용 중인 API ???�도가 모두 ?�진?�어 ?�션??무효 처리?�었?�니?? ???��? ?�록??주세??'
              : reason === 'missing_user_api_key'
                ? 'AI API ?��? ?�력?��? ?�아 ?�션??중단?�었?�니?? ?�쪽 ?�널?�서 ?��? ?�력?????�시 ?�도??주세??'
                : err?.message || 'API ???�류�??�션??무효 처리?�었?�니??';
          voidSession(fallback, {
            apiKey: effectiveApiKey,
            reason,
            provider: apiVersion,
            viewerId,
            gameId,
            sessionId: sessionInfo?.id || null,
            note: err?.message || null,
          });
        } else {
          setStatusMessage(err?.message || '??진행 �??�류가 발생?�습?�다.');
        }
      } finally {
        setIsAdvancing(false);
      }
    },
    [
      preflight,
      currentNodeId,
      graph.nodes,
      graph.edges,
      slots,
      history,
      aiMemory,
      activeGlobal,
      activeLocal,
      manualResponse,
      effectiveApiKey,
      apiVersion,
      systemPrompt,
      turn,
      participants,
      participantsStatus,
      ownerDisplayMap,
      realtimeEnabled,
      brawlEnabled,
      endConditionVariable,
      winCount,
      lastDropInTurn,
      viewerId,
      updateHeroAssets,
      logTurnEntries,
      voidSession,
      gameVoided,
      ensureApiKeyReady,
      persistApiKeyOnServer,
      normalizedGeminiMode,
      normalizedGeminiModel,
      applyRealtimeSnapshot,
      recordTurnState,
  bumpHistoryVersion,
  captureBattleLog,
  clearManualResponse,
  clearSessionRecord,
  finalizeSessionRemotely,
  gameId,
  markSessionDefeated,
  patchEngineState,
  sessionInfo?.id,
  setActiveGlobal,
  setActiveLocal,
  setCurrentNodeId,
  setIsAdvancing,
  setLogs,
  setStatusMessage,
  setTimeRemaining,
  setTurn,
  setTurnDeadline,
  setWinCount,
    ]
  );

  const advanceWithManual = useCallback(() => {
    const trimmed = requireManualResponse();
    if (!trimmed) {
      return;
    }
    advanceIntentRef.current = null;
    clearConsensusVotes();
    advanceTurn(trimmed, { reason: 'manual' });
  }, [advanceTurn, clearConsensusVotes, requireManualResponse]);

  const advanceWithAi = useCallback(() => {
    if (!needsConsensus) {
      if (realtimeEnabled && normalizedViewerId) {
        const manager = realtimeManagerRef.current;
        if (manager) {
          const snapshot = manager.recordParticipation(normalizedViewerId, turn, {
            type: 'vote',
          });
          if (snapshot) {
            applyRealtimeSnapshot(snapshot);
          }
        }
      }
      advanceIntentRef.current = null;
      clearConsensusVotes();
      advanceTurn(null, { reason: 'ai' });
      return;
    }
    if (!viewerCanConsent) {
      setStatusMessage('?�의 ?�?�인 참�??�만 ?�음 ??진행???�안?????�습?�다.');
      return;
    }
    const controller = turnVoteControllerRef.current;
    if (!controller) {
      return;
    }
    if (realtimeEnabled && normalizedViewerId) {
      const manager = realtimeManagerRef.current;
      if (manager) {
        const snapshot = manager.recordParticipation(normalizedViewerId, turn, {
          type: 'vote',
        });
        if (snapshot) {
          applyRealtimeSnapshot(snapshot);
        }
      }
    }
    advanceIntentRef.current = { override: null, reason: 'consensus' };
    let snapshot = controller.getSnapshot();
    if (!controller.hasConsented(normalizedViewerId)) {
      snapshot = controller.registerConsent(normalizedViewerId);
    }
    setConsensusState(snapshot);
    const { consensusCount: futureCount, threshold } = snapshot;
    setStatusMessage(`?�음 ???�의 ${futureCount}/${threshold}�?);
  }, [
    advanceTurn,
    clearConsensusVotes,
    needsConsensus,
    setStatusMessage,
    viewerCanConsent,
    normalizedViewerId,
    realtimeEnabled,
    turn,
    applyRealtimeSnapshot,
  ]);

  const autoAdvance = useCallback(() => {
    advanceIntentRef.current = null;
    clearConsensusVotes();
    const turnNumber = Number.isFinite(Number(turn)) ? Number(turn) : null;
    recordTimelineEvents(
      [
        {
          type: 'turn_timeout',
          turn: turnNumber,
          timestamp: Date.now(),
          reason: 'timeout',
          context: {
            mode: realtimeEnabled ? 'realtime' : 'async',
          },
        },
      ],
      { turnNumber }
    );
    return advanceTurn(null, { reason: 'timeout' });
  }, [advanceTurn, clearConsensusVotes, recordTimelineEvents, turn, realtimeEnabled]);

  useEffect(() => {
    if (!needsConsensus) return undefined;
    if (!advanceIntentRef.current) return undefined;
    if (!consensusState?.hasReachedThreshold) return undefined;
    const turnNumber = Number.isFinite(Number(turn)) ? Number(turn) : null;
    recordTimelineEvents(
      [
        {
          type: 'consensus_reached',
          turn: turnNumber,
          timestamp: Date.now(),
          reason: 'consensus',
          context: {
            consensusCount: consensusState?.consensusCount ?? null,
            threshold: consensusState?.threshold ?? null,
            mode: realtimeEnabled ? 'realtime' : 'async',
          },
        },
      ],
      { turnNumber }
    );
    const intent = advanceIntentRef.current;
    advanceIntentRef.current = null;
    clearConsensusVotes();
    advanceTurn(intent?.override ?? null, { reason: intent?.reason || 'consensus' });
    return undefined;
  }, [
    advanceTurn,
    consensusState?.hasReachedThreshold,
    needsConsensus,
    clearConsensusVotes,
    recordTimelineEvents,
    consensusState?.consensusCount,
    consensusState?.threshold,
    realtimeEnabled,
    turn,
  ]);

  useEffect(() => {
    if (preflight || !realtimeEnabled) {
      const snapshot = turnVoteControllerRef.current?.syncEligibleOwners([]);
      if (snapshot) {
        setConsensusState(snapshot);
      }
      return;
    }
    const snapshot = turnVoteControllerRef.current?.syncEligibleOwners(
      deriveEligibleOwnerIds(participants)
    );
    if (snapshot) {
      setConsensusState(snapshot);
    }
  }, [participants, realtimeEnabled, preflight]);

  useEffect(() => {
    if (preflight) {
      advanceIntentRef.current = null;
      clearConsensusVotes();
    }
  }, [preflight, clearConsensusVotes]);

  useEffect(() => {
    advanceIntentRef.current = null;
    clearConsensusVotes();
  }, [turn, clearConsensusVotes]);

  useEffect(() => {
    const sessionId = sessionInfo?.id;
    if (!sessionId) return undefined;

    const channel = supabase.channel(`rank-session:${sessionId}`, {
      config: { broadcast: { ack: true } },
    });

    const handleTimeline = payload => {
      const raw = payload?.payload || payload || {};
      const events = Array.isArray(raw.events) ? raw.events : [];
      if (!events.length) return;
      setRealtimeEvents(prev => mergeTimelineEvents(prev, events));
    };

    channel.on('broadcast', { event: 'rank:timeline-event' }, handleTimeline);

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        backfillTurnEvents();
        return;
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('[StartClient] ?�시�??�?�라??채널 ?�류가 발생?�습?�다.');
      }
      if (status === 'TIMED_OUT') {
        console.warn(
          '[StartClient] ?�시�??�?�라??채널 구독???�한 ?�간 ?�에 ?�료?��? ?�았?�니??'
        );
      }
    });

    const unsubscribeTurnEvents = subscribeToBroadcastTopic(
      `rank_turn_state_events:session:${sessionId}`,
      change => {
        const changePayload = change?.new || change?.payload || null;
        const commitTimestamp =
          change?.commit_timestamp || change?.payload?.commit_timestamp || null;
        applyTurnStateChange(changePayload, { commitTimestamp });
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    );

    return () => {
      try {
        channel.unsubscribe();
      } catch (error) {
        console.warn('[StartClient] ?�시�??�?�라??채널 ?�제 ?�패:', error);
      }
      if (turnEventBackfillAbortRef.current) {
        turnEventBackfillAbortRef.current.abort();
        turnEventBackfillAbortRef.current = null;
      }
      supabase.removeChannel(channel);
      if (typeof unsubscribeTurnEvents === 'function') {
        unsubscribeTurnEvents();
      }
    };
  }, [sessionInfo?.id, setRealtimeEvents, applyTurnStateChange, backfillTurnEvents]);

  useEffect(() => {
    if (!needsConsensus) {
      const intent = advanceIntentRef.current;
      advanceIntentRef.current = null;
      if (intent) {
        clearConsensusVotes();
        advanceTurn(intent?.override ?? null, {
          reason: intent?.reason || 'consensus',
        });
      }
    }
  }, [needsConsensus, advanceTurn, clearConsensusVotes]);

  const turnTimerSnapshot = useMemo(() => {
    const baseFromState = Number.isFinite(Number(turnTimerSeconds))
      ? Math.max(0, Math.floor(Number(turnTimerSeconds)))
      : null;
    const fallbackBonus = 30;
    const fallbackTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
    const fallbackDropInTurn = Number.isFinite(Number(lastDropInTurn))
      ? Math.floor(Number(lastDropInTurn))
      : 0;

  // �? ??계산?� `turnTimerServiceRef.current` 같�? ?�비???�스?�스�??�습?�다.
  // ?�비???��? ?�태 변경이 ?�더링을 ?�리거하지 ?�으므�?`service`�?deps�?  // 추�??�는 것�? ?�절?��? ?�습?�다. ?�요??경우 ?�비???�근???�정?�하거나
  // 계산??분리??최소 deps�?명시?�세??
    const service = turnTimerServiceRef.current;
    if (!service) {
      return {
        baseSeconds: baseFromState,
        firstTurnBonusSeconds: fallbackBonus,
        firstTurnBonusAvailable: false,
        dropInBonusSeconds: fallbackBonus,
        pendingDropInBonus: false,
        lastTurnNumber: fallbackTurn,
        lastDropInAppliedTurn: fallbackDropInTurn,
      };
    }

    const snapshot = service.getSnapshot() || {};
    const resolvedBase = Number.isFinite(Number(snapshot.baseSeconds))
      ? Math.floor(Number(snapshot.baseSeconds))
      : baseFromState;

    return {
      baseSeconds: resolvedBase,
      firstTurnBonusSeconds: Number.isFinite(Number(snapshot.firstTurnBonusSeconds))
        ? Math.floor(Number(snapshot.firstTurnBonusSeconds))
        : fallbackBonus,
      firstTurnBonusAvailable: Boolean(snapshot.firstTurnBonusAvailable),
      dropInBonusSeconds: Number.isFinite(Number(snapshot.dropInBonusSeconds))
        ? Math.floor(Number(snapshot.dropInBonusSeconds))
        : fallbackBonus,
      pendingDropInBonus: Boolean(snapshot.pendingDropInBonus),
      lastTurnNumber: Number.isFinite(Number(snapshot.lastTurnNumber))
        ? Math.floor(Number(snapshot.lastTurnNumber))
        : fallbackTurn,
      lastDropInAppliedTurn: Number.isFinite(Number(snapshot.lastDropInAppliedTurn))
        ? Math.floor(Number(snapshot.lastDropInAppliedTurn))
        : fallbackDropInTurn,
    };
  }, [turnTimerSeconds, turn, lastDropInTurn]);

  return {
    loading,
    error,
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
    battleLogDraft,
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
    isStarting: startingSession,
    handleStart,
    advanceWithAi,
    advanceWithManual,
    autoAdvance,
    turnTimerSeconds,
  // �? ?�래 값들(`timeRemaining` ???� ?��? ?�?�머??콜백???�해 빈번??변경됩?�다.
  // 모든 관??값을 deps??추�??�면 과도??리렌?��? 발생?????�어 ?�동 ?�제?�습?�다.
  // ?�요 ???�당 값을 ?�정??ref/memo)?�거??로직??분리 ??최소 deps�?명시?�세??
    timeRemaining,
    timeRemaining,
    turnDeadline,
    currentActor: currentActorInfo,
    canSubmitAction,
    activeBackdropUrls: activeHeroAssets.backgrounds,
    activeActorNames,
    activeBgmUrl: activeHeroAssets.bgmUrl,
    activeBgmDuration: activeHeroAssets.bgmDuration,
    activeAudioProfile: activeHeroAssets.audioProfile,
    lastDropInTurn,
    turnTimerSnapshot,
    sessionInfo,
    realtimePresence,
    realtimeEvents,
    dropInSnapshot,
    connectionRoster,
    sessionOutcome,
    sharedTurn: {
      owners: managedOwnerIds,
      roster: sharedTurnRoster,
    },
    consensus: {
      required: eligibleOwnerIds.length,
      count: consensusCount,
      viewerEligible: viewerCanConsent,
      viewerHasConsented,
      active: needsConsensus,
      threshold: consensusState?.threshold ?? Math.max(1, Math.ceil(eligibleOwnerIds.length * 0.8)),
      reached: Boolean(consensusState?.hasReachedThreshold),
    },
  };
}
