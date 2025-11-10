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

  // Minimal runnable graph: one intro node
  files.push({ path: '/graph/prompt-graph.json', content: JSON.stringify({
    nodes: [ { id: 'start', type: 'ai', label: 'Welcome. Edit /game/hooks/automation.js to customize.' } ],
    edges: []
  }, null, 2) + '\n' });

  files.push({ path: '/game/runtime.config.json', content: JSON.stringify({ version: 1, entryNode: null, roles: ['players'], durations: [30,60,90], mode: 'turn' }, null, 2) + '\n' });

  files.push({ path: '/game/hooks/automation.js', content: [
    "// Hooks runtime (edit freely).",
    "export function transformPrompt(ctx){",
    "  const label = String(ctx?.node?.label || '');",
    "  return label; // 또는 { prompt, ui }",
    "}",
    "",
    "export function onUserAction(ctx, input){",
    "  // 입력을 보고 다음 노드 id 또는 { next } 반환",
    "}",
    "",
    "export function selectNext(ctx, neighbors){",
    "  return neighbors?.[0]?.id ?? null;",
    "}",
  ].join('\n') + '\n' });

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
