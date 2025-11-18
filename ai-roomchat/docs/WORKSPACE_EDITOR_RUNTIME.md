# Workspace Editor & Runtime Overview

This document is the **authoritative guide** for how the Maker workspace editor talks to the runtime and main game.  
It exists so we can keep the structure stable even while we iterate on features and fix bugs.

---

## 1. Workspace model

### 1.1 Snapshots, drafts, filesForSave

The workspace uses a VSCode-style three-layer model:

- `files` - last saved snapshot (server / VFS view).
- `drafts` - current in-memory working copies, per path.
- `filesForSave()` - derived snapshot used when sending a save to the server (`files` merged with `drafts`).

The core logic lives in `ai-roomchat/lib/workspace/documentStore.js`:

- `createDocumentStore(initialFiles)` - returns a plain JS store:
  - `getSnapshot(path)` - raw `files[path]` (no drafts).
  - `getWorkingCopy(path)` - `drafts[path] ?? files[path].content ?? ''`.
  - `applyDraft(path, content)` - update `drafts` + mark dirty.
  - `discardDraft(path)` - drop a draft + dirty flag.
  - `markSaved(path, content)` - copy content into `files[path]`, recompute signature, clear draft.
  - `isDirty(path)` - whether a path has unsaved work.
  - `filesForSave()` - `{ [path]: FileMeta }` including draft content.
  - `rehydrateFromServer(nextFiles)` - replace `files` with new snapshot but keep drafts and dirty flags.

All React/Monaco code should treat this store as the **single source of truth** for workspace text/state.

### 1.2 React bridge: CodeWorkspaceProvider / useWorkspace

`ai-roomchat/components/workspace/CodeWorkspaceProvider.jsx` wraps the document store and adds:

- Workspace-level state:
  - `root`, `activePath`, `openPaths`, `entryPath`.
  - `storageNamespace` (workspace / set id).
- Persistence:
  - Drafts in `localStorage` under `workspace.drafts.v1@{ns}`.
  - UI state in `workspace.ui.v1@{ns}`.
- Network / API wiring:
  - `saveFile(path)` - update store + clear draft locally.
  - `saveFileAndPush(setId, path, overrideContent?)` - PUT `filesForSave()` to `/api/workspace/sets/:id`.
  - `saveAll()` / `saveAllAndPush(setId)`.

All consumers should access workspace state via `useWorkspace()`:

- Reading:
  - `files` - snapshot (do *not* mutate directly).
  - `drafts` - text drafts (usually read via helpers like `getText(path)`).
  - `activePath`, `openPaths`, `entryPath`.
- Writing:
  - `setDraft(path, content)` - update working copy.
  - `writeFile(path, content)` - update snapshot (`files`) when we explicitly want to.
  - `saveFile`, `saveFileAndPush`, `saveAll`, `saveAllAndPush`.

Over time, `CodeWorkspaceProvider` should be reduced to "React wrapper around `documentStore` + persistence + API calls" and nothing else.

---

## 2. Editor integration (Monaco)

### 2.1 EditorMonaco

`ai-roomchat/ai-roomchat/components/EditorMonaco.jsx` wraps Monaco using the AMD loader:

- Props:
  - `value: string` - external text (usually from drafts / working copy).
  - `onChange(value: string)` - called on content changes.
  - `language`, `theme`, `height`, `width`.
  - `onSave()` - bound to `Ctrl/Cmd+S`.
- Behavior:
  - Only applies external `value` changes when they are **real external updates** (file switch, remote patch), using `editor.executeEdits` so cursor/undo are preserved.
  - Exposes last selection for debugging via `window.__VFS_ACTIVE_SELECTION__`.

**Rule of thumb**  
Monaco's model is the in-editor source of truth; React state mirrors it.  
Do **not** call `editor.setValue` on every render or keypress.

### 2.2 CodeEditorOverlayV2 (editor frame)

`ai-roomchat/ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx` is the main editor UI:

- Shows:
  - Top tabs bar (open files, dirty markers, close buttons).
  - Toolbar (AI code chat, "Extensions", capabilities, play overlay, etc.).
  - Main editor pane (`EditorMonaco` for the active file).
- For each file:
  - Local buffer starts from `drafts[path] ?? files[path].content ?? ''`.
  - `onChange` - `setDraft(path, value)`; no server writes on keypress.
  - `onSave`:
    - `markSaved` / `saveFile(path)` inside the workspace store.
    - `saveFileAndPush(setId, path, latestBuffer)`.

Tabs and close behavior:

- `isDirty(path)` uses the store's dirty logic (draft present or snapshot vs saved signature mismatch).
- Closing a dirty tab:
  - Shows a confirm dialog: Save / Discard / Cancel.
  - Save - `saveFileAndPush`.
  - Discard - `discardDraft` + close tab.

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
  - Current implementation is dev-only, process-local `Map`.
  - Persists `files` + `meta` in memory only (no DB yet).

So **in this repo copy**, workspace saves are not persisted to a DB; they live only in:

- In-memory `setsStore` on the server (until the process restarts).
- Local drafts in `localStorage` on the client.

Persisting sets to a real DB (Supabase tables) is planned, but intentionally deferred.

---

## 4. Capabilities & extensions

### 4.1 Capability contracts

Capabilities describe "what this set can do" and which files/hook points it provides.

- Server-side contracts:
  - `ai-roomchat/lib/runtime/capabilityContracts.js`
    - Static `capabilityContracts: CapabilityContract[]`.
    - `getCapabilityContracts()` helper.
  - `ai-roomchat/pages/api/runtime/capability-contracts.js`
    - `GET /api/runtime/capability-contracts` - `{ contracts, count }`.
- Each contract has:
  - `id` - stable capability id (e.g. `core.graph`, `ui.canvas2d`).
  - `category` - `core`, `ui`, `world`, `network`, `state`, `persistence`, ….
  - `purpose` - short description.
  - `files` - VFS files that participate.
  - `hooks` - expected exported functions on the workspace side.
  - `adapters` - runtime modules on the host side (main game / engine).
  - `references` - where to look under `reference_data/**` and `/docs/**`.

In this repo copy, most adapters are **thin wrappers around reference_data engines/libraries**:

- `core.*`
  - `core.graph` / `core.runtimeConfig` / `core.hooks`
    - Runtime core: `ai-roomchat/lib/runtime/coreRuntime.js`
    - Hook loader + timeout guard: `ai-roomchat/lib/runtime/safeEvalHookModule.js`
    - Prompt graph helpers: `ai-roomchat/lib/runtime/promptRunner.js`
    - References:
      - `reference_data/javascript-state-machine-master*/` - state machine patterns
      - `reference_data/jssm-master/`, `reference_data/stateless.js-master/`
- `ui.text`
  - Adapter surface: `ui.text.overlay` (MainGameMobileUI)
    - Implementation: `ai-roomchat/components/game/MainGameMobileUI.jsx`
    - Feeds on `system:message` events from the core runtime via `runtimeBus`.
    - References:
      - `reference_data/chat-master/` - text/chat UI patterns
      - `docs/STATE_AND_TURNS.md` - text turn flow
- `ui.canvas2d`
  - Adapter module: `ai-roomchat/lib/runtime/adapters/rendererCanvas2D.js`
    - `attachCanvas2D(canvas, options)` - `{ draw(state), resize(w,h), dispose() }`
    - Intended to be the shared 2D "surface" for capabilities like `world.grid.tilemap`.
    - References (rendering engines):
      - `reference_data/phaser-master/`
      - `reference_data/pixijs-dev/`
      - `reference_data/three.js-dev/` (for future `ui.webgl3d`)
- `world.grid.tilemap`
  - Planned adapter: `world.grid.engine`
    - Will combine:
      - A grid / FOV / roguelike engine (e.g. `reference_data/rot.js-master/`)
      - Entity / steering helpers (e.g. `reference_data/yuka-master/`)
      - Optional pathfinding (`ai-roomchat/lib/runtime/adapters/pathfindingEasystar.js`)
    - Files on the workspace side:
      - `/world/tilemap.json`, `/world/entities.json`
- `network.realtime`
  - Adapter manager: `ai-roomchat/lib/runtime/adapterManager.js`
    - Networking:
      - `netSocketIO` - `ai-roomchat/lib/runtime/adapters/netSocketIO.js` (references `reference_data/socket.io-main/`)
      - `netColyseus` - `ai-roomchat/lib/runtime/adapters/netColyseus.js` (references `reference_data/colyseus-master/`)
    - Matchmaking / room management (planned):
      - References: `reference_data/open-match2-main/`, `docs/matchmaking-schema-reference.md`
- `crdt.yjs`
  - Adapter module: `ai-roomchat/lib/runtime/adapters/syncYjs.js`
    - Wraps a Yjs document for shared state.
    - References:
      - `reference_data/yjs-main/`
      - `reference_data/automerge-main/` (alternative CRDT patterns)
- `persistence.supabase`
  - Planned adapter: `persistence.supabase.client`
    - Will map runtime state ↔ Supabase rows.
    - References:
      - `ai-roomchat/lib/workspace/dbWorkspaceSets.js`
      - `docs/matchmaking-schema-reference.md`

### 4.2 Capabilities UI

`ai-roomchat/components/workspace/CapabilitiesMount.jsx` & `CapabilitiesHelpPanel.jsx`:

- Fetch `GET /api/runtime/capability-contracts`.
- Show a searchable list of capabilities with:
  - name, id, category,
  - involved files,
  - hooks / adapters,
  - links to reference data.
- Can be toggled via query (`caps=1`) or keyboard shortcut.

Later, capabilities will also be **per-set config** (e.g. `meta.capabilities` or `/workspace/capabilities.json`) so that:

- The main game knows which adapters to load for a set.
- The editor can validate required files/hooks for the chosen capabilities.

### 4.3 Extensions

- Extensions are "optional editor helpers" (AI tools, utilities).
- Stored under `meta.extensions` on the workspace set.
- Managed by:
  - `ai-roomchat/lib/workspace/extensionsMeta.js` (load/save helpers).
  - `ExtensionsHost` / `ExtensionInstallModal`:
    - Drive the "Extensions" dropdown and modal.
    - Keep the extension list in sync with `meta.extensions`.

Extensions and capabilities are related but distinct:

- Capabilities - **what the set can do at runtime**.
- Extensions - **what tools the editor provides while authoring the set**.

### 4.4 Per-set capabilities meta

- Selected capabilities for a set are stored under `meta.capabilities`.
- Helpers:
  - `ai-roomchat/lib/workspace/capabilitiesMeta.js`
    - `loadCapabilitiesMeta(id)` - `{ capabilities }`.
    - `saveCapabilitiesMeta(id, capabilities)` - PATCH `meta.capabilities` only.
- UI:
  - `ExtensionInstallModal` includes a "Game Capabilities" section:
    - Lists contracts from `GET /api/runtime/capability-contracts`.
    - Lets authors toggle capability ids (core/ui/world/network/state/persistence).
    - Saves selections immediately into `meta.capabilities` for the current set.

### 4.5 Capabilities validation helper

- File-based validation helper:
  - `ai-roomchat/lib/workspace/validateCapabilities.js`
    - `buildFilesIndex(files)` - normalizes array/map into path - meta map.
    - `validateCapabilities({ files, contracts, selectedIds })` - returns issues for:
      - unknown capability ids,
      - missing required files per capability.
- This is intended for:
  - Editor-side checks ("To use this capability, you also need these files" warnings),
  - Future CI/lint-style validation of workspace sets.

---

## 5. Runtime / Play overlay

The Play overlay takes the current workspace files and runs a game instance.

Conceptually it uses:

- `core.graph` (`/graph/prompt-graph.json`) - the flow.
- `core.runtimeConfig` (`/game/runtime.config.json`) - entry, roles, turn logic.
- `core.hooks` (`/game/hooks/automation.js`) - custom logic hooks.
- UI capabilities (`ui.text`, `ui.canvas2d`, etc.) - how to render.
- Optional world / network / persistence capabilities.

Implementation lives roughly in:

- `ai-roomchat/components/workspace/OverlayHost.jsx`
- `ai-roomchat/components/workspace/PlayOverlayContent.jsx` (or similarly named file)

The long-term goal is:

- For each capability id, the runtime knows:
  - which files to read,
  - which hooks to call,
  - which adapter modules to activate.
- The editor validates and guides the user so that a set with selected capabilities is **runnable** in the main game.

In this copy, a minimal core runtime (`ai-roomchat/lib/runtime/coreRuntime.js`) is wired into
`PlayOverlayContent` for the builtin engine:

- Reads `/graph/prompt-graph.json` + `runtime.config` + `/game/hooks/automation.js` and steps through nodes
  using `createCoreRuntime({ graph, config, hooks, files })`.
- For each active node:
  - Builds a `HookContext` with shared `variables` and calls `hooks.transformPrompt(ctx)` when it is defined.
    If that hook returns a value with a `prompt` field, the runtime uses that `prompt` string.
    If there is no `transformPrompt` hook, it falls back to the node's `label` or `id`.
  - That text is then published as a `system:message` event to `runtimeBus`, and `MainGameMobileUI`
    displays it in the "AI Game Chat" panel.
  - `turn:next` - advances via `reason: 'auto'`.
  - `player:chat` - advances via `reason: 'user_action'`, passing the player's input text as `input`
    and using `onUserAction / selectNext` hooks to choose the next node.

Optional adapters (networking / CRDT sync) are initialized based on the selected capabilities:

- `network.realtime` + `/game/network.config.json`:
  - In `PlayOverlayContent`:
    - It calls `loadCapabilitiesMeta(id)` with the current workspace id (`storageNamespace` or router `[id]`)
      to load `meta.capabilities`.
    - If the selected capabilities include `network.realtime` **and**
      `/game/network.config.json` exists:
      - It reads the `engine/id` field (`"socketio"` or `"colyseus"`) and builds a `networking` config.
      - It calls `import('../../lib/runtime/adapterManager.js').then(m => m.initAdapters({ networking }, onEvent))`
        to initialize the networking adapter.
      - Events received from the network are forwarded via `onEvent(evt)` as
        `runtimeBus.emit('net:event', evt)` into the Play overlay.
- `crdt.yjs`:
  - If `meta.capabilities` includes `crdt.yjs`:
    - It calls `initAdapters({ sync: { id: 'yjs' } }, onEvent)` to create a Y.Doc
      via the `syncYjs` adapter.
    - The returned `adapters.sync.doc` is exposed at a location where world/ui/runtime
      code can later use it as shared state. In this first stage, the document is just
      created and its lifecycle is managed; concrete fields/update flows will be added later.

With this setup, the Play overlay:

- Uses `meta.capabilities` plus workspace files (e.g. `/game/network.config.json`, `/state/shared.yjs.json`, etc.)
  to decide which runtime adapters to activate, and
- Builds network/sync layers gradually on top of the core runtime (`core.*`) and UI (`ui.text`, `ui.canvas2d`, etc.).

---

## 6. Philosophy / guardrails

1. **Structure first, bugfix second.**  
   When behavior is wrong, fix it by aligning to this model (store - provider - editor - runtime), not by sprinkling local patches.

2. **One source of truth per concern.**
   - Text state - document store.
   - UI state (tabs, `entryPath`) - workspace provider.
   - Capabilities / extensions - workspace meta.
   - Runtime behavior - capability adapters.

3. **Explicit sync boundaries.**
   - Realtime / template sync / service worker reloads must flow through the document store API (`rehydrateFromServer`, etc.), never bypass it.

4. **Make it possible to build "almost any game".**  
   Capabilities are the contract surface: combinable building blocks that any engine/test can rely on.

---

## 7. Current implementation status (this repo copy)

This repo copy has the following pieces already wired:

- Workspace / editor
  - VSCode-style `files` + `drafts` + `filesForSave` model is implemented via `documentStore` and `CodeWorkspaceProvider`.
  - Monaco wrapper (`EditorMonaco`) is configured not to remount or reset on each keypress; it only applies external `value` when real external changes occur.
  - The Maker editor keeps the code overlay mounted and uses display toggles instead of re-creating the editor subtree.
- Runtime / Play overlay
  - The builtin core runtime (`core.graph` + `core.runtimeConfig` + `core.hooks`) is connected to `PlayOverlayContent` and `MainGameMobileUI`:
    - Reads `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`.
    - Uses `transformPrompt(ctx)` (if provided) to compute text, publishes it as `system:message` to the runtime bus.
    - `turn:next` / `player:chat` events drive `step({ reason:'auto'|'user_action', input })`.
  - Optional adapters are selected based on `meta.capabilities`:
    - `network.realtime` + `/game/network.config.json` - `adapterManager.initAdapters({ networking }, onEvent)` initializes `net` (Socket.IO / Colyseus skeleton).
    - `crdt.yjs` - `initAdapters({ sync: { id: 'yjs' } }, onEvent)` attaches a shared `Y.Doc` via the sync adapter.
- Capabilities / docs
  - All core capabilities (`core.graph`, `core.runtimeConfig`, `core.hooks`, `ui.text`, `ui.canvas2d`, `world.grid.tilemap`, `network.realtime`, `crdt.yjs`, `persistence.supabase`) have:
    - A static contract in `lib/runtime/capabilityContracts.js`.
    - A detailed spec under `docs/capabilities/*.md` with workspace files, hooks, adapter names, and `reference_data/**` mappings.
  - `AI_GAME_PROMPTS.md` includes guidance for AI assistants to treat these as installable "features" (via `meta.capabilities`), not arbitrary file edits.

This means the structural contract (store - provider - editor - runtime - adapters) is in place, and new features can be added by defining a capability + adapter + example set rather than changing the foundations.

---

## 8. Git main push flow (for this environment)

This section documents the default flow used in this Codex workspace when pushing workspace/runtime changes to `main`.

1. **Check current working branch state**
   - `git status -sb`
   - `git branch -vv`
   - `git remote -v`
   - `git branch -r`

2. **Commit changes on the working branch**  
   Example: on `chore/airoomchat-owner-compat`:
   - `git status`
   - `git add .`
   - `git commit -m "docs(workspace): update editor runtime notes"`  
     (Adjust the commit message to actually summarize the change.)
   - (If needed) `git push origin chore/airoomchat-owner-compat`

3. **Sync `main` to the latest remote state**
   - `git switch main`
   - `git pull --rebase origin main`

4. **Merge the working branch into main**
   - `git merge chore/airoomchat-owner-compat`

5. **Push local main to remote main**
   - `git push origin main`

If Git prints an error related to `.git/index.lock`:

- First check whether any other terminal/IDE is currently running Git commands and close them.
- If the issue persists, **make sure all processes using this repo are stopped**, then:
  - Delete the `.git/index.lock` file, and
  - Re-run steps 3-5 above.

---

### 8.2 Agent CLI command set (Codex CLI)

This repo is often edited through an AI assistant running in a CLI environment.  
To keep behaviour predictable, we standardise on a small set of commands that map closely to what a human would do in a normal terminal.

- Git status / branches / remotes  
  - `git status -sb` – quick status with upstream tracking.  
  - `git branch --show-current` – current branch name.  
  - `git remote -v` – verify origin and fetch/push URLs.
- Git push flow  
  - `git add .`  
  - `git commit -m "message"`  
  - `git push`
- File and directory inspection (assistant side)  
  - The CLI sandbox is Windows-based, so under the hood the assistant uses `cmd /C` wrappers such as `cmd /C dir` and `cmd /C cd` instead of `ls` / `pwd`.  
  - For reading files it uses `cmd /C type path\\to\\file` rather than `cat`.
- Search / navigation  
  - `rg "pattern" -n` to search code.  
  - `rg --files | rg "name-fragment"` to locate files by name.
- Editing  
  - File contents are changed via the structured `apply_patch` API (not by shell redirection).  
  - From a human perspective this is equivalent to editing files and then running the git commands above.

## 9. Debugging remount / cursor jump / rollback

To track down issues where editor input disappears, the cursor jumps to the beginning, or state rolls back after saving, we added debug logging to the workspace/editor.

### 8.1 How to enable debug mode

On the client, debug mode is enabled if **any** of the following is true:

- Build-time env var: `NEXT_PUBLIC_WORKSPACE_DEBUG=1`
- Runtime flag: `window.__WORKSPACE_DEBUG__ === true`
- URL query: `?wsdebug=1` is present in the URL
- `localStorage['workspace:debug']` is `'1'` or `'true'`

Example usage (run once in the browser console):

```js
// 1) Enable debug mode for the current tab and persist it for future loads
window.__WORKSPACE_DEBUG__ = true;
localStorage.setItem('workspace:debug', '1');
location.reload();
After this, opening the workspace under the same browser/domain will automatically produce debug logs.

8.2 What logs are emitted

When debug mode is on, the following logs appear from the key components:

Workspace store (both Maker and main)

[Workspace] mount / [Workspace] unmount

[Workspace(flat)] mount / [Workspace(flat)] unmount

Each log includes ns (storageNamespace) and current file count (filesCount).

Editor frame

[EditorPane] mount / [EditorPane] unmount

Logs which file (path) was being edited.

Monaco wrapper (Maker side)

[EditorMonaco] mount / [EditorMonaco] unmount

[EditorMonaco] external setValue

When editor.setValue(...) is called due to file switches or similar,
it logs the previous/current path and text length (before/after).

Monaco wrapper (main / flattened copy)

[EditorMonaco(flat)] mount / [EditorMonaco(flat)] unmount

[EditorMonaco(flat)] external apply

When an external value change is applied via executeEdits,
it logs the path and text length (before/after).

Unified save

[unifiedSave] workspace save

Logs which setId and how many files were passed into the server-side saveSet.

8.3 What to look for when reproducing issues

Open the browser console and reload the workspace page.

On initial load:

Confirm that [Workspace] mount or [Workspace(flat)] mount appears exactly once.

EditorPane / EditorMonaco should also mount once each. Multiple mount/unmount cycles on page load are a smell.

Verify a normal typing scenario once.

While typing in the same file:

There should be no repeated mount/unmount logs for workspace or editor components.

external setValue / external apply logs should only appear when switching files
or when genuinely receiving an external update.

Reproduce the moment when the cursor jumps or the content rolls back after save.

At that moment, inspect the console for:

EditorPane or EditorMonaco(flat) unmount - mount pairs in a short timespan.

If they appear, a component remount actually happened then.

A sudden burst of external apply / external setValue logs
right after typing or pressing save.

If so, an external value (possibly an old snapshot) is being pushed
into the editor and overwriting the current model.

Inspect internal workspace state right after the bug.

In the console:

Check if window.__WORKSPACE_INSPECTOR__ exists.

If not, debug mode might not be active; confirm step 8.1 again.

Example:

const ws = window.__WORKSPACE_INSPECTOR__;
ws.api.activePath;                    // The path that was active
ws.api.files[ws.api.activePath];      // Snapshot (content, readonly, ...)
ws.api.drafts[ws.api.activePath];     // Draft (if any)


Compare:

Is drafts[path] holding the latest typed content?

Is files[path].content still at the initial or some older state?

From this, you can tell where the rollback is happening:

Only in the editor model (draft is fine, snapshot is fine),

Or when drafts are replaced,

Or after a server reload (rehydrateFromServer).

Check the flow when hitting the save button.

On save, confirm in the console:

[unifiedSave] workspace save is logged.

Whether Workspace/EditorPane unmount/mount events happen immediately before/after that.

Whether EditorMonaco(flat) external apply logs show text lengths
that match "initial snapshot length" (indicating that old content is overwriting the buffer).

Using these logs, we can narrow down:

"When is the remount happening?" (auth token refresh, overlay toggle, post-save reload, etc.)

"Which layer is rolling state back?" (draft vs snapshot vs server response)

If you capture a reproduction plus the logs/inspections above and share them, we can then directly patch the specific layer that is causing the rollback/remount behavior.

---

## 10. Capabilities - Play overlay mapping

This section connects abstract capabilities to what the Maker Play overlay actually does today.

### 10.1 Core text runtime (`core.graph` + `core.runtimeConfig` + `core.hooks` + `ui.text`)

Files and roles:
- `/template.json`
  - High-level layout and slots, passed as `template` into `MainGameMobileUI`.
- `/graph/prompt-graph.json`
  - `core.graph` entry; loaded in `PlayOverlayContent` and passed into `createCoreRuntime({ graph, config, hooks, files })`.
- `/game/runtime.config.json`
  - `core.runtimeConfig` entry; parsed into `cfg` and passed both to `createCoreRuntime` and `MainGameMobileUI` as `runtimeConfig`.
  - Fields such as `engine`, `mode`, `durations`, `hookTimeoutMs` control how the core runtime steps and whether it is considered turn-based or realtime.
- `/game/hooks/automation.js`
  - `core.hooks` entry; loaded via `loadHooksFromSource` into a hooks module for `createCoreRuntime`.

Runtime wiring:
- `PlayOverlayContent` constructs a minimal runtime bus:
  - UI - runtime:
    - `player:chat { text }` - `runtime.step({ reason: 'user_action', input: text })`.
    - `turn:next {}` - `runtime.step({ reason: 'auto' })`.
  - Runtime - UI:
    - `createCoreRuntime` returns `{ current, prompt, ui, variables }`.
    - `PlayOverlayContent` converts this into a `system:message` string and emits it on the bus.
    - `MainGameMobileUI` subscribes to `system:message` and renders it as the main text chat/game feed.
- `coreRuntime` uses:
  - `onUserAction(ctx, input)` and `selectNext(ctx, neighbors)` (when present) to control graph traversal.
  - `transformPrompt(ctx)` (when present) to build the final `prompt` string that the UI shows to the player.

### 10.2 Networking (`network.realtime`)

Files and roles:
- `/game/network.config.json`
  - Parsed when the set declares `network.realtime` in `meta.capabilities`.
  - Fields:
    - `engine` / `id`: adapter id hint (e.g. `"socket"`, `"socketio"`, `"colyseus"`).
    - `url`: WebSocket / HTTP endpoint for the room server.
    - `token`: optional auth token.

Capability gating and adapter selection:
- `PlayOverlayContent` reads `meta.capabilities` using `loadCapabilitiesMeta(storageNamespace || id)`:
  - If `meta.capabilities` contains `network.realtime`, it tries to build a `networking` adapter config:
    - If `engine` looks like Socket.IO - `{ id: 'socketio', url, token }`.
    - If `engine` looks like Colyseus - `{ id: 'colyseus', url, token }`.
  - It calls `initAdapters({ networking }, onEvent)` from `lib/runtime/adapterManager.js`.
  - The returned `adapters.network` instance is stored in component state (`netAdapters`).

Runtime bus integration:
- For every incoming networking event:
  - `initAdapters` calls the callback `onEvent(evt)`.
  - The Play overlay bridges this into the runtime bus: `bus.emit('net:event', evt)`.
- Downstream, the main game UI and/or future world adapters can subscribe to `net:event` to:
  - Update shared state.
  - Show room/player status (for example, who joined, whose turn it is).

Fallback behaviour:
- If a workspace does **not** opt into `network.realtime` via capabilities:
  - The Play overlay does **not** load networking adapters, even if `/game/network.config.json` exists.
  - This keeps the default single-player behaviour stable and makes realtime explicit/opt-in.

### 10.3 CRDT / shared state (`crdt.yjs`)

Files and roles:
- No mandatory file yet; the capability is treated as "this set wants shared document state".
- Future versions may formalize `/state/shared.yjs.json` (or similar) as the meta-descriptor.

Capability gating and adapter selection:
- When `meta.capabilities` contains `crdt.yjs`:
  - `PlayOverlayContent` constructs `sync = { id: 'yjs' }`.
  - Calls `initAdapters({ sync }, onEvent)`.
  - Receives an adapter with a `doc` (Y.Doc) instance for use by game code.

Runtime / UI usage:
- The shared doc is not yet fully wired into `MainGameMobileUI`, but the adapter is created and stored in `netAdapters`.
- Next steps (not yet implemented in this copy):
  - Map portions of runtime `variables` or world state into CRDT documents.
  - Use `net.realtime` + `crdt.yjs` together to keep multiple clients' views consistent.

### 10.4 Capability priority and legacy behaviour

- When `meta.capabilities` is **present and non-empty**:
  - The Play overlay should prefer capabilities to decide which adapters and UI behaviours to enable.
  - Example: `network.realtime` must be set to load networking, even if `/game/network.config.json` exists.
- When `meta.capabilities` is **absent or empty**:
  - Legacy sets rely on file presence and config defaults:
    - `core.graph` / `core.runtimeConfig` / `core.hooks` inferred from file paths.
    - Networking/CRDT adapters remain **off** unless explicitly opted into later.
- This keeps older workspaces working "as is", while new ones can opt into richer behaviour via capabilities.

In future refactors, the goal is:
- Make capability selection the **canonical** source of truth for Play behaviour.
- Keep file-based detection only as a fallback for older sets and reference packs.

### 10.5 core.text-runtime minimal set

The core text runtime can be treated as a single installable feature composed of:

- `core.graph`
- `core.runtimeConfig`
- `core.hooks`
- `ui.text`

#### Required files

- `/template.json`
  - Minimal layout for a text game/chat UI (output area + input box).
  - Passed unchanged into `MainGameMobileUI` via the `template` prop.

- `/graph/prompt-graph.json`
  - Prompt-graph entry with a clear entry node (for example `start`).
  - A minimal example might be a two or three node graph: `start - choice - end`.

- `/game/runtime.config.json`
  - Declares that the engine is builtin and that this is a turn-based text runtime. Example:
    ```json
    {
      "engine": "builtin",
      "mode": "turn",
      "entry": "start",
      "hookTimeoutMs": 2000
    }
    ```
  - This config is passed as `config` into `createCoreRuntime` and as `runtimeConfig` into `MainGameMobileUI`.

- `/game/hooks/automation.js`
  - Provides the hooks used by the core runtime. At minimum, it can export:
    - `export async function onUserAction(ctx, input) { ... }`
    - `export async function selectNext(ctx, neighbors) { ... }`
    - `export async function transformPrompt(ctx) { ... }`
  - In a text game, `transformPrompt(ctx)` is usually the most important:
    - It receives `{ current, variables, turn, files }` in `ctx`.
    - It returns either a string or `{ prompt, ui }`.
    - The `prompt` field becomes the text shown via `system:message` in the UI.

#### Runtime flow (core.text-runtime)

- `PlayOverlayContent`:
  - Loads `/graph/prompt-graph.json`, `/game/runtime.config.json`, and `/game/hooks/automation.js`.
  - Calls `createCoreRuntime({ graph, config: cfg, hooks, files })`.
  - On initial mount, calls `runtime.getCurrentWithPrompt()` and publishes the resulting `prompt` as `system:message`.
  - On `turn:next`, calls `runtime.step({ reason: "auto" })` and publishes the resulting `prompt`.
  - On `player:chat { text }`, calls `runtime.step({ reason: "user_action", input: text })` and publishes the resulting `prompt`.

- `MainGameMobileUI`:
  - Subscribes to `system:message` on the runtime bus.
  - Renders each message into the text game/chat area, using the template to place the log and input controls.

With this minimal set present and the capabilities above selected, a workspace set can act as a "pure text game runtime" with no additional adapters required.

### 10.6 `net.realtime-basic` runtime feature

On top of the raw `network.realtime` capability, the runtime layer exposes a higher-level feature id:

- Feature id: `net.realtime-basic`
- Defined in: `ai-roomchat/lib/runtime/runtimeFeatures.js`
- Composition:
  - Capabilities: `['network.realtime']`
  - Required files: `['/game/network.config.json']`

Selection rules:

- `selectRuntimeFeatures({ capabilities, files, config })`:
  - Adds `core.text-runtime` when:
    - All of `core.graph`, `core.runtimeConfig`, `core.hooks`, `ui.text` are selected, or
    - No capabilities are selected but the required files exist (legacy sets).
  - Adds `net.realtime-basic` when:
    - `network.realtime` is selected in `meta.capabilities`, **and**
    - `/game/network.config.json` exists in `files`.
- The resulting feature list is passed into `PlayOverlayContent` as `runtimeFeatures` state.

Current usage:

- In this repo copy, `net.realtime-basic` is primarily a **diagnostic flag**:
  - It appears in the internal state (`runtimeFeatures`) so that future debug banners and UIs can show which high-level features are active.
  - The actual networking behaviour (adapter init, event wiring) is still controlled directly by `network.realtime` and `/game/network.config.json` as described in 10.2.
- Over time, we can promote `net.realtime-basic` to:
  - Gate additional UI (for example, room status/latency indicators).
  - Configure sensible defaults for multi-client play flows.

---

## 11. Extensions: planned GitHub sync and AI web helpers

This section outlines planned work around extensions that live on top of the workspace/runtime contracts.

### 11.1 GitHub sync panel (`github-sync`)

- Goal:
  - Keep "save" (workspace_sets) and "Git commit/push" clearly separated.
  - Make Git operations a conscious action inside the GitHub extension, not an implicit side effect of saving.

- Location:
  - Implemented as a panel under the `github-sync` extension.
  - Triggered from the Extensions dropdown when `github-sync` is installed.

- Behaviour:
  - Reads the linked repository from metadata:
    - `meta.github = { owner, repo, branch }` on the workspace set is the primary source of truth.
    - For older workspaces, `gh.repo` in `localStorage` and the `github-sync` extension's `config` field are used as fallbacks.
  - The panel shows:
    - Current GitHub repo/branch (`owner/repo:branch`).
    - A textarea for commit message.
    - A `Commit & Push` button.
  - When `Commit & Push` is clicked:
    - Fetches the current workspace files snapshot (`filesForSave` via `CodeWorkspaceProvider`).
    - Calls a dedicated GitHub commit API endpoint (`/api/github/commit`) which:
      - Creates/updates files in the linked repo/branch.
      - Creates a Git commit with the provided message.
      - Returns commit metadata (for example SHA and HTML URL).
    - The panel then shows a short result:
      - "Committed to owner/repo@branch" plus a "View on GitHub" link.

- Notes:
  - Errors from GitHub (permissions, branch protection, conflicts) are surfaced in the GitHub panel, not as generic editor errors.
  - This keeps the main editor UX focused on workspace saves, while Git operations stay scoped to the `github-sync` extension.
  - Current status (this copy):
    - The extension can:
      - Store GitHub repo link in `meta.github` (per set).
      - Open a Git Sync panel from the editor toolbar and call `/api/github/commit`.
    - Limitations:
      - If `/api/workspace/sets/:id` returns `401` (no Supabase session), server-side `meta.extensions` / `meta.github` writes fail and install state falls back to client-only.
      - Capability contracts API (`/api/runtime/capability-contracts`) is currently used only for validation; its failures do not block Git Sync but should be fixed separately.
      - The UX is still WIP: missing server auth or misconfiguration can result in "silent no-op" behaviour (no errors in the UI) until error reporting is tightened.

### 11.2 AI web helpers (`codex-web`, `copilot-web`)

- Built-in extensions:
  - `codex-web`:
    - Adds a button in the editor Extensions dropdown or AI code chat panel.
    - When clicked, opens Codex Web in a new tab, using the current workspace context:
      - Base URL: `https://platform.openai.com/codex` (or similar).
      - Query params:
        - `repo`: `${owner}/${repo}` (if linked).
        - `branch`: current branch (if known).
        - `workspaceId`: current workspace set id (`storageNamespace`).
  - `copilot-web`:
    - Mirrors the same pattern for GitHub Copilot or similar web assistants.
    - Opens the provider's web UI in a new tab with minimal context.

- Installation and config:
  - Managed via `ExtensionInstallModal` like other extensions.
  - Stored under `meta.extensions` with optional config:
    - Provider preference.
    - Per-workspace defaults (for example, which repo/branch to treat as primary).

- Behaviour:
  - These extensions do not write files directly.
  - They act as external web helpers that:
    - Receive context (repo/branch/workspace id),
    - Help the user generate or review code,
    - Optionally feed results back into the workspace via AI code chat or manual copy/paste.
  - Future work may allow them to propose structured changes that the AI code chat executes via actions (for example, an `apply_patch` action generated by Codex Web).

These planned extensions sit on top of the existing workspace/runtime/editor contracts, so they can evolve independently without changing the core model.

---

## 12. Supabase persistence and SQL helpers (planned)

Supabase is already the primary backend for this app (auth, workspace_sets, chat, etc.). The goal here is to expose that power directly inside the Maker workspace.

### 12.1 `persistence.supabase` capability

- Capability id: `persistence.supabase`
- Purpose:
  - Map runtime state and match history into Supabase tables (for example, match_sessions, match_turns).
  - Allow workspace-defined logic to control what is stored and how it is reconstructed.
- Workspace files:
  - `/game/persistence.supabase.json` (planned)
    - Declares:
      - which tables are used for sessions, turns, leaderboards, etc.
      - mapping strategies (for example, which fields from runtime `variables` are persisted).
- Hooks:
  - `mapStateToRow(state)` – turn runtime state into a DB row or set of rows.
  - `mapRowToState(row)` – reconstruct runtime state from a DB row.
- Runtime adapter:
  - `persistence.supabase.client` (planned)
    - Uses Supabase client (service role or RPCs) to apply these mappings.
    - Respects auth: only writes under the current user / project where appropriate.

### 12.2 SQL helpers inside the workspace

- Goal:
  - Make it possible to inspect and evolve Supabase schemas for a project without leaving the Maker workspace.
  - Keep dangerous operations clearly separated from normal game authoring.

- Planned extension: `supabase-sql-helper`
  - Appears in the Extensions dropdown when installed.
  - Opens a small panel with:
    - Read-only schema browser:
      - Lists tables relevant to the workspace (for example, match_*, chat_*, workspace_sets).
      - Shows columns and indexes.
    - Safe query runner:
      - Allows running parameterized, read-only queries (for example, SELECT with LIMIT).
      - Executes via a dedicated API route that enforces a whitelist of operations.

- Safety and configuration:
  - Connection:
    - Uses the same Supabase project as the app (NEXT_PUBLIC_SUPABASE_URL / ANON key).
    - Mutating queries (INSERT/UPDATE/DELETE) are disabled or limited to development environments.
  - Usage:
    - Intended primarily for debugging, analytics, and verifying that persistence mappings behave as expected.
    - Heavy migrations should continue to live under `docs/sql` and run via existing migration scripts.

In future iterations, `persistence.supabase` and the SQL helper extension will allow a workspace to fully describe both its runtime capabilities and its long-term data model without leaving the Maker editor.
