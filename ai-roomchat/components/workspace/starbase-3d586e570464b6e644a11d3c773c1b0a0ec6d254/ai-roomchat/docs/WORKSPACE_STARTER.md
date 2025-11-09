# Workspace Starter Pack (Maker Editor)

Goal: show guides and starter files directly in the user code editor tree on Maker pages.

API
- `GET /api/workspace/starter-pack` → `{ files: [{ path, content, readonly }] }`

Client helper
- `lib/workspace/fetchStarterPack.js` → `fetchStarterPack()` and `splitByReadonly()`

Integration sketch (inside CodeWorkspaceProvider / Maker Editor)
```js
import { fetchStarterPack, splitByReadonly } from '../../lib/workspace/fetchStarterPack.js';

async function preloadStarter(workspace) {
  const files = await fetchStarterPack();
  const { editable, readonly } = splitByReadonly(files);
  // Example workspace API (pseudo):
  // workspace.addFiles(editable.map(({ path, content }) => ({ path, content })));
  // workspace.addFiles(readonly.map(({ path, content }) => ({ path, content, readonly: true })));
}

useEffect(() => { preloadStarter(workspace); }, []);
```

Notes
- Editable files live under `src/game/*`.
- Guides are added under `Guides/*` as read‑only.
- Server sources are the files already in this repo; no network dependency required.

