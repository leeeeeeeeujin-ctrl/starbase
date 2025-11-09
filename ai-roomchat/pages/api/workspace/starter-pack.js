// GET /api/workspace/starter-pack
// Returns a small, neutral runtime scaffolding set of files.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const files = [
    {
      path: 'Runtime/runner.js',
      content: `// Neutral runner: listens to a minimal event bus and echoes status.
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
`,
    },
    {
      path: 'Runtime/adapters/canvas2d.single.js',
      content: `export function attachCanvas(canvas) {
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
`,
    },
    {
      path: 'Runtime/worker.sim.js',
      content: `export function init(config){ return { ok: true, seed: Date.now(), config: !!config }; }
export function step(state){ return { ...state, tick: (state.tick||0)+1 }; }
export function snapshot(state){ return { ...state, ts: Date.now() }; }
`,
    },
    {
      path: 'game/runtime.config.json',
      content: JSON.stringify({ mode: 'turn', title: 'Starter Runtime' }, null, 2),
    },
    {
      path: 'Guides/RUNNER_BUS_QUICKSTART.md',
      content: `# Runner Bus Quickstart

Events listened: \`player:chat\`, \`turn:next\`\n
Events emitted: \`system:message\` (type: ack|turn)\n
Contract: createRunner({ bus, setId }).init()/step()/snapshot().
`,
    },
  ];

  return res.status(200).json({ files });
}

