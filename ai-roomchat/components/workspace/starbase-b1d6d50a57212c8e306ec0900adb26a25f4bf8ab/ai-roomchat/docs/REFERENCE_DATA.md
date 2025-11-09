# Reference Data

Goal
- Provide ready‑to‑use sample assets and JSON for running games directly from the editor.

Serve Path
- Put files under `public/reference-data/` so they are accessible at runtime as `/_host/reference-data/...` (Next.js serves `/public`).
- Or set env `NEXT_PUBLIC_REFERENCE_BASE` to a CDN or custom path.

Loader
- `lib/game/reference/referenceData.js`
  - `urlForReference(key)` → full URL
  - `loadReferenceJSON(key)` → fetch JSON via AssetLoader
  - `listReferenceKeys()` → known keys

Default keys (examples)
- `character.sample` → `characters/character.sample.json`
- `characters.min` → `characters/min.json`
- `text.scene.sample` → `text/scene.sample.json`
- `tilemap.sample` → `tilemaps/level1.json`
- `spritesheet.sample` → `sprites/spritesheet.png`

Usage
```js
import { loadReferenceJSON } from "../../lib/game/reference/referenceData.js";
const character = await loadReferenceJSON('character.sample');
```

Notes
- If your reference data currently lives under `docs/`, copy what you need into `public/reference-data/` for runtime access.
- Keep large assets optimized (spritesheets, compressed audio), and respect bundle budget (see tests).

