// User Game Adapter (Starter)
// This file is visible in the code editor file트리. 자유롭게 수정하세요.
// 규약: export default function createAdapter(opts) => { init, start, stop, dispose, onInput?, resize?, update? }

export default function createAdapter({ bg = '#0c0c10' } = {}) {
  let el, canvas, ctx, running = false, raf = null;
  const state = { t: 0, msg: '' };

  function ensureCanvas() {
    if (!el || canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    el.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    if (!canvas) return;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
  }

  function draw() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.font = '16px sans-serif';
    ctx.fillText('Your Game Adapter (src/game/index.js)', 16, 28);
    ctx.fillText(`t=${state.t.toFixed(2)}s`, 16, 50);
    if (state.msg) ctx.fillText(state.msg, 16, 72);
  }

  function loop(ts) {
    if (!running) return;
    state.t += 1/60;
    draw();
    raf = requestAnimationFrame(loop);
  }

  return {
    init(container, ctxArg = {}) {
      el = container;
      ensureCanvas();
      window.addEventListener('resize', resize);
      // ctxArg: { sessionId, gameId, character, network, emit }
      if (ctxArg?.character?.name) state.msg = `Welcome, ${ctxArg.character.name}!`;
    },
    start() { if (running) return; running = true; raf = requestAnimationFrame(loop); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
    dispose() { this.stop(); window.removeEventListener('resize', resize); if (canvas?.parentNode) canvas.parentNode.removeChild(canvas); canvas = null; ctx = null; el = null; },
    resize,
    onInput(input) { if (input?.type === 'keydown') state.msg = `Key: ${input.key}`; },
    getSnapshot() { return { ...state }; },
  };
}

