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

---

## Workspace runtime features (for AI assistants)

When the AI is helping inside the Maker workspace editor, it should treat “runtime features” as **installable/removable units**, not arbitrary file edits.

- Feature catalog lives in workspace docs:
  - Contracts: `ai-roomchat/docs/WORKSPACE_EDITOR_RUNTIME.md`
  - Per‑capability details: `ai-roomchat/docs/capabilities/*.md`
- Examples of features:
  - `core.text-runtime` → `core.graph` + `core.runtimeConfig` + `core.hooks` + `ui.text` wired to `MainGameMobileUI`.
  - `world.grid-basic` → `world.grid.tilemap` + `ui.canvas2d` scaffolding.
  - `net.realtime-basic` → `network.realtime` + minimal `/game/network.config.json`.
- AI must always:
  1. Explain which feature(s) it wants to install/remove and which files will change.
  2. Ask for explicit user confirmation before applying changes.
  3. Prefer using existing contracts (capabilities) instead of inventing new layouts.
  4. Record chosen capabilities under `meta.capabilities` via the workspace API, not by writing ad‑hoc JSON files.

This keeps AI‑driven changes aligned with the workspace/runtime contracts and makes it easy to inspect or roll back feature installations.
