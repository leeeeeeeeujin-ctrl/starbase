"use client";

import { useEffect } from 'react';
import { createCoreRuntime } from '../../../lib/runtime/coreRuntime.js';
import { loadHooksFromSource } from '../../../lib/runtime/safeEvalHookModule.js';
import {
  applySceneFromRank,
  applySpeakerFromRank,
} from '../../../lib/runtime/rankStandardSlots.js';

/**
 * Builtin core runtime 초기화 및 이벤트 처리
 * 
 * @param {Object} params
 * @param {string} params.engine - 런타임 엔진 타입
 * @param {Object} params.files - 워크스페이스 파일들
 * @param {Object} params.cfg - runtime.config.json 파싱 결과
 * @param {Object} params.bus - 이벤트 버스
 * @param {Object} params.debugState - 디버그 상태
 * @param {Function} params.setDebugState - 디버그 상태 업데이트 함수
 * @param {boolean} params.debugPromptEnabled - 프롬프트 디버그 활성화 여부
 * @param {boolean} params.debugLogCallsEnabled - AI 호출 로그 활성화 여부
 * @param {Object} params.gridEngineRef - Grid 엔진 ref
 * @param {Object} params.runtimeRef - Runtime ref (외부에서 전달)
 * @param {Object} params.hooksRef - Hooks ref (외부에서 전달)
 */
export function useBuiltinRuntime({
  engine,
  files,
  cfg,
  bus,
  debugState,
  setDebugState,
  debugPromptEnabled,
  debugLogCallsEnabled,
  gridEngineRef,
  runtimeRef,
  hooksRef,
}) {
  useEffect(() => {
    if (engine !== 'builtin') return;

    let stopped = false;
    let runtime = null;

    try {
      // 1. Graph 로드
      const graphText = files?.['/graph/prompt-graph.json']?.content || '';
      if (!graphText) return;

      let graph = null;
      try {
        graph = JSON.parse(graphText || '{}');
      } catch {
        return;
      }

      // 2. Hooks 로드
      let hooks = null;
      try {
        const hookSrc = files?.['/game/hooks/automation.js']?.content || '';
        if (hookSrc) hooks = loadHooksFromSource(hookSrc);
      } catch {
        // ignore hook load errors; runtime will fall back to graph edges only
      }

      // 3. 디버그 참가자 설정
      const hasSimUsers = Array.isArray(debugState?.simUsers) && debugState.simUsers.length > 0;
      const debugPlayers = hasSimUsers
        ? debugState.simUsers.map((u, index) => {
            const name = (u && u.name && String(u.name).trim()) || `참가자 #${index + 1}`;
            const ownerId =
              (u && u.ownerId && String(u.ownerId).trim()) || `sim-${index + 1}`;
            return {
              ownerId,
              heroId: null,
              heroName: name,
              role: (u && u.role && String(u.role).trim()) || null,
              apiKey: u && u.apiKey ? String(u.apiKey) : null,
            };
          })
        : [];

      const rankDefaults = {
        sessionId: null,
        gameMode: 'offline',
        realtimeEnabled: false,
        dropInEnabled: false,
        players: debugPlayers,
      };

      const debugVars = hasSimUsers ? { participants: debugPlayers } : undefined;

      // 4. Core runtime 생성
      runtime = createCoreRuntime({
        graph,
        config: cfg,
        hooks,
        files,
        initialVariables: debugVars
          ? { rank: rankDefaults, debug: debugVars }
          : { rank: rankDefaults },
      });

      runtimeRef.current = runtime;
      hooksRef.current = hooks;

      // 5. 표준 슬롯(speaker/scene) 초기화
      try {
        if (runtime && typeof runtime.getContextSnapshot === 'function') {
          const ctx = runtime.getContextSnapshot('play_init', null);
          applySpeakerFromRank(ctx, rankDefaults);
          applySceneFromRank(ctx, rankDefaults);
        }
      } catch {
        // 슬롯 초기화 실패는 플레이 자체를 막지 않는다.
      }

      // 6. Grid 엔진 연결
      try {
        const gridEngine = gridEngineRef.current;
        if (gridEngine && typeof runtime.setWorldEngine === 'function') {
          runtime.setWorldEngine(gridEngine);
        }
        if (gridEngine && hooks && typeof gridEngine.setHooks === 'function') {
          gridEngine.setHooks(hooks);
        }
      } catch {
        // ignore linkage errors
      }
    } catch {
      return;
    }

    // 결과 발행 헬퍼
    const publishResult = (result, meta) => {
      if (stopped) return;
      try {
        const node = result && result.current ? result.current : null;
        if (!node) {
          bus.emit('system:message', '게임이 종료되었습니다.');
          return;
        }

        const fromPrompt = result && typeof result.prompt === 'string' && result.prompt.length
          ? result.prompt
          : null;
        const txt = fromPrompt != null ? fromPrompt : String(node.label || node.id || '');
        bus.emit('system:message', txt);

        // runtime:turn-log 이벤트 발행
        try {
          let visibility = null;
          let isVisible = true;
          try {
            const data = node && node.data ? node.data : null;
            if (data) {
              if (data.invisible) {
                visibility = 'invisible';
                isVisible = false;
              } else if (typeof data.visibility === 'string') {
                visibility = data.visibility;
              }
            }
          } catch {
            // visibility 계산 실패는 로그 출력 자체를 막지 않는다.
          }

          const event = {
            turn: typeof result.turn === 'number' ? result.turn : null,
            nodeId: node.id || null,
            nodeLabel: node.label || null,
            reason: meta?.reason || null,
            input: meta?.input ?? null,
            prompt: txt,
            ui: result.ui || null,
            variables: result.variables || null,
            visibility,
            isVisible,
          };
          bus.emit('runtime:turn-log', event);
        } catch {
          // ignore log emit errors
        }

        // onBattleEnd 호출
        try {
          const hooks = hooksRef.current || null;
          const handler =
            hooks && typeof hooks.onBattleEnd === 'function'
              ? hooks.onBattleEnd
              : null;
          const vars =
            result && result.variables && typeof result.variables === 'object'
              ? result.variables
              : null;
          const last =
            vars && vars.battleLast && typeof vars.battleLast === 'object'
              ? vars.battleLast
              : null;
          if (handler && last && last.battleEnd) {
            const turnEvents = Array.isArray(debugState.turnEvents)
              ? debugState.turnEvents
              : [];
            const ctxForHook = {
              turnLog: turnEvents,
              participants: {},
              variables: vars,
              graphHash: null,
              hookHash: null,
            };
            Promise.resolve()
              .then(() => handler(ctxForHook))
              .then(() => {
                // 워크스페이스 Play 에서는 onBattleEnd 결과를 화면에 직접 그리기보다는,
                // 사용자가 /examples/text-battle-basic 을 참고해 훅을 조정할 수 있도록
                // turn 로그/하이라이트만 제공한다.
              })
              .catch(() => {
                // onBattleEnd 디버그 호출 실패는 플레이를 막지 않는다.
              });
          }
        } catch {
          // ignore onBattleEnd debug errors
        }

        // 디버그 상태 업데이트
        if (debugPromptEnabled) {
          try {
            setDebugState((prev) => ({ ...prev, lastPrompt: txt }));
          } catch {
            // ignore debug state errors
          }
        }

        if (debugLogCallsEnabled) {
          try {
            const vars =
              result && result.variables && typeof result.variables === 'object'
                ? result.variables
                : null;
            const dbg =
              vars && vars.debug && typeof vars.debug === 'object' ? vars.debug : null;
            const calls = Array.isArray(dbg?.aiCalls) ? dbg.aiCalls : [];
            if (calls.length) {
              setDebugState((prev) => ({ ...prev, calls }));
            }
          } catch {
            // ignore debug state errors
          }
        }
      } catch {
        // ignore bus errors
      }
    };

    // 초기 상태 발행
    try {
      if (runtime && typeof runtime.getCurrentWithPrompt === 'function') {
        runtime
          .getCurrentWithPrompt()
          .then((res) => {
            if (!stopped && res && res.current) {
              publishResult(res, { reason: 'inspect', input: undefined });
            }
          })
          .catch(() => {});
      } else if (runtime && typeof runtime.getCurrentNode === 'function') {
        const cur = runtime.getCurrentNode();
        if (cur) publishResult({ current: cur }, { reason: 'inspect', input: undefined });
      }
    } catch {}

    // turn:next 이벤트 핸들러
    const offTurn = bus.on('turn:next', async () => {
      try {
        const currentNode =
          runtime && typeof runtime.getCurrentNode === 'function'
            ? runtime.getCurrentNode()
            : null;
        const nodeType = currentNode && currentNode.type;
        const useAutoUserAction = nodeType === 'ai' || nodeType === 'prompt';

        let res;
        let reason;
        let input;

        if (useAutoUserAction) {
          reason = 'user_action';
          input = 'auto';
          res = await runtime.step({ reason, input });
        } else {
          reason = 'auto';
          input = undefined;
          res = await runtime.step({ reason });
        }

        publishResult(res, { reason, input });

        // Grid 엔진 step
        const gridEngine = gridEngineRef.current;
        if (gridEngine) {
          const ctx =
            typeof runtime.getContextSnapshot === 'function'
              ? runtime.getContextSnapshot(reason, input)
              : null;

          if (useAutoUserAction && typeof gridEngine.applyAction === 'function') {
            const action = { type: 'chat', text: String(input || '') };
            Promise.resolve(gridEngine.applyAction(action, ctx)).catch(() => {});
          } else if (typeof gridEngine.step === 'function') {
            Promise.resolve(gridEngine.step(1, ctx)).catch(() => {});
          }
        }
      } catch (e) {
        try { bus.emit('system:message', String(e?.message || e)); } catch {}
      }
    });

    // player:chat 이벤트 핸들러
    const offChat = bus.on('player:chat', async (payload) => {
      try {
        const text = payload && typeof payload.text === 'string' ? payload.text : '';
        const res = await runtime.step({ reason: 'user_action', input: text });
        publishResult(res, { reason: 'user_action', input: text });

        const gridEngine = gridEngineRef.current;
        if (gridEngine && typeof gridEngine.applyAction === 'function') {
          const ctx = typeof runtime.getContextSnapshot === 'function'
            ? runtime.getContextSnapshot('user_action', text)
            : null;
          const action = { type: 'chat', text };
          Promise.resolve(gridEngine.applyAction(action, ctx)).catch(() => {});
        }
      } catch (e) {
        try { bus.emit('system:message', String(e?.message || e)); } catch {}
      }
    });

    // Cleanup
    return () => {
      stopped = true;
      try {
        offTurn && offTurn();
        offChat && offChat();
      } catch {
        // ignore cleanup errors
      }
      runtimeRef.current = null;
      hooksRef.current = null;
    };
  }, [
    engine,
    JSON.stringify(files),
    JSON.stringify(cfg),
    bus,
    debugState,
    setDebugState,
    debugPromptEnabled,
    debugLogCallsEnabled,
    gridEngineRef,
    runtimeRef,
    hooksRef,
  ]);
}
