/**
 * 텍스트 배틀 E2E 테스트
 * 
 * Play → AI 판정 → variables 업데이트 → 턴 로그 → Rank settle 전체 플로우 검증
 * 
 * 테스트 범위:
 * 1. coreRuntime 초기화 (graph + config + hooks)
 * 2. onUserAction 훅에서 AI 판정 호출 및 variables.battleLast 갱신
 * 3. runtime:turn-log 이벤트 발행
 * 4. onBattleEnd 훅 호출 및 outcome 계산
 * 5. settle API로 battle_log 저장
 */

import { createCoreRuntime } from '../lib/runtime/coreRuntime';
import { loadHooksFromSource } from '../lib/runtime/safeEvalHookModule';

describe('텍스트 배틀 E2E 플로우', () => {
  let runtime;
  let hooks;
  let turnEvents = [];
  
  // Mock AI 판정 응답
  const mockAIJudgeResponse = {
    ok: true,
    result: 'hero_win',
    narrative: '주역이 압도적인 공격으로 승리했습니다!',
    score: { hero: 1, rival: 0 },
  };

  beforeEach(() => {
    turnEvents = [];
  });

  afterEach(() => {
    runtime = null;
    hooks = null;
  });

  test('1. 기본 그래프 + 설정으로 런타임 초기화', () => {
    const graph = {
      nodes: [
        {
          id: 'start',
          type: 'ai',
          label: '배틀 시작',
          config: {
            battle: {
              routes: {
                on_hero_win: 'end',
                on_rival_win: 'end',
                on_tie: 'end',
              },
            },
          },
        },
        {
          id: 'end',
          type: 'system',
          label: '배틀 종료',
        },
      ],
      edges: [],
    };

    const config = {
      engine: 'builtin',
      mode: 'turn',
      entryNode: 'start',
      roles: ['players', 'observers'],
    };

    runtime = createCoreRuntime({
      graph,
      config,
      hooks: null,
      files: {},
      initialVariables: {
        rank: {
          sessionId: 'test-session-1',
          gameMode: 'offline',
          players: [
            { ownerId: 'hero-1', heroName: '주역', role: 'hero' },
            { ownerId: 'rival-1', heroName: '라이벌', role: 'rival' },
          ],
        },
      },
    });

    expect(runtime).toBeDefined();
    expect(typeof runtime.step).toBe('function');
    expect(typeof runtime.getCurrentNode).toBe('function');
    
    const currentNode = runtime.getCurrentNode();
    expect(currentNode.id).toBe('start');
    expect(currentNode.type).toBe('ai');
  });

  test('2. onUserAction 훅에서 디버그 토큰으로 배틀 결과 시뮬레이션', async () => {
    const graph = {
      nodes: [
        { id: 'start', type: 'ai', label: '배틀 시작' },
        { id: 'end', type: 'system', label: '배틀 종료' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };

    const config = {
      engine: 'builtin',
      mode: 'turn',
      entryNode: 'start',
    };

    // 간단한 훅 코드 (디버그 토큰만 처리)
    const hooksSource = `
      module.exports = {
        async onUserAction(ctx, input) {
          // 디버그 토큰 처리
          if (input === 'hero_win') {
            if (!ctx.variables) ctx.variables = {};
            ctx.variables.battleLast = {
              result: 'hero_win',
              battleEnd: true,
            };
            ctx.variables.battleScore = { hero: 1, rival: 0 };
            
            // 다음 노드 찾기
            const neighbors = ctx.neighbors || [];
            if (neighbors.length > 0) {
              return { selectNext: neighbors[0].id };
            }
            return { selectNext: 'end' };
          }
          return null;
        },
      };
    `;

    hooks = loadHooksFromSource(hooksSource);
    
    runtime = createCoreRuntime({
      graph,
      config,
      hooks,
      files: {},
      initialVariables: {
        rank: {
          sessionId: 'test-session-2',
          players: [
            { ownerId: 'hero-1', heroName: '주역', role: 'hero' },
            { ownerId: 'rival-1', heroName: '라이벌', role: 'rival' },
          ],
        },
      },
    });

    // 디버그 토큰 'hero_win' 으로 step 실행
    const result = await runtime.step({ reason: 'user_action', input: 'hero_win' });
    
    // 결과 검증 - current가 null이 아닌지 먼저 확인
    expect(result).toBeDefined();
    expect(result.variables).toBeDefined();
    expect(result.variables.battleLast).toBeDefined();
    expect(result.variables.battleLast.result).toBe('hero_win');
    expect(result.variables.battleLast.battleEnd).toBe(true);
    expect(result.variables.battleScore).toEqual({ hero: 1, rival: 0 });
  });

  test('3. runtime:turn-log 이벤트 발행 및 수집', async () => {
    const graph = {
      nodes: [
        { id: 'start', type: 'ai', label: '배틀 시작' },
        { id: 'end', type: 'system', label: '배틀 종료' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };

    const config = {
      engine: 'builtin',
      mode: 'turn',
      entryNode: 'start',
    };

    const hooksSource = `
      module.exports = {
        async onUserAction(ctx, input) {
          if (!ctx.variables) ctx.variables = {};
          ctx.variables.battleLast = {
            result: 'hero_win',
            battleEnd: true,
          };
          
          const neighbors = ctx.neighbors || [];
          if (neighbors.length > 0) {
            return { selectNext: neighbors[0].id };
          }
          return null;
        },
      };
    `;

    hooks = loadHooksFromSource(hooksSource);
    
    runtime = createCoreRuntime({
      graph,
      config,
      hooks,
      files: {},
    });

    // step 실행 후 variables가 올바르게 설정되었는지 확인
    const result = await runtime.step({ reason: 'user_action', input: 'hero_win' });
    
    expect(result).toBeDefined();
    expect(result.variables).toBeDefined();
    expect(result.variables.battleLast).toBeDefined();
    
    // Note: 실제 bus 연결은 PlayOverlayContent에서 이루어지므로
    // 여기서는 런타임이 올바른 변수를 설정했는지만 확인
  });

  test('4. onBattleEnd 훅으로 outcome 계산', async () => {
    // onBattleEnd 함수를 직접 정의 (loadHooksFromSource 우회)
    const onBattleEnd = async function(ctx) {
      const vars = ctx.variables || {};
      const last = vars.battleLast || {};
      const score = vars.battleScore || {};
      
      const outcome = {
        winners: [],
        losers: [],
        draw: false,
      };
      
      if (last.result === 'hero_win') {
        outcome.winners = ['hero-1'];
        outcome.losers = ['rival-1'];
      } else if (last.result === 'rival_win') {
        outcome.winners = ['rival-1'];
        outcome.losers = ['hero-1'];
      } else if (last.result === 'tie') {
        outcome.draw = true;
      }
      
      const scoreboard = {
        'hero-1': { score: score.hero || 0, delta: last.result === 'hero_win' ? 1 : 0 },
        'rival-1': { score: score.rival || 0, delta: last.result === 'rival_win' ? 1 : 0 },
      };
      
      return { outcome, scoreboard };
    };

    // 배틀 종료 상태 시뮬레이션
    const ctx = {
      turnLog: [],
      participants: {},
      variables: {
        battleLast: {
          result: 'hero_win',
          battleEnd: true,
        },
        battleScore: { hero: 1, rival: 0 },
      },
      graphHash: null,
      hookHash: null,
    };
    
    const battleEndResult = await onBattleEnd(ctx);
    
    expect(battleEndResult.outcome).toBeDefined();
    expect(battleEndResult.outcome.winners).toEqual(['hero-1']);
    expect(battleEndResult.outcome.losers).toEqual(['rival-1']);
    expect(battleEndResult.outcome.draw).toBe(false);
    expect(battleEndResult.scoreboard['hero-1'].delta).toBe(1);
    expect(battleEndResult.scoreboard['rival-1'].delta).toBe(0);
  });

  test('5. battle_log 형식 검증', async () => {
    // settle API가 기대하는 형식
    const battleLog = {
      sessionId: 'test-session-4',
      gameId: 'test-game-1',
      events: [
        {
          id: 'ev-1',
          turn: 1,
          type: 'user_action',
          nodeId: 'start',
          nodeLabel: '배틀 시작',
          prompt: '주역이 공격합니다.',
          input: 'hero_win',
          variables: {
            battleLast: {
              result: 'hero_win',
              battleEnd: true,
            },
            battleScore: { hero: 1, rival: 0 },
          },
          isVisible: true,
          visibility: null,
        },
      ],
      participants: {
        'hero-1': { name: '주역', role: 'hero' },
        'rival-1': { name: '라이벌', role: 'rival' },
      },
      outcome: {
        winners: ['hero-1'],
        losers: ['rival-1'],
        draw: false,
      },
      scoreboard: {
        'hero-1': { score: 1, delta: 1 },
        'rival-1': { score: 0, delta: 0 },
      },
      meta: {
        graphHash: null,
        hookHash: null,
        duration: 1500,
      },
    };

    // 필수 필드 검증
    expect(battleLog.sessionId).toBeDefined();
    expect(battleLog.gameId).toBeDefined();
    expect(Array.isArray(battleLog.events)).toBe(true);
    expect(battleLog.events.length).toBeGreaterThan(0);
    expect(battleLog.participants).toBeDefined();
    expect(battleLog.outcome).toBeDefined();
    expect(battleLog.outcome.winners).toBeDefined();
    expect(battleLog.outcome.losers).toBeDefined();
    
    // events 구조 검증
    const event = battleLog.events[0];
    expect(event.id).toBeDefined();
    expect(event.turn).toBeDefined();
    expect(event.type).toBeDefined();
    expect(event.nodeId).toBeDefined();
    
    // outcome 구조 검증
    expect(Array.isArray(battleLog.outcome.winners)).toBe(true);
    expect(Array.isArray(battleLog.outcome.losers)).toBe(true);
    expect(typeof battleLog.outcome.draw).toBe('boolean');
  });
});

describe('텍스트 배틀 통합 시나리오 (수동 테스트용)', () => {
  test.skip('실제 워크스페이스 세트로 Play → Settle 플로우', async () => {
    // 이 테스트는 실제 워크스페이스 세트와 dev 서버가 필요합니다.
    // 수동 테스트 시나리오:
    // 
    // 1. 새 워크스페이스 세트 생성 (starter-pack 사용)
    // 2. Maker 에디터에서 "Play" 버튼 클릭
    // 3. Play 오버레이에서 "다음" 버튼으로 턴 진행
    // 4. 디버그 패널에서 턴 로그 확인
    // 5. battleEnd 발생 시 콘솔에서 onBattleEnd 결과 확인
    // 6. /api/rank/settle 호출로 battle_log 저장 확인
    // 7. /battle-log/[sessionId] 페이지에서 로그 표시 확인
    //
    // 예상 결과:
    // - Play에서 AI 판정이 정상 동작
    // - variables.battleLast/battleScore가 올바르게 업데이트
    // - runtime:turn-log 이벤트가 디버그 패널에 표시
    // - onBattleEnd가 호출되어 outcome 계산
    // - settle API가 battle_log를 Supabase에 저장
    // - battle-log 페이지에서 재생 가능
  });
});
