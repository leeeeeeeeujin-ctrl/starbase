// GET /api/workspace/starter-pack
// Returns a workspace-aligned starter pack with base files and docs (paths are rooted with '/').

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const files = [];

  // Base workspace structure
  files.push({ path: '/README.md', content: `# Workspace

좌측 파일트리에서 파일을 선택해 수정하세요. 이 작업공간은 서버 세트와 동기화되며, 아래 핵심 파일로 실행됩니다.

- /graph/prompt-graph.json — 노드/엣지 흐름
- /game/hooks/automation.js — 훅(transformPrompt, onUserAction, selectNext)
- /game/runtime.config.json — 엔트리/턴/역할 설정
- /docs/** — 제작 가이드(읽기 전용)
` });

  // 기본 텍스트 배틀용 그래프: start(AI 프롬프트) → end(시스템)
  files.push({
    path: '/graph/prompt-graph.json',
    content:
      JSON.stringify(
        {
          nodes: [
            {
              id: 'start',
              type: 'ai',
              label:
                '첫 턴 프롬프트를 여기에 적으면, 플레이에서 AI 심판이 이 내용을 바탕으로 텍스트 배틀을 진행합니다.',
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
              label:
                '배틀이 종료되었습니다. 프롬프트-노드 에디터에서 노드를 추가하거나 라우트를 바꾸면 흐름을 확장할 수 있습니다.',
            },
          ],
          edges: [
            {
              id: 'edge-start-end',
              source: 'start',
              target: 'end',
              label: '끝',
            },
          ],
        },
        null,
        2,
      ) + '\n',
  });

  // 텍스트 배틀용 런타임 설정: builtin 엔진 + turn 모드 + entryNode=start
  files.push({
    path: '/game/runtime.config.json',
    content:
      JSON.stringify(
        {
          version: 1,
          roles: ['players', 'observers'],
          engine: 'builtin',
          mode: 'turn',
          entryNode: 'start',
          ai: { model: 'gemini-2.5-flash' },
          turnTimer: {
            timeoutSec: 60,
            roleThreshold: 0.5,
            requiredRoles: ['players'],
          },
          voteThreshold: 0.6667,
          durations: [30, 60, 90, 120, 180],
        },
        null,
        2,
      ) + '\n',
  });

  // 기본 텍스트 배틀용 훅: transformPrompt + onUserAction + selectNext
  files.push({
    path: '/game/hooks/automation.js',
    content: [
      '// 기본 텍스트 배틀용 /game/hooks/automation.js',
      '//',
      '// 새 세트에서는 이 훅을 기준으로 프롬프트/라우트만 바꿔도',
      '// Play 디버그에서 바로 텍스트 배틀이 작동하도록 설계되어 있습니다.',
      '',
      '// ---------------------------------------------------------------------------',
      '// AI 판정 결과를 ctx.variables에 반영하는 헬퍼',
      '// ---------------------------------------------------------------------------',
      'function applyBattleOutcomeLocal(ctx, params) {',
      "  if (!ctx || typeof ctx !== 'object') return null;",
      '',
      '  const vars =',
      "    ctx.variables && typeof ctx.variables === 'object'",
      '      ? ctx.variables',
      "      : (ctx.variables = {});",
      '',
      "  const narrative = params.narrative || params.response || '';",
      '  const rawResult = (params.result || \'\').toLowerCase();',
      "  const result = rawResult || 'continue';",
      '  const battleEnd = !!params.battleEnd;',
      '  const winner = params.winner || null;',
      '  const effects = params.effects || null;',
      '  const timestamp = params.timestamp || null;',
      '',
      '  vars.battleLast = {',
      '    narrative,',
      '    result,',
      '    battleEnd,',
      '    winner,',
      '    effects,',
      '    timestamp,',
      '  };',
      '',
      '  // 짧은 토큰 (그래프 라우팅용)',
      "  let outcomeToken = 'continue';",
      '  if (winner && result === \'success\') {',
      "    if (winner === 'hero') outcomeToken = 'hero_win';",
      "    else if (winner === 'rival') outcomeToken = 'rival_win';",
      "    else outcomeToken = `winner_${winner}`;",
      "  } else if (result === 'failure' && winner === 'rival') {",
      "    outcomeToken = 'rival_win';",
      "  } else if (result === 'partial' || result === 'continue') {",
      "    outcomeToken = 'tie';",
      '  }',
      '  vars.battleResult = outcomeToken;',
      '',
      '  if (battleEnd && winner) {',
      '    vars.battleWinner = winner;',
      '  }',
      '',
      '  // 단순 스코어: 종료 시 승자 +1',
      '  const prevScore =',
      "    vars.battleScore && typeof vars.battleScore === 'object'",
      '      ? vars.battleScore',
      '      : { hero: 0, rival: 0 };',
      '  const score = {',
      '    hero: Number(prevScore.hero || 0),',
      '    rival: Number(prevScore.rival || 0),',
      '  };',
      '  if (battleEnd && winner) {',
      "    if (winner === 'hero') score.hero += 1;",
      "    else if (winner === 'rival') score.rival += 1;",
      '  }',
      '  vars.battleScore = score;',
      '',
      '  // 간단 히스토리 (최근 10턴)',
      '  const history = Array.isArray(vars.battleHistory)',
      '    ? vars.battleHistory.slice(-9)',
      '    : [];',
      '  history.push({',
      '    node: ctx.node && ctx.node.id,',
      '    text: narrative,',
      '    winner,',
      '    result,',
      '  });',
      '  vars.battleHistory = history;',
      '',
      '  ctx.variables = vars;',
      '  return {',
      '    battleLast: vars.battleLast,',
      '    battleResult: vars.battleResult,',
      '    battleWinner: vars.battleWinner,',
      '    battleScore: vars.battleScore,',
      '  };',
      '}',
      '',
      '// 그래프 노드 config에서 battle/routes 안전하게 꺼내기',
      'function getBattleConfig(ctx) {',
      '  const node = ctx && ctx.node ? ctx.node : {};',
      "  const cfg = node.config && typeof node.config === 'object' ? node.config : {};",
      "  return cfg.battle && typeof cfg.battle === 'object' ? cfg.battle : {};",
      '}',
      '',
      'function safeRoutes(battle) {',
      '  const r = battle && battle.routes;',
      "  return r && typeof r === 'object' ? r : {};",
      '}',
      '',
      '// /api/ai-battle-judge 호출 헬퍼',
      'async function callBattleJudge(prompt, ctx) {',
      '  try {',
      '    const gameState = {',
      '      turn: ctx.turn,',
      '      nodeId: ctx.node && ctx.node.id,',
      '      nodeLabel: ctx.node && ctx.node.label,',
      '      variables: ctx.variables || {},',
      '    };',
      '',
      "    const res = await fetch('/api/ai-battle-judge', {",
      "      method: 'POST',",
      "      headers: { 'Content-Type': 'application/json' },",
      '      body: JSON.stringify({ prompt, gameState }),',
      '    });',
      '    if (!res.ok) {',
      "      return { ok: false, error: 'HTTP ' + res.status };",
      '    }',
      '    const data = await res.json();',
      '    return { ok: true, data };',
      '  } catch (error) {',
      "    return { ok: false, error: String(error && error.message ? error.message : error) };",
      '  }',
      '}',
      '',
      '// ---------------------------------------------------------------------------',
      '// transformPrompt / onUserAction / selectNext',
      '// ---------------------------------------------------------------------------',
      '',
      'export function transformPrompt(ctx) {',
      "  const base = String(ctx?.node?.label || '');",
      '',
      '  // 이전 턴 히스토리(있으면) 간단히 붙이기',
      '  const vars = ctx.variables || {};',
      '  const history = Array.isArray(vars.battleHistory) ? vars.battleHistory : [];',
      '  if (!history.length) return base;',
      '',
      '  const historyText = history',
      '    .map((h, idx) => `${idx + 1}. ${h.text || \'\'}`)',
      "    .join('\\n');",
      '',
      "  return `이전 턴 요약:\\n${historyText}\\n\\n이번 턴 프롬프트:\\n${base}`;",
      '}',
      '',
      '// Play에서 "채팅 입력"이 들어왔을 때 호출된다.',
      "// - text === '' 또는 'auto'일 때 한 번 AI 판정 실행.",
      '// - 그래프 노드의 config.battle.routes 에 따라 다음 노드 결정.',
      'export async function onUserAction(ctx, input) {',
      "  const text = String(input || '').trim();",
      '  const battle = getBattleConfig(ctx);',
      '  const routes = safeRoutes(battle);',
      '',
      '  // 디버그용 수동 토큰',
      "  if (text === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;",
      "  if (text === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;",
      "  if (text === 'tie' && routes.on_tie) return routes.on_tie;",
      "  if (text === 'rematch' && routes.on_rematch) return routes.on_rematch;",
      "  if (text === 'end' && routes.on_end) return routes.on_end;",
      '',
      "  // \"\" 또는 \"auto\" → 한 번 AI 판정",
      "  if (text === '' || text === 'auto') {",
      '    const prompt = transformPrompt(ctx);',
      '    const result = await callBattleJudge(prompt, ctx);',
      '    if (!result.ok || !result.data) {',
      '      // 실패하면 그래프 기본 엣지에 맡김',
      '      return null;',
      '    }',
      '',
      '    const data = result.data;',
      '',
      '    const outcome = applyBattleOutcomeLocal(ctx, {',
      "      narrative: data.narrative || data.response || '',",
      '      result: data.result,',
      '      battleEnd: data.battleEnd,',
      '      winner: data.winner,',
      '      effects: data.effects,',
      '      timestamp: data.timestamp,',
      '    });',
      '',
      '    // (선택) Play 디버그 패널에 보이는 AI 호출 로그',
      '    try {',
      '      const vars =',
      "        ctx.variables && typeof ctx.variables === 'object'",
      '          ? ctx.variables',
      "          : (ctx.variables = {});",
      '      const debug =',
      '        vars.debug && typeof vars.debug === \'object\' ? vars.debug : (vars.debug = {});',
      '      const calls = Array.isArray(debug.aiCalls) ? debug.aiCalls.slice(-9) : [];',
      '      calls.push({',
      "        kind: 'battle-judge',",
      '        ok: !!result.ok,',
      '        result: data.result || null,',
      '        winner: data.winner || null,',
      '        timestamp: data.timestamp || new Date().toISOString(),',
      "        promptPreview: typeof prompt === 'string' ? prompt.slice(0, 200) : null,",
      '      });',
      '      debug.aiCalls = calls;',
      '      vars.debug = debug;',
      '      ctx.variables = vars;',
      '    } catch {',
      '      // 디버그 기록 실패는 무시',
      '    }',
      '',
      '    // battleResult 토큰으로 라우팅',
      '    const token = outcome && outcome.battleResult;',
      "    if (token === 'hero_win' && routes.on_hero_win) return routes.on_hero_win;",
      "    if (token === 'rival_win' && routes.on_rival_win) return routes.on_rival_win;",
      "    if (token === 'tie' && routes.on_tie) return routes.on_tie;",
      '',
      '    return null;',
      '  }',
      '',
      '  // 그 외 입력은 일단 기본 그래프에 맡김',
      '  return null;',
      '}',
      '',
      'export function selectNext(ctx, neighbors) {',
      '  return neighbors?.[0]?.id ?? null;',
      '}',
      '',
    ].join('\n') + '\n',
  });

  // UI pages skeleton
  files.push({ path: '/game/pages/index.json', content: JSON.stringify({
    main: { title: 'Main', type: 'ui', path: '/game/pages/ui/main.json' }
  }, null, 2) + '\n' });
  files.push({ path: '/game/pages/ui/main.json', content: JSON.stringify({
    type: 'ui.page',
    widgets: [
      { type: 'text', value: 'Edit /graph and /game/hooks to start building.' },
      { type: 'hstack', gap: 8, children: [
        { type: 'input', name: 'player_name', placeholder: 'Your name', event: 'input' },
        { type: 'button', label: 'Submit', event: 'submit_name' }
      ]},
      { type: 'button', label: 'Next', event: 'next' }
    ]
  }, null, 2) + '\n' });

  // State/adapters configs
  files.push({ path: '/game/state/variables.json', content: JSON.stringify({
    score: 0,
    flags: {}
  }, null, 2) + '\n' });
  files.push({ path: '/game/adapters.config.json', content: JSON.stringify({
    renderer: 'canvas2d',
    input: ['keyboard'],
    networking: null,
    sync: null,
    notes: 'Adapters are optional; change identifiers as you wire concrete adapters.'
  }, null, 2) + '\n' });

  // Sample context (read-only by convention)
  files.push({ path: '/context/player.json', content: JSON.stringify({ id: 'player_demo', nickname: 'DemoPlayer', level: 1 }, null, 2) + '\n', readonly: true });
  files.push({ path: '/context/owner.json', content: JSON.stringify({ id: 'owner_demo', title: 'Room Owner', permissions: ['start','kick','mute'] }, null, 2) + '\n', readonly: true });

  // Capability and runtime guides (read-only)
  files.push({ path: '/docs/README.md', content: [
    '# Workspace Guides',
    '',
    '이 폴더는 제작자가 바로 참고할 수 있는 가이드 묶음입니다.',
    '- capabilities/ — 기능 단위 계약(파일/훅/어댑터) 요약',
    '- runtime/ — 런타임 훅/흐름/설정 가이드',
    '',
    'API',
    '- 기능 계약 목록: GET /api/runtime/capability-contracts',
    '- 루트 레퍼런스 탐색: GET /api/refroot/...',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/OVERVIEW.md', content: [
    '# Capability Contracts Overview',
    '',
    '장르가 아닌 기능 단위로 엔진을 조립합니다. 각 항목은 필요한 파일/훅/어댑터를 정의합니다.',
    '- core.graph — /graph/prompt-graph.json',
    '- core.hooks — /game/hooks/automation.js (transformPrompt, onUserAction, selectNext)',
    '- core.runtimeConfig — /game/runtime.config.json',
    '- ui.text — 텍스트 UI(훅 반환 문자열 렌더)',
    '- ui.canvas2d — 캔버스 렌더러(어댑터)',
    '- input.keyboard — 키 입력을 액션으로 매핑',
    '- grid.tilemap, ai.pathfinding, physics.basic, network.socketio, crdt.yjs, worker.offthread 등',
    '',
    '참고: /api/runtime/capability-contracts, /api/refroot/...',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/runtime/HooksQuickstart.md', content: [
    '# Hooks Quickstart',
    '',
    '파일: /game/hooks/automation.js',
    '',
    'export function transformPrompt(ctx) {',
    "  const label = String(ctx?.node?.label || '');",
    "  return label; // 또는 { prompt, ui }",
    '}',
    '',
    'export function onUserAction(ctx, input) {',
    '  // 입력을 보고 다음 노드 id 또는 { next } 반환',
    '}',
    '',
    'export function selectNext(ctx, neighbors) {',
    '  return neighbors?.[0]?.id ?? null;',
    '}',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/core.graph.md', content: [
    '# core.graph',
    '필수 파일: /graph/prompt-graph.json',
    '노드/엣지 예시:',
    '{',
    '  "nodes": [ { "id": "start", "type": "ai", "label": "Intro" } ],',
    '  "edges": [ { "source": "start", "target": "end", "label": "next" } ]',
    '}',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/core.hooks.md', content: [
    '# core.hooks',
    '필수 파일: /game/hooks/automation.js',
    '함수: transformPrompt, onUserAction, selectNext',
    '실행은 샌드박스/타임아웃 가드 하에 이루어집니다.',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/core.runtimeConfig.md', content: [
    '# core.runtimeConfig',
    '파일: /game/runtime.config.json',
    '예시:',
    '{',
    '  "version": 1, "entryNode": "start", "roles": ["players"], "durations": [30,60,90]',
    '}',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/ui.text.md', content: [
    '# ui.text',
    'transformPrompt가 문자열을 반환하면 텍스트 UI로 렌더됩니다.',
    '선택지는 노드/엣지 라벨 또는 onUserAction 처리로 표현합니다.',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/ui.canvas2d.md', content: [
    '# ui.canvas2d',
    '렌더러 어댑터: lib/runtime/adapters/rendererCanvas2D.js 의 attachCanvas2D',
    'hooks 예시: transformPrompt가 { prompt, ui } 형태로 상태를 반환하고, 렌더러가 상태를 그립니다.',
  ].join('\n') + '\n', readonly: true });

  files.push({ path: '/docs/capabilities/input.keyboard.md', content: [
    '# input.keyboard',
    '어댑터: lib/runtime/adapters/inputKeyboard.js 의 attachKeyboard',
    '키 → 액션 매핑으로 onUserAction에 전달합니다.',
  ].join('\n') + '\n', readonly: true });

  // Runtime structure guides
  files.push({ path: '/docs/runtime/Files.md', content: [
    '# Runtime Files',
    '',
    '- /graph/prompt-graph.json — flow graph',
    '- /game/hooks/automation.js — hooks',
    '- /game/runtime.config.json — entry/turns/roles',
    '- /game/pages/index.json — page registry',
    '- /game/pages/ui/main.json — minimal UI example',
    '- /game/state/variables.json — initial variables',
    '- /game/adapters.config.json — selected adapters (ids)',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/runtime/Adapters.md', content: [
    '# Adapters',
    '',
    'Renderer:',
    '- Canvas2D: lib/runtime/adapters/rendererCanvas2D.js',
    '- WebGL: lib/runtime/adapters/rendererWebGL.js (requires three)',
    '',
    'Input:',
    '- Keyboard: lib/runtime/adapters/inputKeyboard.js',
    '- Gamepad: lib/runtime/adapters/inputGamepad.js',
    '',
    'Networking:',
    '- Socket.IO: lib/runtime/adapters/netSocketIO.js (requires socket.io-client)',
    '- Colyseus: lib/runtime/adapters/netColyseus.js (requires colyseus.js)',
    '',
    'Sync:',
    '- Yjs: lib/runtime/adapters/syncYjs.js (requires yjs)',
    '',
    'AI/World:',
    '- Pathfinding: lib/runtime/adapters/pathfindingEasystar.js (requires easystarjs)',
    '',
    'Engine:',
    '- Worker RPC: lib/runtime/adapters/workerRpc.js',
    '- Timing: lib/runtime/adapters/timingTurns.js',
    '- Snapshot: lib/runtime/adapters/storageSnapshot.js',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/networking/SocketIO.md', content: [
    '# Networking — Socket.IO',
    '',
    '- 구성: /game/adapters.config.json 에 { "networking": { "id": "socketio", "url": "https://..." } }',
    '- 코드: lib/runtime/adapters/netSocketIO.js',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/sync/Yjs.md', content: [
    '# Sync — Yjs',
    '',
    '- 구성: /game/adapters.config.json 에 { "sync": { "id": "yjs" } }',
    '- 코드: lib/runtime/adapters/syncYjs.js',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/runtime/UISchema.md', content: [
    '# UI Schema',
    '',
    '- 파일: /game/pages/ui/*.json',
    '- 노드: vstack, hstack, grid, text, image, input, textarea, toggle, select, slider, button, list, card, spacer, progress',
    '- 이벤트는 런타임에서 onUserAction으로 매핑됩니다.',
  ].join('\n') + '\n', readonly: true });

  // Additional capability docs (non-persistent, guidance only)
  files.push({ path: '/docs/capabilities/input.gamepad.md', content: [
    '# input.gamepad',
    '어댑터: lib/runtime/adapters/inputGamepad.js 의 attachGamepad',
    '스틱/버튼을 액션(move_*, confirm)으로 매핑하여 onUserAction으로 전달합니다.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/ui.webgl3d.md', content: [
    '# ui.webgl3d',
    '렌더러 어댑터: lib/runtime/adapters/rendererWebGL.js 의 attachWebGL',
    '주의: three 의존성은 프로젝트에서 제공되어야 합니다.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/network.socketio.md', content: [
    '# network.socketio',
    '어댑터: lib/runtime/adapters/netSocketIO.js 의 connectSocketIO',
    '주의: socket.io-client 의존성 필요.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/network.colyseus.md', content: [
    '# network.colyseus',
    '어댑터: lib/runtime/adapters/netColyseus.js 의 connectColyseus',
    '주의: colyseus.js 의존성 필요.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/crdt.yjs.md', content: [
    '# crdt.yjs',
    '어댑터: lib/runtime/adapters/syncYjs.js',
    '주의: yjs 의존성 필요.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/grid.tilemap.md', content: [
    '# grid.tilemap',
    '격자/타일맵 이동/검증 등을 훅(onUserAction/selectNext)에서 처리합니다.',
    '경로탐색과 함께 사용 권장.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/ai.pathfinding.md', content: [
    '# ai.pathfinding',
    '어댑터: lib/runtime/adapters/pathfindingEasystar.js 의 createPathfinder',
    '주의: easystarjs 의존성 필요.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/physics.basic.md', content: [
    '# physics.basic',
    '렌더러와 통합된 충돌/중력 처리(Phaser 등)가 필요합니다.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/worker.offthread.md', content: [
    '# worker.offthread',
    '어댑터: lib/runtime/adapters/workerRpc.js 의 createWorkerRpc',
    '워커에서 메서드 호출을 메시지 기반으로 수행합니다.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/timing.turns.md', content: [
    '# timing.turns',
    '어댑터: lib/runtime/adapters/timingTurns.js 의 createTurnTimer',
    '턴 타이머/자동 전이를 관리합니다.',
  ].join('\n') + '\n', readonly: true });
  files.push({ path: '/docs/capabilities/storage.snapshot.md', content: [
    '# storage.snapshot',
    '어댑터: lib/runtime/adapters/storageSnapshot.js 의 createSnapshotStore',
    '세트별 변수/히스토리 스냅샷 저장/복구.',
  ].join('\n') + '\n', readonly: true });

  // Keep legacy runner/adapters for now (optional)
  files.push({ path: '/Runtime/runner.js', content: `// Neutral runner: listens to a minimal event bus and echoes status.
export default function createRunner(config = {}) {
  const state = { turn: 0, log: [] };
  const bus = config.bus || { on(){}, emit(){} };

  function ack(msg) { bus.emit('system:message', { type: 'ack', message: msg }); }
  bus.on && bus.on('player:chat', (payload) => {
    state.log.push({ t: Date.now(), type: 'chat', text: String(payload?.text || '') });
    ack('chat:received');
  });
  bus.on && bus.on('turn:next', () => {
    state.turn += 1;
    bus.emit && bus.emit('system:message', { type: 'turn', turn: state.turn });
  });

  return {
    init(){ ack('runner:init'); return { ...state }; },
    step(){ return { ...state }; },
    snapshot(){ return { ...state }; },
  };
}
` });

  files.push({ path: '/Runtime/adapters/canvas2d.single.js', content: `export function attachCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  function draw(text){
    const { width, height } = canvas;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#0f0'; ctx.font = '14px monospace';
    ctx.fillText(text, 10, 20);
  }
  return { draw };
}
` });

  files.push({ path: '/Runtime/worker.sim.js', content: `export function init(config){ return { ok: true, seed: Date.now(), config: !!config }; }
export function step(state){ return { ...state, tick: (state.tick||0)+1 }; }
export function snapshot(state){ return { ...state, ts: Date.now() }; }
` });

  files.push({ path: '/Guides/RUNNER_BUS_QUICKSTART.md', content: `# Runner Bus Quickstart

Events listened: \`player:chat\`, \`turn:next\`\n
Events emitted: \`system:message\` (type: ack|turn)\n
Contract: createRunner({ bus, setId }).init()/step()/snapshot().
` });

  return res.status(200).json({ files });
}
