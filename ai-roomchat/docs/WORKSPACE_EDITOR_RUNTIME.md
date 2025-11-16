# Workspace Editor & Runtime Overview

This document is the **ground truth guide** for how the Maker workspace editor talks to the runtime and main game.  
It’s written so that we can keep the structure stable even while we iterate on features and fix bugs.

---

## 1. Workspace model

### 1.1 Snapshots, drafts, filesForSave

The workspace uses a VSCode‑style three‑layer model:

- `files` – last saved snapshot (server / VFS view).
- `drafts` – current in‑memory working copies, per path.
- `filesForSave()` – derived snapshot used when sending a save to the server (`files` merged with `drafts`).

The core logic lives in `ai-roomchat/lib/workspace/documentStore.js`:

- `createDocumentStore(initialFiles)` → returns a plain JS store:
  - `getSnapshot(path)` – raw `files[path]` (no drafts).
  - `getWorkingCopy(path)` – `drafts[path] ?? files[path].content ?? ''`.
  - `applyDraft(path, content)` – update `drafts` + mark dirty.
  - `discardDraft(path)` – drop a draft + dirty flag.
  - `markSaved(path, content)` – copy content into `files[path]`, recompute signature, clear draft.
  - `isDirty(path)` – whether a path has unsaved work.
  - `filesForSave()` – `{ [path]: FileMeta }` including draft content.
  - `rehydrateFromServer(nextFiles)` – replace `files` with new snapshot but keep drafts and dirty flags.

All React/Monaco code should treat this store as the **single source of truth** for workspace text/state.

### 1.2 React bridge: CodeWorkspaceProvider / useWorkspace

`ai-roomchat/components/workspace/CodeWorkspaceProvider.jsx` wraps the document store and adds:

- Workspace‑level state:
  - `root`, `activePath`, `openPaths`, `entryPath`.
  - `storageNamespace` (workspace / set id).
- Persistence:
  - Drafts in `localStorage` under `workspace.drafts.v1@{ns}`.
  - UI state in `workspace.ui.v1@{ns}`.
- Network / API wiring:
  - `saveFile(path)` – update store + clear draft locally.
  - `saveFileAndPush(setId, path, overrideContent?)` – PUT `filesForSave()` to `/api/workspace/sets/:id`.
  - `saveAll()` / `saveAllAndPush(setId)`.

All consumers should access workspace state via `useWorkspace()`:

- Reading:
  - `files` – snapshot (do *not* mutate directly).
  - `drafts` – text drafts (usually read via helper: `getText(path)` style helpers).
  - `activePath`, `openPaths`, `entryPath`.
- Writing:
  - `setDraft(path, content)` – update working copy.
  - `writeFile(path, content)` – update snapshot (`files`) when we explicitly want to.
  - `saveFile`, `saveFileAndPush`, `saveAll`, `saveAllAndPush`.

Over time, `CodeWorkspaceProvider` should be reduced to “React wrapper around `documentStore` + persistence + API calls” and nothing else.

---

## 2. Editor integration (Monaco)

### 2.1 EditorMonaco

`ai-roomchat/ai-roomchat/components/EditorMonaco.jsx` wraps Monaco using the AMD loader:

- Props:
  - `value: string` – external text (usually from drafts / working copy).
  - `onChange(value: string)` – called on content changes.
  - `language`, `theme`, `height`, `width`.
  - `onSave()` – bound to `Ctrl/Cmd+S`.
- Behavior:
  - Only applies external `value` changes when they are **real external updates** (file switch, remote patch), using `editor.executeEdits` so cursor/undo are preserved.
  - Exposes last selection for debugging via `window.__VFS_ACTIVE_SELECTION__`.

**Rule of thumb**  
Monaco’s model is the in‑editor source of truth; React state mirrors it.  
Do **not** call `editor.setValue` every render or keypress.

### 2.2 CodeEditorOverlayV2 (editor frame)

`ai-roomchat/ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx` is the main editor UI:

- Shows:
  - Top tabs bar (open files, dirty markers, close buttons).
  - Toolbar (AI 코드채팅, 확장, capabilities, play overlay, etc).
  - Main editor pane (`EditorMonaco` for the active file).
- For each file:
  - Local buffer starts from `drafts[path] ?? files[path].content ?? ''`.
  - `onChange` → `setDraft(path, value)`; no server writes on keypress.
  - `onSave`:
    - `markSaved` / `saveFile(path)` inside workspace store.
    - `saveFileAndPush(setId, path, latestBuffer)`.

Tabs and close behavior:

- `isDirty(path)` uses the store’s dirty logic (draft present or snapshot vs saved signature mismatch).
- Closing a dirty tab:
  - Shows a confirm dialog: Save / Discard / Cancel.
  - Save → `saveFileAndPush`.
  - Discard → `discardDraft` + close tab.

---

## 3. Workspace loading & storage

### 3.1 WorkspaceFrame

`ai-roomchat/components/workspace/WorkspaceFrame.jsx`:

- Responsible for loading a workspace set (`/api/workspace/sets/:id`) with Supabase auth.
- Waits for the Supabase session token to be ready before the first GET.
- On success:
  - Passes `initialFiles`, `initialEtag`, and `storageNamespace = id` into `CodeWorkspaceProvider`.
- On empty set:
  - Optionally applies a starter pack when `NEXT_PUBLIC_WORKSPACE_AUTOINIT` is enabled.

### 3.2 API & dev storage

- `ai-roomchat/pages/api/workspace/sets/[id].js`:
  - Validates Supabase user + ownership.
  - Handles `GET` / `PUT` with optimistic locking using `ETag` + `If-Match`.
- `ai-roomchat/lib/workspace/setsStore.js`:
  - Current implementation is dev‑only, process‑local `Map`.
  - Persists `files` + `meta` in memory only (no DB yet).

So **in this repo copy**, workspace saves are not persisted to a DB; they live only in:

- In‑memory `setsStore` on the server (until the process restarts).
- Local drafts in `localStorage` on the client.

Persisting sets to a real DB (Supabase tables) is planned, but intentionally deferred.

---

## 4. Capabilities & extensions

### 4.1 Capability contracts

Capabilities describe “what this set can do” and which files/hook points it provides.

- Server‑side contracts:
  - `ai-roomchat/lib/runtime/capabilityContracts.js`
    - Static `capabilityContracts: CapabilityContract[]`.
    - `getCapabilityContracts()` helper.
  - `ai-roomchat/pages/api/runtime/capability-contracts.js`
    - `GET /api/runtime/capability-contracts` → `{ contracts, count }`.
- Each contract has:
  - `id` – stable capability id (e.g. `core.graph`, `ui.canvas2d`).
  - `category` – `core`, `ui`, `world`, `network`, `state`, `persistence`, ….
  - `purpose` – short description.
  - `files` – VFS files that participate.
  - `hooks` – expected exported functions on the workspace side.
  - `adapters` – runtime modules on the host side (main game / engine).
  - `references` – where to look under `reference_data/**` and `/docs/**`.

### 4.2 Capabilities UI

`ai-roomchat/components/workspace/CapabilitiesMount.jsx` & `CapabilitiesHelpPanel.jsx`:

- Fetch `GET /api/runtime/capability-contracts`.
- Show a searchable list of capabilities with:
  - name, id, category,
  - involved files,
  - hooks / adapters,
  - links to reference data.
- Can be toggled via query (`caps=1`) or keyboard shortcut.

Later, capabilities will also be **per‑set config** (e.g. `meta.capabilities` or `/workspace/capabilities.json`) so that:

- The main game knows which adapters to load for a set.
- The editor can validate required files/hooks for the chosen capabilities.

### 4.3 Extensions

- Extensions are “optional editor helpers” (AI tools, utilities).
- Stored under `meta.extensions` on the workspace set.
- Managed by:
  - `ai-roomchat/lib/workspace/extensionsMeta.js` (load/save helpers).
  - `ExtensionsHost` / `ExtensionInstallModal`:
    - Drive the “확장” dropdown and modal.
    - Keep extension list in sync with `meta.extensions`.

Extensions and capabilities are related but distinct:

- Capabilities → **what the set can do at runtime**.
- Extensions → **what tools the editor provides while authoring the set**.

### 4.4 Per-set capabilities meta

- Selected capabilities for a set are stored under `meta.capabilities`.
- Helpers:
  - `ai-roomchat/lib/workspace/capabilitiesMeta.js`
    - `loadCapabilitiesMeta(id)` → `{ capabilities }`.
    - `saveCapabilitiesMeta(id, capabilities)` → PATCH `meta.capabilities` only.
- UI:
  - `ExtensionInstallModal` includes a “게임 Capabilities” section:
    - Lists contracts from `GET /api/runtime/capability-contracts`.
    - Lets authors toggle capability ids (core/ui/world/network/state/persistence).
    - Saves selections immediately into `meta.capabilities` for the current set.

### 4.5 Capabilities validation helper

- File-based validation helper:
  - `ai-roomchat/lib/workspace/validateCapabilities.js`
    - `buildFilesIndex(files)` – normalizes array/map into path → meta map.
    - `validateCapabilities({ files, contracts, selectedIds })` – returns issues for:
      - unknown capability ids,
      - missing required files per capability.
- This is intended for:
  - Editor-side checks (“이 capability를 쓰려면 어떤 파일이 더 필요하다” 경고),
  - Future CI/lint-style validation of workspace sets.

---

## 5. Runtime / Play overlay

The Play overlay takes the current workspace files and runs a game instance.

Conceptually it uses:

- `core.graph` (`/graph/prompt-graph.json`) – the flow.
- `core.runtimeConfig` (`/game/runtime.config.json`) – entry, roles, turn logic.
- `core.hooks` (`/game/hooks/automation.js`) – custom logic hooks.
- UI capabilities (`ui.text`, `ui.canvas2d`, etc.) – how to render.
- Optional world / network / persistence capabilities.

Implementation lives roughly in:

- `ai-roomchat/components/workspace/OverlayHost.jsx`
- `ai-roomchat/components/workspace/PlayOverlayContent.jsx` (or similarly named file)

The long‑term goal is:

- For each capability id, the runtime knows:
  - which files to read,
  - which hooks to call,
  - which adapter modules to activate.
- The editor validates and guides the user so that a set with selected capabilities is **runnable** in the main game.

---

## 6. Philosophy / guardrails

1. **Structure first, bugfix second.**  
   When behavior is wrong, fix it by aligning to this model (store → provider → editor → runtime), not by sprinkling local patches.

2. **One source of truth per concern.**
   - Text state → document store.
   - UI state (tabs, entryPath) → workspace provider.
   - Capabilities / extensions → workspace meta.
   - Runtime behavior → capability adapters.

3. **Explicit sync boundaries.**
   - Realtime / template sync / service worker reloads must flow through the document store API (`rehydrateFromServer`, etc.), never bypass it.

4. **Make it possible to build “almost any game”.**  
   Capabilities are the contract surface: combinable building blocks that any engine/test can rely on.
