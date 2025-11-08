// Example engine-agnostic adapter that renders to a canvas
// Serves as a reference for user-authored game code loaded by the editor.

export default function exampleAdapterFactory({ fps = 60 } = {}) {
  let containerEl;
  let canvas;
  let ctx;
  let running = false;
  let rafId = null;
  let last = 0;

  const state = {
    t: 0,
    phase: 0,
  };

  function loop(ts) {
    if (!running) return;
    const dt = (ts - last) / 1000;
    last = ts;
    update(dt);
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    state.t += dt;
    state.phase = (state.phase + dt) % (Math.PI * 2);
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // simple animated background
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, w, h);
    const r = Math.floor(64 + 64 * Math.sin(state.phase));
    const g = Math.floor(64 + 64 * Math.sin(state.phase + 2));
    const b = Math.floor(64 + 64 * Math.sin(state.phase + 4));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.fillText(`ExampleAdapter running t=${state.t.toFixed(2)}s`, 20, 30);
  }

  function ensureCanvas() {
    if (!containerEl) return;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.setAttribute("data-test-id", "example-game-canvas");
      containerEl.appendChild(canvas);
      ctx = canvas.getContext("2d");
      resize();
    }
  }

  function resize() {
    if (!canvas) return;
    const rect = containerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  return {
    init(container, ctxArg = {}) {
      containerEl = container;
      ensureCanvas();
      window.addEventListener("resize", resize);
      last = performance.now();
      // ctxArg: { sessionId, gameId, character, network, emit }
    },
    async loadAssets() {
      // no-op for example
    },
    start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    },
    update,
    resize,
    onInput(input) {
      // input example: { type: 'keydown', key: 'ArrowLeft' }
    },
    onMessage(msg) {
      // network message delivered here if wired
    },
    getSnapshot() {
      return { ...state };
    },
    dispose() {
      this.stop();
      window.removeEventListener("resize", resize);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = null;
      ctx = null;
      containerEl = null;
    },
  };
}
