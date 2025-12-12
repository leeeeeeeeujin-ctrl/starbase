"use client";

// 모듈 로드 확인
console.log('[useBuiltinRuntime] 모듈 로드됨 - ', new Date().toISOString());

import { useEffect, useMemo, useCallback, useRef } from 'react';
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
  onDebugStateChange,
  debugPromptEnabled,
  debugLogCallsEnabled,
  gridEngineRef,
  runtimeRef,
  hooksRef,
}) {
  // Stable reference for debugSimUsers to avoid re-running effect
  const debugSimUsersRef = useRef(debugState?.simUsers);
  debugSimUsersRef.current = debugState?.simUsers;
  
  const debugSimUsersStable = useMemo(() => {
    const users = debugSimUsersRef.current;
    return Array.isArray(users) && users.length > 0 ? users : [];
  }, [debugState?.simUsers?.length]);

  // Stable callback ref for debug state updates
  const onDebugStateChangeRef = useRef(onDebugStateChange);
  onDebugStateChangeRef.current = onDebugStateChange;

  useEffect(() => {
    console.log('[useBuiltinRuntime] useEffect 실행됨, engine:', engine);
    if (engine !== 'builtin') {
      console.log('[useBuiltinRuntime] builtin 엔진이 아님, 종료');
      return;
    }

    console.log('[useBuiltinRuntime] builtin 초기화 시작');
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
      const hasSimUsers = debugSimUsersStable.length > 0;
      const debugPlayers = hasSimUsers
        ? debugSimUsersStable.map((u, index) => {
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

      if (hasSimUsers && debugPlayers.length) {
        try {
          console.log('[useBuiltinRuntime] 디버그 참가자 주입', {
            count: debugPlayers.length,
            players: debugPlayers.map((p) => ({
              ownerId: p.ownerId,
              heroName: p.heroName,
              role: p.role,
              hasApiKey: !!p.apiKey,
            })),
          });
        } catch {}
      }

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

        // 게임 종료 시점(single-node 포함) 처리
        if (!node) {
          // 종료 시 중복 narrative 제거: 마지막 턴에서 이미 표시했으므로 여기서는 종료 메시지만
          bus.emit('system:message', '게임이 종료되었습니다.');
          return;
        }

        // 사용자에게 보여 줄 텍스트 구성
        let userText = '';
        const runtimePrompt =
          result && typeof result.prompt === 'string' && result.prompt.length
            ? result.prompt
            : null;

        if (battleLast && typeof battleLast.narrative === 'string' && battleLast.narrative.trim()) {
          // 텍스트 배틀 등: 프롬프트 + AI 응답을 한 턴 내용으로 묶어서 보여 준다.
          const narrative = battleLast.narrative.trim();
          
          console.log('[publishResult] battleLast.narrative 있음:', { narrative: narrative.substring(0, 50), baseLabel });
          
          // AI fallback 감지 및 카운터 증가
          if (battleLast.fallback === true && onDebugStateChangeRef.current) {
            onDebugStateChangeRef.current((prev) => ({
              ...prev,
              fallbackCount: (prev.fallbackCount || 0) + 1,
            }));
          }
          
          if (baseLabel) {
            userText = `${baseLabel}\n\n${narrative}`;
          } else {
            userText = narrative;
          }
        } else if (meta?.reason === 'inspect') {
          // 초기 상태: inspect는 디버그용이므로 사용자 메시지 발행 안 함
          console.log('[publishResult] inspect 모드 - 메시지 발행 안 함');
          userText = '';
        } else if (runtimePrompt) {
          // 일반 텍스트 런타임: transformPrompt 결과를 그대로 보여 준다.
          console.log('[publishResult] runtimePrompt 사용:', runtimePrompt.substring(0, 50));
          userText = runtimePrompt;
        } else {
          console.log('[publishResult] baseLabel만 사용:', baseLabel);
          userText = baseLabel || '';
        }

        if (userText) {
          // fallback 여부를 메타데이터로 함께 전달
          const isFallback = battleLast?.fallback === true;
          const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
          console.log('[publishResult] system:message 발행:', { userText, isFallback, reason: meta?.reason });
          bus.emit('system:message', userText, { 
            fallback: isFallback,
            isDev,
            errorMessage: isFallback && isDev ? battleLast?.errorMessage : undefined
          });
        } else {
          console.log('[publishResult] userText 없음, 메시지 발행 안 함:', { reason: meta?.reason, battleLast, baseLabel, runtimePrompt });
        }

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
            // TurnLogBar 에서도 사용자에게 보이는 것과 동일한 문자열을 사용한다.
            prompt: userText || baseLabel || runtimePrompt || '',
            ui: result.ui || null,
            variables: vars,
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
        if (debugPromptEnabled && onDebugStateChangeRef.current) {
          try {
            onDebugStateChangeRef.current((prev) => ({
              ...prev,
              lastPrompt: runtimePrompt || baseLabel || '',
            }));
          } catch {
            // ignore debug state errors
          }
        }

        if (debugLogCallsEnabled) {
          try {
            const dbg =
              vars && vars.debug && typeof vars.debug === 'object' ? vars.debug : null;
            const calls = Array.isArray(dbg?.aiCalls) ? dbg.aiCalls : [];
            if (calls.length && onDebugStateChangeRef.current) {
              onDebugStateChangeRef.current((prev) => ({ ...prev, calls }));
            }
          } catch {
            // ignore debug state errors
          }
        }
      } catch {
        // ignore bus errors
      }
    };

    // 초기 상태 발행 + 첫 번째 노드 AI 호출 (이동하지 않음)
    console.log('[useBuiltinRuntime] 초기화 완료, 첫 노드 확인 시작');
    try {
      if (runtime && typeof runtime.getCurrentWithPrompt === 'function') {
        console.log('[useBuiltinRuntime] getCurrentWithPrompt 호출');
        runtime
          .getCurrentWithPrompt()
          .then(async (res) => {
            console.log('[useBuiltinRuntime] getCurrentWithPrompt 응답:', res);
            if (!stopped && res && res.current) {
              const nodeType = res.current && res.current.type;
              console.log('[useBuiltinRuntime] 첫 노드 타입:', nodeType, 'hooks:', !!hooks, 'onTurnStart:', typeof hooks?.onTurnStart);
              
              // 첫 노드가 ai/prompt 타입이면 현재 노드에서 바로 onTurnStart 호출
              if ((nodeType === 'ai' || nodeType === 'prompt') && hooks && typeof hooks.onTurnStart === 'function') {
                try {
                  console.log('[useBuiltinRuntime] 첫 노드 AI 호출 시작:', nodeType);
                  const ctx = runtime.getContextSnapshot('user_action', 'auto');
                  await hooks.onTurnStart(ctx);
                  // onTurnStart 후 다시 프롬프트와 결과를 가져옴
                  const updated = await runtime.getCurrentWithPrompt();
                  console.log('[useBuiltinRuntime] 첫 노드 AI 호출 완료, battleLast:', updated?.variables?.battleLast);
                  publishResult(updated, { reason: 'user_action', input: 'auto' });
                } catch (e) {
                  console.warn('[useBuiltinRuntime] initial onTurnStart error:', e);
                  publishResult(res, { reason: 'inspect', input: undefined });
                }
              } else {
                console.log('[useBuiltinRuntime] 첫 노드가 ai/prompt 타입이 아님:', nodeType);
                publishResult(res, { reason: 'inspect', input: undefined });
              }
            }
          })
          .catch(() => {});
      } else if (runtime && typeof runtime.getCurrentNode === 'function') {
        const cur = runtime.getCurrentNode();
        if (cur) {
          const nodeType = cur.type;

          // 첫 노드가 ai/prompt 타입이면 현재 노드에서 바로 onTurnStart 호출
          if ((nodeType === 'ai' || nodeType === 'prompt') && hooks && typeof hooks.onTurnStart === 'function') {
            try {
              const ctx = runtime.getContextSnapshot('user_action', 'auto');
              Promise.resolve(hooks.onTurnStart(ctx))
                .then(() => {
                  try {
                    const updated = runtime.getCurrentNode();
                    publishResult({ current: updated }, { reason: 'user_action', input: 'auto' });
                  } catch (err) {
                    console.warn('[useBuiltinRuntime] initial onTurnStart post-call error:', err);
                    publishResult({ current: cur }, { reason: 'inspect', input: undefined });
                  }
                })
                .catch((e) => {
                  console.warn('[useBuiltinRuntime] initial onTurnStart error:', e);
                  publishResult({ current: cur }, { reason: 'inspect', input: undefined });
                });
            } catch (e) {
              console.warn('[useBuiltinRuntime] initial onTurnStart error:', e);
              publishResult({ current: cur }, { reason: 'inspect', input: undefined });
            }
          } else {
            publishResult({ current: cur }, { reason: 'inspect', input: undefined });
          }
        }
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
        // hook timeout은 디버그 전용으로만 노출
        const msg = String(e?.message || e);
        if (msg === 'hook timeout') {
          try { bus.emit('debug:error', { type: 'hook_timeout', message: msg, context: 'turn:next' }); } catch {}
        } else {
          try { bus.emit('system:message', msg); } catch {}
        }
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
        // hook timeout은 디버그 전용으로만 노출
        const msg = String(e?.message || e);
        if (msg === 'hook timeout') {
          try { bus.emit('debug:error', { type: 'hook_timeout', message: msg, context: 'player:chat' }); } catch {}
        } else {
          try { bus.emit('system:message', msg); } catch {}
        }
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
    files?.['/graph/prompt-graph.json']?.content,
    files?.['/game/hooks/automation.js']?.content,
    cfg?.entryNode,
    cfg?.starter,
    bus,
    debugSimUsersStable.length,
    debugPromptEnabled,
    debugLogCallsEnabled,
    gridEngineRef,
    runtimeRef,
    hooksRef,
  ]);
}
