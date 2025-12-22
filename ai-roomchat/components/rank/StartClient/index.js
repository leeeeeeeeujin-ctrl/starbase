'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

import styles from './StartClient.module.css';
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
import { CodeWorkspaceProvider } from '@/components/workspace/CodeWorkspaceProvider.jsx';
import GameShell from '@/components/game/GameShell.jsx';
import { createCoreRuntime } from '@/lib/runtime/coreRuntime';
import { loadHooksFromSource } from '@/lib/runtime/safeEvalHookModule';
import {
  applySceneFromRank,
  applySpeakerFromRank,
} from '@/lib/runtime/rankStandardSlots';
import { normalizeBattleOutcome } from '@/lib/runtime/battleLogHelpers';
import { isApiKeyError } from './engine/apiKeyUtils';

// Ensure matchState is always defined in this module so
// any legacy reads during render do not throw ReferenceError.
let matchState = null;

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
  const [gameWorkspace, setGameWorkspace] = useState(null);
  const runtimeBus = useMemo(() => {
    const listeners = new Map();
    return {
      on(event, fn) {
        const arr = listeners.get(event) || [];
        listeners.set(event, [...arr, fn]);
        return () => {
          const cur = listeners.get(event) || [];
          listeners.set(
            event,
            cur.filter(f => f !== fn)
          );
        };
      },
      off(event, fn) {
        const arr = listeners.get(event) || [];
        listeners.set(
          event,
          arr.filter(f => f !== fn)
        );
      },
      emit(event, payload) {
        const arr = listeners.get(event) || [];
        arr.forEach(fn => {
          try {
            fn(payload);
          } catch (e) {
            console.warn('[StartClient] runtimeBus handler error', e);
          }
        });
      },
    };
  }, []);
  const runtimeRef = useRef(null);
  const runtimeHooksRef = useRef(null);
  const battleEndHandledRef = useRef(false);
  const battleOutcomeRef = useRef(null);
  const [battleOutcome, setBattleOutcome] = useState(null);
  const turnLogRef = useRef([]);

  // Keep a lightweight turn-log buffer in the host so hooks like onBattleEnd
  // can see the same runtime:turn-log stream that UI widgets consume.
  useEffect(() => {
    if (!runtimeBus || typeof runtimeBus.on !== 'function') return undefined;
    const off = runtimeBus.on('runtime:turn-log', evt => {
      try {
        if (!evt || typeof evt !== 'object') return;
        const prev = Array.isArray(turnLogRef.current) ? turnLogRef.current : [];
        const next = [...prev, evt];
        // Keep a modest sliding window – enough for onBattleEnd but not unbounded.
        turnLogRef.current = next.slice(-200);
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      try {
        off && off();
      } catch {
        // ignore detach errors
      }
      turnLogRef.current = [];
    };
  }, [runtimeBus]);

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

  const sessionIdFromQuery = useMemo(() => {
    if (!router.isReady) return '';
    const raw = router.query.session;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === null || value === undefined) return '';
    const trimmed = String(value).trim();
    return trimmed;
  }, [router.isReady, router.query.session]);

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

  const engine = useStartClientEngine(gameId, { hostOwnerId, sessionId: sessionIdFromQuery });
  const {
    loading: engineLoading,
    error: engineError,
    game,
    slotLayout,
    graph,
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
    rankContext,
    textRuntimeEnabled,
  } = engine;

  const sessionId = sessionInfo?.id || null;

  const settleTextBattle = useCallback(
    async ({ outcome, ctx }) => {
      if (!sessionId || !gameId) return;

      const events = Array.isArray(turnLogRef.current) ? turnLogRef.current : [];
      const participants = ctx && typeof ctx.participants === 'object' ? ctx.participants : {};
      const meta = {
        ...(ctx && typeof ctx.graphHash === 'string' ? { graphHash: ctx.graphHash } : {}),
        ...(ctx && typeof ctx.hookHash === 'string' ? { hookHash: ctx.hookHash } : {}),
        textBattleSummary:
          outcome && typeof outcome === 'object' ? outcome.finalizeSummary || null : null,
      };

      let textBattleSessionId = null;

      try {
        const resp = await fetch('/api/rank/text-battle-runtime-settle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            gameId,
            events,
            participants,
            variables: ctx && typeof ctx.variables === 'object' ? ctx.variables : {},
          }),
        });
        if (resp && resp.ok) {
          try {
            const payload = await resp.json();
            if (payload && payload.ok && payload.textBattleSessionId) {
              textBattleSessionId = payload.textBattleSessionId;
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (err) {
        try {
          console.warn('[StartClient] text-battle runtime settle failed:', err);
        } catch {
          // ignore console errors
        }
      }

      try {
        await fetch('/api/rank/settle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            gameId,
            battleLog: {
              sessionId,
              gameId,
              events,
              participants,
              outcome,
              meta,
              ...(textBattleSessionId
                ? { textBattleSessionId }
                : null),
            },
            textBattleSessionId: textBattleSessionId || null,
            textBattleSummary:
              outcome && typeof outcome === 'object' ? outcome.finalizeSummary || null : null,
          }),
        });
      } catch (err) {
        try {
          console.warn('[StartClient] 텍스트 배틀 정산 호출 실패:', err);
        } catch {
          // ignore console errors
        }
      }

      // 텍스트 런타임 기반 전투도 랭크 세션 결과를 남기도록 complete-session을 호출한다.
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('세션 토큰을 확인하지 못했습니다.');
        }

        let finalTurnNumber = null;
        try {
          const numericTurns = events
            .map(entry => (Number.isFinite(Number(entry?.turn)) ? Number(entry.turn) : null))
            .filter(value => value !== null);
          if (numericTurns.length) {
            finalTurnNumber = Math.max(...numericTurns);
          }
        } catch {
          // turn 계산 실패는 결과 정산 자체를 막지 않는다.
        }

        const payload = {
          sessionId,
          gameId,
          turnNumber: finalTurnNumber,
          reason: 'text_runtime_battle_end',
          outcome: outcome || {},
          finalResponse: '',
        };

        const resp = await fetch('/api/rank/complete-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          throw new Error(detail || '세션 결과 정산 요청에 실패했습니다.');
        }
      } catch (err) {
        try {
          console.warn('[StartClient] 텍스트 배틀 세션 결과 정산 실패:', err);
        } catch {
          // ignore console errors
        }
      }
    },
    [gameId, sessionId]
  );

  // 브리지: StartClient 엔진 로그를 공통 턴 로그 이벤트(runtime:turn-log)로 내보낸다.
  // logs 배열이 늘어날 때마다 새 항목에 한해서만 이벤트를 발행한다.
  const lastLogCountRef = useRef(0);
  useEffect(() => {
    if (!Array.isArray(logs)) {
      lastLogCountRef.current = 0;
      return;
    }
    const prevCount = lastLogCountRef.current || 0;
    const nextCount = logs.length;
    if (nextCount <= prevCount) {
      lastLogCountRef.current = nextCount;
      return;
    }
    const slice = logs.slice(prevCount);
    slice.forEach((entry) => {
      if (!entry) return;
      try {
        const turn = Number.isFinite(Number(entry.turn)) ? Number(entry.turn) : null;
        const nodeId = entry.nodeId ?? entry.node_id ?? null;
        const nodeLabel = entry.nodeLabel ?? entry.node_label ?? null;
        const prompt =
          (typeof entry.prompt === 'string' && entry.prompt) ||
          (typeof entry.visiblePrompt === 'string' && entry.visiblePrompt) ||
          (typeof entry.displayPrompt === 'string' && entry.displayPrompt) ||
          '';

        // 랭크 엔진 로그에 담긴 가시성 정보를 runtime:turn-log 이벤트로 그대로 전달한다.
        let visibility = null;
        let isVisible = undefined;
        try {
          if (typeof entry.visibility === 'string') {
            visibility = entry.visibility;
          }
          if (typeof entry.isVisible === 'boolean') {
            isVisible = entry.isVisible;
          } else if (typeof entry.public === 'boolean') {
            isVisible = entry.public;
          }
        } catch {
          // visibility 계산 실패는 로그 전파를 막지 않는다.
        }

        const event = {
          turn,
          nodeId,
          nodeLabel,
          reason: entry.reason ?? null,
          input: entry.input ?? null,
          prompt,
          ui: entry.ui ?? null,
          variables: entry.variables ?? null,
          visibility,
          isVisible,
        };
        runtimeBus.emit('runtime:turn-log', event);
      } catch (e) {
        // 로그 브리지는 실패해도 게임 진행에 영향을 주지 않는다.
        try {
          console.warn?.('[StartClient] failed to emit runtime:turn-log', e);
        } catch {
          // ignore console errors
        }
      }
    });
    lastLogCountRef.current = nextCount;
  }, [logs, runtimeBus]);

  const logSections = useMemo(() => {
    const panels =
      gameWorkspace && typeof gameWorkspace.ui_shell === 'object'
        ? gameWorkspace.ui_shell.panels || {}
        : {};
    const resolve = (key, defaultEnabled = true) => {
      const panel = panels[key];
      if (!panel || typeof panel !== 'object') return defaultEnabled;
      if (panel.enabled === false) return false;
      if (panel.enabled === true) return true;
      return defaultEnabled;
    };
    return {
      // 랭크 메인게임에서는 기본적으로 턴 로그를 비가시 상태로 두고,
      // 워크스페이스 ui.shell에서 명시적으로 켜도록 한다.
      turnLog: resolve('turnLog', false),
      aiHistory: resolve('aiHistory', true),
      playerHistory: resolve('playerHistory', true),
      realtimeEvents: resolve('realtimeEvents', true),
    };
  }, [gameWorkspace && gameWorkspace.ui_shell]);

  const autoStartRef = useRef(false);

  useEffect(() => {
    if (!textRuntimeEnabled) return;
    if (!ready) return;
    if (!gameId) return;
    if (autoStartRef.current) return;
    if (isStarting) return;
    if (sessionInfo && sessionInfo.id) return;

    autoStartRef.current = true;
    try {
      console.info('[StartClient] 자동 게임 시작 시도', {
        gameId,
        sessionId: sessionInfo?.id || null,
      });
      handleStart();
    } catch (error) {
      console.warn('[StartClient] 자동 게임 시작 실패:', error);
    }
  }, [textRuntimeEnabled, ready, gameId, isStarting, sessionInfo, handleStart]);

  useEffect(() => {
    if (!gameId) {
      setGameWorkspace(null);
      return;
    }
    let alive = true;
    (async () => {
      let workspace = null;

      // 1) 우선 rank_game_workspaces에서 저장된 워크스페이스를 시도
      try {
        const resp = await fetch(
          `/api/rank/game-workspace?gameId=${encodeURIComponent(gameId)}`
        );
        if (!alive) return;
        if (resp.ok) {
          const payload = await resp.json();
          if (payload && payload.ok && payload.workspace) {
            workspace = payload.workspace;
          }
        }
      } catch {
        // ignore; fallback will handle
      }
      if (!alive) return;

      // 2) 저장된 워크스페이스가 없으면 기본 텍스트 배틀 예시(text-battle-basic)를 사용
      if (!workspace) {
        try {
          const resp = await fetch('/api/rank/text-battle-default-workspace');
          if (!alive) return;
          if (resp.ok) {
            const payload = await resp.json();
            if (payload && payload.ok && payload.workspace) {
              workspace = payload.workspace;
            }
          }
        } catch {
          // ignore default workspace failures
        }
      }
      if (!alive) return;

      setGameWorkspace(workspace || null);
    })();
    return () => {
      alive = false;
    };
  }, [gameId]);

  useEffect(() => {
    const effectiveGraph =
      gameWorkspace && gameWorkspace.graph && typeof gameWorkspace.graph === 'object'
        ? gameWorkspace.graph
        : graph;

    if (
      !textRuntimeEnabled ||
      !effectiveGraph ||
      !Array.isArray(effectiveGraph.nodes) ||
      effectiveGraph.nodes.length === 0
    ) {
      // 텍스트 런타임 모드인데 그래프가 비어 있으면 런타임을 만들 수 없다.
      // 이 경우에는 조용히 멈추지 말고, 워크스페이스/그래프 구성을 확인할 수 있도록
      // 최소한의 경고만 남긴다.
      try {
        if (textRuntimeEnabled) {
          console.warn('[StartClient] textRuntimeEnabled=true 이지만 유효한 그래프를 찾지 못했습니다.', {
            hasWorkspaceGraph: Boolean(gameWorkspace && gameWorkspace.graph),
            hasEngineGraph: Boolean(graph && Array.isArray(graph.nodes) && graph.nodes.length > 0),
          });
        }
      } catch {
        // ignore console errors
      }
      runtimeRef.current = null;
      runtimeHooksRef.current = null;
      battleEndHandledRef.current = false;
      battleOutcomeRef.current = null;
      setBattleOutcome(null);
      return;
    }

    battleEndHandledRef.current = false;
    battleOutcomeRef.current = null;
    setBattleOutcome(null);

    let stopped = false;
    let runtime = null;

    const first = effectiveGraph.nodes[0] || {};
    const baseEntryNode = first.id || first.slotId || null;
    if (!baseEntryNode) return;
    const runtimeConfig =
      gameWorkspace && gameWorkspace.runtime_config && typeof gameWorkspace.runtime_config === 'object'
        ? gameWorkspace.runtime_config
        : {};
    const hooksSource =
      typeof gameWorkspace?.hooks_source === 'string' ? gameWorkspace.hooks_source : '';

    let hooks = null;
    if (hooksSource.trim()) {
      try {
        hooks = loadHooksFromSource(hooksSource);
      } catch (err) {
        console.warn('[StartClient] hooks 로드 실패:', err);
        hooks = null;
      }
    }

    const cfg = {
      ...(runtimeConfig || {}),
    };
    if (!cfg.entryNode) {
      cfg.entryNode = baseEntryNode;
    }

    try {
      runtime = createCoreRuntime({
        graph: effectiveGraph,
        config: cfg,
        hooks,
        files: {
          '/template.json': {
            content:
              gameWorkspace && gameWorkspace.template
                ? JSON.stringify(gameWorkspace.template, null, 2) + '\n'
                : '{}\n',
          },
           '/graph/prompt-graph.json': {
             content: JSON.stringify(effectiveGraph, null, 2) + '\n',
           },
          '/game/runtime.config.json': {
            content: JSON.stringify(cfg, null, 2) + '\n',
          },
          '/game/hooks/automation.js': {
            content: hooksSource,
          },
        },
        // rankContext는 표준 데이터 슬롯(speaker/scene 등)을 채우는
        // 기본 입력으로 사용된다.
        initialVariables: { rank: rankContext || {} },
      });
      runtimeRef.current = runtime;
      runtimeHooksRef.current = hooks;

      // rankContext 기반으로 standard data slots를 한 번 초기화해 둔다.
      try {
        if (runtime && typeof runtime.getContextSnapshot === 'function') {
          const ctx = runtime.getContextSnapshot('rank_init', null);
          applySpeakerFromRank(ctx, rankContext || null);
          applySceneFromRank(ctx, rankContext || null);
        }
      } catch (slotError) {
        console.warn('[StartClient] 표준 슬롯(rank → speaker/scene) 초기화 실패:', slotError);
      }
    } catch (e) {
      console.warn('[StartClient] coreRuntime 초기화 실패:', e);
      runtimeRef.current = null;
      runtimeHooksRef.current = null;
      return;
    }

    const runOnBattleEndOnce = (latestVars) => {
      if (battleEndHandledRef.current) return;
      battleEndHandledRef.current = true;

      const hooksForRuntime = runtimeHooksRef.current;
      const handler =
        hooksForRuntime && typeof hooksForRuntime.onBattleEnd === 'function'
          ? hooksForRuntime.onBattleEnd
          : null;
      if (!handler) {
        return;
      }

      let vars = latestVars && typeof latestVars === 'object' ? latestVars : null;
      if (!vars) {
        try {
          const rt = runtimeRef.current;
          if (rt && typeof rt.getContextSnapshot === 'function') {
            const snap = rt.getContextSnapshot('battle_end', null);
            if (snap && snap.variables && typeof snap.variables === 'object') {
              vars = snap.variables;
            }
          }
        } catch {
          // ignore context snapshot errors
        }
      }
      if (!vars || typeof vars !== 'object') {
        vars = {};
      }

      const participantsMap = {};
      try {
        const players = Array.isArray(rankContext?.players) ? rankContext.players : [];
        players.forEach((p) => {
          if (!p) return;
          const slotId = p.slotId || p.slot_id || p.ownerId || p.owner_id;
          if (!slotId) return;
          participantsMap[slotId] = {
            ownerId: p.ownerId || p.owner_id || null,
            name: p.displayName || p.display_name || p.heroName || p.hero_name || slotId,
            team: p.team || null,
            role: p.role || null,
            characterBio: p.hero?.bio || p.hero?.desc || null,
          };
        });
      } catch {
        // participant mapping failures should not break battle end handling
      }

      const ctxForHook = {
        turnLog: Array.isArray(turnLogRef.current) ? turnLogRef.current : [],
        participants: participantsMap,
        variables: vars,
        graphHash: null,
        hookHash: null,
      };

      Promise.resolve()
        .then(() => handler(ctxForHook))
        .then((raw) => {
          if (!raw) return;
          const normalized = normalizeBattleOutcome(raw);
          const merged = {
            ...normalized,
            finalizeSummary:
              raw && typeof raw === 'object' ? raw.finalizeSummary || null : null,
          };
          battleOutcomeRef.current = merged;
          setBattleOutcome(merged);

          // 한 판이 끝난 시점에서 랭크 정산 API를 호출해
          // battleLog 및 (선택적으로) 텍스트 배틀 랭크 정산을 수행한다.
          settleTextBattle({ outcome: merged, ctx: ctxForHook });
        })
        .catch((err) => {
          try {
            console.warn('[StartClient] onBattleEnd 훅 실행 실패:', err);
          } catch {
            // ignore console errors
          }
        });
    };

    const maybeHandleBattleEnd = (result) => {
      if (!result || battleEndHandledRef.current) return;
      try {
        const vars =
          result && result.variables && typeof result.variables === 'object'
            ? result.variables
            : null;
        const last =
          vars && vars.battleLast && typeof vars.battleLast === 'object'
            ? vars.battleLast
            : null;
        if (last && last.battleEnd) {
          runOnBattleEndOnce(vars || {});
        }
      } catch (err) {
        try {
          console.warn('[StartClient] battleEnd 감지 실패:', err);
        } catch {
          // ignore console errors
        }
      }
    };

    const publishResult = result => {
      if (stopped || !result) return;
      try {
        const node = result.current || null;
        const vars =
          result && result.variables && typeof result.variables === 'object'
            ? result.variables
            : null;
        const battleLast =
          vars && vars.battleLast && typeof vars.battleLast === 'object'
            ? vars.battleLast
            : null;

        const baseLabel =
          node && typeof node.label === 'string' && node.label.trim().length
            ? node.label.trim()
            : node && node.id
              ? String(node.id)
              : '';

        // 종료 시점: 별도 내레이션 중복 없이 종료 메시지만 표시
        if (!node) {
          runtimeBus.emit('system:message', '게임이 종료되었습니다.');
          return;
        }

        let userText = '';
        const runtimePrompt =
          result && typeof result.prompt === 'string' && result.prompt.length
            ? result.prompt
            : null;

        if (battleLast && typeof battleLast.narrative === 'string' && battleLast.narrative.trim()) {
          const narrative = battleLast.narrative.trim();
          if (baseLabel) {
            userText = `${baseLabel}\n\n${narrative}`;
          } else {
            userText = narrative;
          }
        } else if (runtimePrompt) {
          userText = runtimePrompt;
        } else {
          userText = baseLabel || '';
        }

        if (userText) {
          runtimeBus.emit('system:message', userText);
        }
      } catch (err) {
        console.warn('[StartClient] publishResult 실패:', err);
        return;
      }
      maybeHandleBattleEnd(result);
    };

    try {
      if (runtime && typeof runtime.getCurrentWithPrompt === 'function') {
        runtime
          .getCurrentWithPrompt()
          .then(res => {
            if (!stopped && res && res.current) publishResult(res);
          })
          .catch(() => {});
      } else if (runtime && typeof runtime.getCurrentNode === 'function') {
        const cur = runtime.getCurrentNode();
        if (cur) publishResult({ current: cur });
      }
    } catch (err) {
      console.warn('[StartClient] 초기 프롬프트 계산 실패:', err);
    }

    const offTurn = runtimeBus.on('turn:next', async () => {
      if (!runtimeRef.current) return;
      try {
        const res = await runtimeRef.current.step({ reason: 'auto' });
        publishResult(res);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg === 'hook timeout') {
          try {
            runtimeBus.emit('debug:error', {
              type: 'hook_timeout',
              message: msg,
              context: 'turn:next',
            });
          } catch {
            // ignore debug errors
          }
        } else {
          runtimeBus.emit('system:message', msg);
        }
      }
    });

    const offChat = runtimeBus.on('player:chat', async payload => {
      if (!runtimeRef.current) return;
      try {
        const text = payload && typeof payload.text === 'string' ? payload.text : '';
        const res = await runtimeRef.current.step({ reason: 'user_action', input: text });
        publishResult(res);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg === 'hook timeout') {
          try {
            runtimeBus.emit('debug:error', {
              type: 'hook_timeout',
              message: msg,
              context: 'player:chat',
            });
          } catch {
            // ignore debug errors
          }
        } else {
          runtimeBus.emit('system:message', msg);
        }
      }
    });

    return () => {
      stopped = true;
      try {
        offTurn && offTurn();
        offChat && offChat();
      } catch (err) {
        console.warn('[StartClient] runtimeBus unsubscribe 실패:', err);
      }
      runtimeRef.current = null;
      runtimeHooksRef.current = null;
    };
  }, [textRuntimeEnabled, graph, rankContext, runtimeBus, gameWorkspace, settleTextBattle]);

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

    if (engineError && isApiKeyError(engineError)) {
      messages.push(
        'API 키가 없거나 잘못 설정되어 있어 AI 응답을 생성할 수 없습니다. 설정 화면에서 API 키를 입력한 뒤 다시 시도해 주세요.'
      );
    } else {
      const errorText = toDisplayError(engineError);
      if (errorText) messages.push(errorText);
    }

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
        // 세션 메타/턴 상태 동기화는 텍스트 배틀 1P 메인 진행에 필수적이지 않다.
        // 여기서의 실패는 로그만 남기고, 진행/엔진 상태에는 영향을 주지 않는다.
        try {
          console.warn('[StartClient] 세션 메타 동기화 실패:', error);
        } catch {
          // ignore console errors
        }
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
  const readyOwnerIds = useMemo(() => {
    const eligible = Array.isArray(consensus?.eligibleOwnerIds)
      ? consensus.eligibleOwnerIds
      : [];
    const consented = Array.isArray(consensus?.consentedOwnerIds)
      ? consensus.consentedOwnerIds
      : [];
    const eligibleSet = new Set(
      eligible
        .map(id => (id == null ? '' : String(id).trim()))
        .filter(id => id)
    );
    const consentedSet = new Set(
      consented
        .map(id => (id == null ? '' : String(id).trim()))
        .filter(id => id)
    );
    const map = new Map();
    eligibleSet.forEach(id => {
      map.set(id, { eligible: true, consented: consentedSet.has(id) });
    });
    consentedSet.forEach(id => {
      if (!map.has(id)) {
        map.set(id, { eligible: false, consented: true });
      }
    });
    return map;
  }, [consensus?.eligibleOwnerIds, consensus?.consentedOwnerIds]);
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

    const rankPlayers = Array.isArray(rankContext?.players) ? rankContext.players : [];
    const rankMatch =
      rankPlayers.find(player => {
        if (!player) return false;
        const playerOwnerId =
          player.ownerId != null ? String(player.ownerId).trim() : '';
        const playerHeroId =
          player.heroId != null ? String(player.heroId).trim() : '';
        const ownerMatch =
          ownerCandidate && playerOwnerId
            ? playerOwnerId === String(ownerCandidate).trim()
            : false;
        const heroMatch =
          viewerHeroId && playerHeroId
            ? playerHeroId === String(viewerHeroId).trim()
            : false;
        return ownerMatch || heroMatch;
      }) || null;

    const rosterEntry = findRosterEntry(chatRoster, {
      heroId: viewerHeroId,
      ownerId: ownerCandidate,
    });

    const heroName =
      rankMatch?.heroName ||
      matchState?.viewer?.heroName ||
      matchState?.viewer?.hero?.name ||
      rosterEntry?.heroName ||
      '';

    const avatarUrl =
      rankMatch?.avatarUrl ||
      matchState?.viewer?.hero?.avatar_url ||
      matchState?.viewer?.avatarUrl ||
      matchState?.viewer?.avatar_url ||
      rosterEntry?.avatarUrl ||
      null;

    const backgrounds =
      Array.isArray(rankMatch?.backgrounds) && rankMatch.backgrounds.length
        ? rankMatch.backgrounds
        : null;

    const bgmUrl = rankMatch?.bgmUrl || null;
    const bgmDurationSeconds =
      rankMatch && typeof rankMatch.bgmDurationSeconds === 'number'
        ? rankMatch.bgmDurationSeconds
        : null;
    const audioProfile = rankMatch?.audioProfile || null;

    if (
      !viewerHeroId &&
      !ownerCandidate &&
      !heroName &&
      !avatarUrl &&
      !backgrounds &&
      !bgmUrl
    ) {
      return null;
    }

    return {
      hero_id: viewerHeroId,
      owner_id: ownerCandidate,
      user_id: ownerCandidate || null,
      name: heroName || (viewerHeroId ? `캐릭터 #${viewerHeroId}` : '익명 참가자'),
      avatar_url: avatarUrl || null,
      backgrounds: backgrounds || [],
      bgm_url: bgmUrl,
      bgm_duration_seconds: bgmDurationSeconds,
      audio_profile: audioProfile,
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
    rankContext?.players,
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

  const logsPanelVisible = useMemo(() => {
    const shell =
      gameWorkspace && typeof gameWorkspace.ui_shell === 'object'
        ? gameWorkspace.ui_shell
        : null;
    const panel =
      shell && shell.panels && typeof shell.panels === 'object'
        ? shell.panels.logs || shell.panels.turnHistory || null
        : null;
    if (panel && typeof panel.visible === 'boolean') {
      return panel.visible;
    }
    // 랭크 메인게임 기본값: 턴 & 히스토리 패널은 숨겨 두고,
    // ui_shell 설정으로 명시적으로 켜도록 한다.
    return false;
  }, [gameWorkspace && gameWorkspace.ui_shell]);

  if (!ready) {
    return (
      <div className={styles.page} style={pageStyle}>
        <div className={styles.shell}>
          <p className={styles.status}>매칭 정보를 불러오는 중…</p>
        </div>
      </div>
    );
  }

  // 매치 스냅샷이 없더라도 game 정보가 있으면 본게임을 띄우고,
  // gameId 자체가 없을 때만 "활성 매치 없음" 화면을 보여준다.
  if (!gameId && !matchState?.snapshot) {
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
          <div className={styles.headerControls}>
            <button type="button" className={styles.navButton} onClick={handleBackToRoom}>
              ← 로비로
            </button>
          </div>
        </header>

        {statusMessages.length ? (
          <div className={styles.statusGroup}>
            {statusMessages.map((message, index) => (
              <StatusBanner key={`${message}-${index}`} message={message} />
            ))}
          </div>
        ) : null}

        {showLegacyShellUi && (
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
                <div className={styles.viewerName}>
                  {viewerHeroProfile?.name || '익명 참가자'}
                </div>
                <div className={styles.viewerRole}>
                  {matchState?.viewer?.role || '역할 미지정'}
                </div>
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
                  <p className={styles.assignmentHint}>
                    슬롯 상태와 대역 충원 현황을 확인하세요.
                  </p>
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
                          const ownerId =
                            slot.ownerId != null
                              ? String(slot.ownerId).trim()
                              : slot.member?.ownerId != null
                                ? String(slot.member.ownerId).trim()
                                : '';
                          const readyInfo = ownerId ? readyOwnerIds.get(ownerId) : null;
                          const isReady =
                            readyInfo && readyInfo.consented === true ? true : Boolean(slot.ready);
                          const statusClass = isReady
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
                      className={
                        bucket.missing > 0 ? styles.roleBadgeMissing : styles.roleBadge
                      }
                    >
                      {bucket.role} {bucket.filled}/{bucket.total}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          </section>
        )}

        <div className={styles.bodyGrid}>
          <div className={styles.playColumn}>
            {textRuntimeEnabled ? (
              <CodeWorkspaceProvider
                storageNamespace={`rank:${gameId || ''}`}
                initialFiles={
                  gameWorkspace
                    ? [
                        gameWorkspace.template && {
                          path: '/template.json',
                          content: JSON.stringify(gameWorkspace.template, null, 2) + '\n',
                          readonly: true,
                        },
                        gameWorkspace.graph && {
                          path: '/graph/prompt-graph.json',
                          content: JSON.stringify(gameWorkspace.graph, null, 2) + '\n',
                          readonly: true,
                        },
                        gameWorkspace.runtime_config && {
                          path: '/game/runtime.config.json',
                          content: JSON.stringify(gameWorkspace.runtime_config, null, 2) + '\n',
                          readonly: true,
                        },
                        typeof gameWorkspace.hooks_source === 'string' && {
                          path: '/game/hooks/automation.js',
                          content: gameWorkspace.hooks_source,
                          readonly: true,
                        },
                      ].filter(Boolean)
                    : []
                }
              >
                <GameShell
                  template={
                    gameWorkspace && gameWorkspace.template ? gameWorkspace.template : null
                  }
                  runtimeBus={runtimeBus}
                  runtimeFeatures={[]}
                  shellConfig={
                    gameWorkspace && typeof gameWorkspace.ui_shell === 'object'
                      ? gameWorkspace.ui_shell
                      : null
                  }
                  mode="rank"
                  viewerHero={
                    viewerHeroProfile
                      ? {
                          name: viewerHeroProfile.name,
                          avatar_url: viewerHeroProfile.avatar_url,
                          role: matchState?.viewer?.role || null,
                          tagline: null,
                        }
                      : null
                  }
                  rankContext={rankContext}
                  battleOutcome={battleOutcome}
                  consensus={consensus}
                />
              </CodeWorkspaceProvider>
            ) : (
              <div className={styles.engineRow}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeader}>
                    <h2 className={styles.summaryTitle}>게임 준비 중</h2>
                  </div>
                  <p className={styles.metaPlaceholder}>
                    워크스페이스 기반 텍스트 런타임이 활성화된 게임에서만 메인 게임 화면이 표시됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>

          {logsPanelVisible && (
            <aside className={styles.sideColumn}>
              <div className={`${styles.summaryCard} ${styles.sideCard}`}>
                <LogsPanel
                  logs={logs}
                  aiMemory={aiMemory}
                  playerHistories={playerHistories}
                  realtimeEvents={realtimeEvents}
                  sections={logSections}
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
