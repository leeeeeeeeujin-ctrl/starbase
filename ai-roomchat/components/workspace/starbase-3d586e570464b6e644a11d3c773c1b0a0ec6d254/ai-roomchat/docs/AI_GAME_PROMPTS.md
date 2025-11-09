# AI Code Prompts for Game Plugins

Purpose: guide AI code chat to scaffold user game code compatible with the plugin host.

Constraints
- Only generate code for gameplay; do not request unrelated system permissions.
- Export a factory that returns a GameAdapter (`createGameAdapter` not strictly required if using the raw shape).

Template (2D example)
```
Create file src/game/index.js with:

export default function createAdapter(opts = {}) {
  let container, canvas, ctx, running = false;
  const state = { t: 0 };
  return {
    init(el, ctxArg = {}) { container = el; canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.height='100%'; container.appendChild(canvas); ctx = canvas.getContext('2d'); resize(); },
    start() { if (running) return; running = true; requestAnimationFrame(loop); },
    stop() { running = false; },
    dispose() { this.stop(); canvas?.parentNode?.removeChild(canvas); canvas = null; ctx = null; },
    resize() { const r = container.getBoundingClientRect(); const dpr = window.devicePixelRatio||1; canvas.width=r.width*dpr; canvas.height=r.height*dpr; },
    onInput(input) { /* optional */ },
  };
  function loop(ts){ if(!running) return; state.t += 1/60; draw(); requestAnimationFrame(loop); }
  function draw(){ if(!ctx) return; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#222'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#fff'; ctx.fillText('Hello, Game!', 16, 24); }
}
```

Networking
- Expect `ctx.network.send(type, payload)` and incoming messages via host wiring. Keep payloads small.

Character vars
- Expect `ctx.character` with fields from `docs/CHARACTER_DATA.md`.

Testing in Main Game
- Place `GameCanvasSlot` in a slot and run with sample reference data.

