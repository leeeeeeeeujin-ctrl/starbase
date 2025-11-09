# Workspace & Runtime Extensions

Goal: extend the existing editor UX without changing its layout, while enabling file‑driven runtimes that can power many kinds of games. Everything here is additive and opt‑in via flags.

Key pieces:
- Workspace VFS: code/files saved as a set (`workspace_sets`) with ETag for conflict handling.
- Reference Packs: small, text‑only examples you can mount into the VFS.
- Runner Bus: a minimal event bus bridge between UI and your runtime code.
- External Proxy: optional, rate‑limited path to call an external runtime server you control.

Flags (defaults OFF):
- `NEXT_PUBLIC_RUNTIME_RUNNER=1` – invoke runner in play surfaces.
- `NEXT_PUBLIC_PLAY_BANNER=1` – show a minimal debug banner.
- `NEXT_PUBLIC_SYNC_EXPERIMENT=1` – light broadcast of VFS changes.
- `NEXT_PUBLIC_WORKSPACE_AUTOINIT=1` – auto‑init starter files if empty.

Contracts:
- Runner: `createRunner({ bus, setId }) -> { init(), step(), snapshot() }`
- Bus events (UI -> Runner): `player:chat {text}`, `turn:next {}`
- Bus events (Runner -> UI): `system:message {type, ...}`

Persistence:
- `POST /api/workspace/sets` -> create set, optional initial files.
- `GET/PUT /api/workspace/sets/:id` -> retrieve/update with `ETag` and `If-Match`.

Reference Packs (reference-only by default):
- `GET /api/workspace/reference-index[?id=<pack>]` -> enumerate packs and file paths (no content). Avoid importing content.
- Content export endpoints exist but are disabled unless `ALLOW_REFERENCE_CONTENT=1` is set for local dev.

External Runtime:
- `POST /api/runtime/external-proxy?setId=&path=` reads `/runtime/external.config.json` in your VFS for RPM and domain allowlist.

Size & Ops:
- Keep individual files ≤ 256KB for reference packs.
- Consider ETag conflicts a normal case; prompt to retry/merge on conflict.
