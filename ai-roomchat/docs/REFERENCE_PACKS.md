# Reference Packs

Reference packs are small, text‑only bundles of files intended for inspiration and offline copying. By default, the program does not import any content from them.

Index endpoint (structure only):
- `GET /api/workspace/reference-index` – list pack names
- `GET /api/workspace/reference-index?id=<pack>` – list file paths (no content)

Content export endpoints are disabled by default:
- `GET /api/workspace/reference-pack?id=<pack>`
- `POST /api/workspace/reference-select`
Enable only for local development with `ALLOW_REFERENCE_CONTENT=1` and avoid in production.

Search locations (merged):
- `reference_data/<pack>/`
- `ai-roomchat/docs/reference_data/<pack>/`

Included files:
- Extensions: `.json`, `.js`, `.md`, `.txt`
- Max size: 256KB per file

Recommended minimal pack content:
- `Runtime/runner.js` – implements bus handlers and state.
- `Runtime/worker.sim.js` – optional offload example.
- `Runtime/adapters/*` – e.g., simple canvas adapter.
- `Guides/*` – quick maps and integration notes.
- `game/runtime.config.json` – mode/metadata.

Usage (index only):
```js
// List packs
fetch('/api/workspace/reference-index').then(r=>r.json()).then(console.log);

// List files in a pack (paths only)
fetch('/api/workspace/reference-index?id=universal-basics').then(r=>r.json()).then(console.log);

// If you must import content for a local test, set ALLOW_REFERENCE_CONTENT=1 (not for prod)
```
