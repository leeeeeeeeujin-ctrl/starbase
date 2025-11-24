# Workspace Editor & Runtime Overview

This document is the **authoritative guide** for how the Maker workspace editor talks to the runtime and main game.  
It exists so we can keep the structure stable even while we iterate on features and fix bugs.

Conceptually, this stack behaves like a small but modern **general‑purpose game engine** for AI‑driven games:

- 기본 예시는 “AI 텍스트 배틀”이지만, 이는 **첫 번째 장르 프리셋**일 뿐이다.  
- 실제 엔진(`coreRuntime` + `/graph` + `/game/runtime.config.json` + `/game/hooks/automation.js`)은  
  특정 장르에 묶여 있지 않고, **거의 대부분의 장르/형태의 게임이나 도구**를 표현할 수 있는 수준을 목표로 한다.
- 랭크/매칭 시스템(`rank_*` 테이블, `match-join` API 등)은  
  “게임 규칙”을 모르고 **역할/슬롯/점수/세션**만 다루며, 어떤 장르든 동일한 스키마를 공유하도록 설계되어 있다.

Implementation status & ordering notes

- Section numbers (1, 2, 3, ...) are **topical only**; they do not necessarily match the historical implementation order.
- Features are implemented in a **priority-based order** (for now: security/sandbox → runtime features - AI dock UX - Supabase helpers), and this document is updated as they land.
- Each major section may include a short `Status: done / in progress / planned` note that reflects the current codebase, not a future goal.

Current high-level status (this repo copy)

- Security / sandbox (AI actions): **in progress**
  - Host app vs workspace 경계 확립, 파일 액션 범위 축소, sandbox_exec 허용 리스트 적용.
- Runtime features (`core.text-runtime`, `world.grid-basic`): **in progress**
  - Text runtime는 실사용 가능 수준, grid-basic은 프리뷰 + 간단 엔진까지 연결.
- AI code chat dock (UX / actions): **in progress**
  - JSON 액션 파싱/게이팅, 자동 실행 슬라이더, 로그 표현 개선 일부 반영.
- Supabase persistence + SQL helpers: **planned**
  - Capability/확장 스펙만 정의되어 있고, 실제 어댑터/패널 구현은 이후 단계.

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
    - `createCoreRuntime({ graph, config, hooks, files, initialVariables? })`
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
  - 이 환경의 CLI 샌드박스는 **Windows 기반**이므로, 도우미가 직접 `ls`, `pwd`, `cd` 등을 호출하면 `program not found` 류 오류가 날 수 있다.  
  - 대신 항상 `cmd /C "..."` 래퍼를 사용해 명령을 실행한다. 예:  
    - `cmd /C "cd /D C:\\Users\\...\\starbase && dir"` (리포지토리 루트에서 `dir`)  
    - `cmd /C "cd /D C:\\Users\\...\\starbase && type ai-roomchat\\docs\\WORKSPACE_EDITOR_RUNTIME.md"` (파일 읽기)  
  - 요약하면: **모든 셸 명령은 `cmd /C` 안에서 전체 명령 문자열을 작성하는 것을 기본 규칙으로 한다.**
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
    - It receives `{ current, variables, turn, files, world }` in `ctx`.
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

With this minimal set present and the capabilities above selected, a workspace set can act as a "pure text game runtime" with no additional adapters required. When a workspace also defines `world.grid.tilemap`, the `world` field in `ctx` will include a derived grid view so hooks can render or summarise world state without re-parsing files.

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

### 10.7 `world.grid-basic` runtime feature

This feature groups the world/grid and canvas capabilities into a single unit:

- Feature id: `world.grid-basic`
- Defined in: `ai-roomchat/lib/runtime/runtimeFeatures.js`
- Composition:
  - Capabilities: `['world.grid.tilemap', 'ui.canvas2d']`
  - Required files: `['/world/tilemap.json', '/world/entities.json']`
  - Adapter module (host-side engine, initial implementation done):
    - `ai-roomchat/lib/runtime/adapters/worldGridEngine.js`

Selection rules:

- `selectRuntimeFeatures({ capabilities, files, config })`:
  - Adds `world.grid-basic` when:
    - Both `world.grid.tilemap` and `ui.canvas2d` are selected in `meta.capabilities`, **and**
    - `/world/tilemap.json` and `/world/entities.json` exist in `files`.
- As with `net.realtime-basic`, the resulting feature list is stored in `runtimeFeatures` state inside `PlayOverlayContent`.

Current usage (this repo copy):

- Engine + runtime bridging:
  - `PlayOverlayContent`:
    - When `runtimeFeatures` contains `world.grid-basic`, lazily imports `worldGridEngine.js` and creates:
      - `engine = createWorldGridEngine({ files, bus, hooks })`
        - `files`: 현재 워크스페이스 VFS 스냅샷.
        - `bus`: 텍스트 런타임과 공유하는 런타임 이벤트 버스.
        - `hooks`: `/game/hooks/automation.js`에서 로드한 훅 객체(`stepSimulation`, `applyAction` 포함 가능).
    - 이 엔진을 `gridEngineRef.current`에 저장한다.
    - 빌트인 core runtime가 활성화된 경우:
      - `runtime.setWorldEngine(engine)`을 호출해:
        - 훅에서 사용하는 `ctx.world`가 항상 `engine.getGrid()` 기준의 최신 상태를 보도록 만든다.
      - `engine.setHooks(hooks)`를 호출해:
        - `engine.applyAction` / `engine.step`이 존재할 경우 `hooks.applyAction` / `hooks.stepSimulation`에 위임할 수 있게 한다.
  - `createCoreRuntime`:
    - `setWorldEngine(engine)`과 `getContextSnapshot(reason, input)`을 노출한다.
    - 월드 엔진이 연결된 경우:
      - `ctx.world`는 매 접근 시마다 `engine.getGrid()`를 기반으로 다시 만들어지며(캐시 없음), grid 상태가 드리프트 하지 않는다.
      - `getContextSnapshot`은 호스트 코드가 grid 훅으로 넘길 전체 `ctx`를 만들 때 사용한다.

- Rendering:
  - `MainGameMobileUI`:
    - `runtimeFeatures`에 `world.grid-basic`이 포함된 경우에만 grid 위젯을 활성화한다.
    - 런타임 버스의 `world:grid:state` 이벤트를 구독해 `{ grid }` 페이로드를 `gridState`로 보관한다.
    - `gridState`가 존재하면 `GridCanvas` 위젯을 추가로 렌더한다.
  - `rendererCanvas2D`:
    - `gridState`를 기반으로 타일맵과 엔티티를 단순하게 그린다.
      - width/height/tileSize/layers/tileset를 사용한 타일맵 렌더링.
      - 플레이어/몬스터 엔티티는 색이 다른 원(circle)으로 표시.

- Movement / simulation:
  - 플레이어 입력:
    - 플레이어가 방향 키워드가 포함된 채팅 (`위/아래/왼/오른쪽` 또는 `up/down/left/right`)을 보내면, `PlayOverlayContent`는:
      - 먼저 `runtime.step({ reason: "user_action", input: text })`을 호출해 텍스트 런타임을 진행시키고,
      - 이어서 grid 엔진이 존재하면:
        - `const ctx = runtime.getContextSnapshot?.("user_action", text)`로 훅 컨텍스트를 만들고,
        - `gridEngine.applyAction({ type: "chat", text }, ctx)`를 비동기로 호출한다.
    - `createWorldGridEngine`:
      - `hooks.applyAction`이 정의되어 있으면 이를 먼저 호출하고, 반환값의 `grid` 또는 `entities`로 상태를 갱신한다.
      - 훅이 없거나 아무 것도 반환하지 않으면, `action.dir / direction` 또는 `action.text`에서 방향을 추론해 내부적으로 `movePlayerOnGrid`를 호출한다.
  - 턴/틱:
    - `turn:next` 이벤트가 발생하면:
      - `runtime.step({ reason: "auto" })`로 텍스트 런타임을 한 턴 진행시키고 메시지를 발행한다.
      - grid 엔진이 존재하면:
        - `const ctx = runtime.getContextSnapshot?.("auto")`를 만든 뒤,
        - `gridEngine.step(1, ctx)`를 비동기로 호출해 `hooks.stepSimulation`이 있을 경우 이를 통해 시뮬레이션을 한 스텝 진행시킨다.
      - `step` 역시 반환값의 `grid`/`entities`를 사용해 상태를 갱신하고 `world:grid:state`를 브로드캐스트한다.

- Feature flag:
  - `world.grid-basic`는 이제 다음을 동시에 의미한다:
    - `world.grid.tilemap` + `ui.canvas2d`를 묶는 선언적 feature flag.
    - `PlayOverlayContent` 안에서:
      - world grid 엔진 생성,
      - grid 상태를 런타임 버스로 브로드캐스트,
    - `MainGameMobileUI` 안에서:
      - grid 위젯 렌더링을 켜는 스위치.
  - 향후 이 플래그 아래에서 더 발전된 시뮬레이션(`world.grid.engine`), 네트워킹, 퍼시스턴스를 단계적으로 추가할 수 있다.

### 10.8 프롬프트 노드를 “장소/아레나”로 쓰는 텍스트 배틀 (planned)

목표: 프롬프트 그래프의 각 노드를 “장소/상황(아레나)”처럼 쓰고,  
턴마다 각 캐릭터/진영이 **노드에 적힌 조건에 따라 이동**하면서 승패/진행을 결정하는 텍스트 배틀 엔진을 올리는 것.

핵심 아이디어

- 노드 = “배틀 상의 한 상태/장소”:
  - 예: `Opening`, `Cornered`, `Finisher`, `JudgeDecision` 등.
  - 각 노드는 “이 노드에서 어떤 캐릭터/진영이 어떤 프롬프트/정보를 받고,  
    결과에 따라 어느 노드로 흘러가는지”를 정의한다.
- 턴 구조:
  - 한 턴은 대략 다음과 같이 진행된다(문서 수준 설계):
    1. 현재 노드와 그 노드의 설정(battle config)을 읽는다.
    2. 각 캐릭터/진영에 대해, 이번 턴에 사용할 프롬프트를 만든다.
    3. 지정된 API/모델(예: 서로 다른 LLM, 또는 같은 LLM에 다른 시스템 프롬프트)을 호출한다.
    4. 응답/점수/조건에 따라:
       - 누가 유리해졌는지, 승패가 났는지,
       - 다음에 어떤 노드로 이동할지(같은 노드 유지, 분기, 종료)를 정한다.
    5. `coreRuntime`의 `selectNext` / `onUserAction`가 이 결정을 받아서 실제 다음 노드 id를 선택한다.

설계 스케치 (스키마/훅)

- 노드 쪽(프롬프트 그래프)에서 가질 수 있는 설정 예:
  - `node.config.battle` (예시):
    - `sides`: 각 진영/캐릭터 정의
      - 예: `[{ id: "playerA", characterRef: "hero1" }, { id: "playerB", characterRef: "hero2" }]`
    - `routes`: 노드에서 가능한 이동 규칙
      - 예: `"on_win" → "Finisher"`, `"on_lose" → "Retry"`, `"on_timeout" → "JudgeDecision"`.
    - `promptProfile`: 이 노드에서 프롬프트를 어떻게 조립할지에 대한 힌트
      - 예: 어떤 캐릭터 정보/이전 턴 로그/스코어를 포함할지.
- 훅 쪽(`/game/hooks/automation.js`)에서는:
  - `transformPrompt(ctx)`:
    - `ctx.node.config.battle`와 `ctx.variables`(점수, 턴 수, 각 진영 상태)를 사용해,
    - 이번 턴에 특정 캐릭터/진영에게 보낼 프롬프트를 구성한다.
  - `selectNext(ctx, neighbors)`:
    - 직전 턴의 결과(예: `ctx.variables.score`, `ctx.variables.winner`)와
      `node.config.battle.routes`를 사용해, 다음 노드 id를 결정한다.
  - 선택적으로 `onUserAction(ctx, input)`:
    - 유저가 직접 입력한 텍스트(특수 명령, 룰 변경 등)를 받아  
      전개를 강제로 조정하거나(예: 리매치, surrender) 특정 노드로 점프하는 용도로 사용.

구현 계획 (단계별)

1. **프롬프트 그래프 스키마 확장 (문서 + 예시 파일)**
   - `prompt-graph.json` 예시 노드에 `config.battle` 블록을 추가해,
     - sides,
     - routes,
     - promptProfile
     같은 필드를 쓰는 방식을 먼저 문서와 샘플 JSON으로 고정한다.
   - 이 단계에서는 coreRuntime 코드는 거의 건드리지 않고, 스키마/컨벤션만 정리한다.

2. **훅 레벨에서 “프롬프트별 이동” 규칙 구현**
   - `/game/hooks/automation.js` 예시 세트에:
     - `transformPrompt(ctx)`에서 `config.battle`을 읽어 캐릭터별/노드별 프롬프트를 조립하는 예제를 구현.
     - `selectNext(ctx, neighbors)`에서 `routes`와 점수/조건을 사용해 다음 노드를 고르는 예제를 구현.
   - 이 단계까지 완료되면, 격자/월드 없이도 **순수 텍스트만으로 노드 간 이동이 잘 동작하는 “배틀 루트”**를 만들 수 있다.

3. **“텍스트 배틀 샘플 세트” 완성**
   - `template.json + prompt-graph.json + game/runtime.config.json + game/hooks/automation.js` 네 개로:
     - 캐릭터 A vs B,
     - 몇 개의 핵심 노드(오프닝, 중반, 피니시, 판정),
     - 승패/분기 조건,
     - 간단한 점수/플래그
     를 모두 포함하는 예제를 만든 뒤, 문서에서 “첫 번째 완전한 텍스트 배틀 예시”로 삼는다.

4. **백엔드 AI 판정 API와 연결 (planned, see AI_ORCHESTRATION)**
   - 프론트/런타임:
     - `transformPrompt(ctx)`가 만든 프롬프트를 `/api/ai-battle-judge` 통합 모드에 전달한다.
     - 응답에서 `result` / `battleEnd` / `winner`를 읽어 `variables.battleResult`, `variables.battleWinner` 등에 저장한다.
   - 훅:
     - `onUserAction(ctx, input)` 또는 `selectNext(ctx, neighbors)`에서:
       - `variables.battleResult` / `variables.battleWinner`를 기반으로
         `hero_win` / `rival_win` / `tie` / `continue` 같은 outcome 토큰을 도출하고,
       - 노드의 `config.battle.routes`에 맞춰 다음 노드를 선택한다.

텍스트 배틀용 권장 변수/결과 스키마 (초안):

- `variables.battleLast`:
  - `narrative: string` – 마지막 턴의 내러티브/설명 텍스트.
  - `result: 'success' | 'failure' | 'partial' | 'critical' | 'continue'` – 판정 결과.
  - `battleEnd: boolean` – 이 턴으로 배틀이 끝났는지 여부.
  - `winner: string | null` – 승자 id 또는 null.
  - `effects: any` – 시각 효과/상태 변화 설명(필요 시).
  - `timestamp: string | null` – ISO 타임스탬프(선택).
- `variables.battleResult`:
  - 위 `battleLast.result`를 요약해서 보관하는 짧은 토큰(예: `'hero_win' | 'rival_win' | 'tie' | 'continue'`).
- `variables.battleWinner`:
  - 과거/전체 배틀 기준 최종 승자 id(있다면).
- `variables.battleScore`:
  - `{ hero: number, rival: number }` 형태로 누적 점수/라운드 스코어를 보관하는 용도(구현 단계에서 확장 예정).

텍스트 배틀 훅에서는:

- `/api/ai-battle-judge` 응답 → `variables.battleLast`를 갱신하고,
- 필요한 경우 `variables.battleResult`, `variables.battleWinner`, `variables.battleScore`를 함께 업데이트한 뒤,
- `config.battle.routes`에 정의된 라우트 키(`on_hero_win`, `on_rival_win`, `on_tie`, …)에 위 토큰을 매핑해 다음 노드를 선택하는 패턴을 권장한다.

DB 매핑(초안):

- 테이블 정의는 `ai-roomchat/docs/sql/text-battle-sessions.sql`에 정리되어 있다:
  - `text_battle_sessions` – 한 배틀 전체 요약(최종 승자, 최종 점수 등).
  - `text_battle_turns` – 각 턴의 프롬프트/응답/판정/스코어 스냅샷.
- 런타임 → DB로의 매핑을 돕기 위한 헬퍼:
  - `ai-roomchat/lib/runtime/textBattlePersistence.js`:
    - `toTextBattleSessionRow({ externalId, ownerId, promptSetId, gameName, variables })`:
      - `variables.battleWinner`, `variables.battleScore`를 사용해 `text_battle_sessions`에 INSERT/UPDATE할 row 객체를 만든다.
    - `toTextBattleTurnRow({ sessionId, turnIndex, ctx, durationMs, heroId, rivalId })`:
      - `ctx.node`, `ctx.variables.battleLast`, `ctx.variables.battleScore`를 사용해 `text_battle_turns` row 객체를 만든다.
      - 특히:
        - `prompt` 컬럼 ← `ctx.variables.lastPrompt` (이 턴에 사용된 **전체 프롬프트 텍스트**).
        - `ai_response` 컬럼 ← `ctx.variables.aiResponseRaw` (LLM **원본 응답 전체 텍스트**)가 있으면 그 값을, 없으면 `battleLast.narrative`를 사용한다.
- 실제 INSERT/UPDATE는:
  - Supabase service role을 사용하는 백엔드 코드(예: rank 액션 또는 별도 RPC)에서 이 객체를 받아 `supabase.from('text_battle_sessions')` / `supabase.from('text_battle_turns')`로 실행하는 식으로 구현한다.

다음 단계(우선순위, 이 레포 기준):

1. **세션/플레이어 쓰레드 연결**  *(이 레포 예시에서는 기본 형태 구현 완료)*  
   - `gameState.sessionId`, `heroId`, `rivalId`, `battleScore` 등을 프론트 → 훅 → `/api/ai-battle-judge`까지 전달해, `text_battle_turns` 로그가 “어느 판/어느 참가자 조합인지”를 식별할 수 있게 만든다.  
   - 예시 구현: `docs/examples/text-battle-basic/game.hooks.automation.js`의 `callBattleJudge`에서 `ctx.variables.battleSessionId / battleHeroId / battleRivalId / battleScore`를 읽어 `gameState`에 싣는다.
2. **세션 요약 row 쓰기 (`text_battle_sessions`)**  *(통합 프롬프트 경로에서 초안 구현)*  
   - 한 배틀이 끝날 때(`battleEnd && winner`), `/api/ai-battle-judge.js`의 `processUnifiedGamePrompt`에서:  
     - 기존 스코어 + 판정 결과를 이용해 최종 스코어 스냅샷을 만들고,  
     - `toTextBattleSessionRow({ variables: { battleWinner, battleScore } })`로 `status / winner / final_score`를 계산한 뒤,  
     - `supabaseAdmin.from('text_battle_sessions').update({ status, winner, final_score }).eq('id', sessionId)`로 요약 row를 **best-effort 업데이트**한다. (행이 없거나 FK 구성이 다르면 조용히 실패)
3. **역할/점수폭 설정 파일 연결 (`/game/roles.rank.json`)**  
   - 기존 랭크/게임 등록 UI에서 입력하던 역할/점수폭을 워크스페이스 파일(`/game/roles.rank.json`) 기반으로 읽어, `register_rank_game` 계열 RPC의 `p_roles` 인자로 넘기도록 등록 플로우를 정리한다.

---

### 10.9 역할별 점수폭 설정 (`/game/roles.rank.json`) (planned)

기존 랭크/게임 등록 플로우에서는 UI에서 역할/점수폭을 직접 입력해 `register_rank_game` RPC의 `p_roles` 인자로 넘겼다.  
텍스트 배틀 / Maker 중심 워크플로우에서는 이를 **워크스페이스 파일 + 프롬프트/코드 에디터 도구**로 이관한다.

- 워크스페이스 파일:
  - 권장 경로: `/game/roles.rank.json`
  - 권장 스키마:
    ```json
    {
      "roles": [
        { "name": "공격수", "slotCount": 1, "scoreDeltaMin": -20, "scoreDeltaMax": 40, "active": true },
        { "name": "지원가", "slotCount": 1, "scoreDeltaMin": -10, "scoreDeltaMax": 25, "active": true }
      ]
    }
    ```
- Maker / 에디터 통합:
  - 프롬프트‑노드 에디터 상단의 도구 드롭다운에 있는 **“역할 / 점수 설정”** 패널에서 이 파일을 편집할 수 있다.
  - 코드 에디터(멀티 언어 에디터, 런타임 훅, 등록 스크립트)는 동일한 파일을 직접 읽어 세부 로직에 활용한다.
- 런타임 헬퍼:
  - `ai-roomchat/lib/rank/rolesConfig.js`:
    - `loadRolesConfig(files, path = '/game/roles.rank.json')`:
      - VFS `files`에서 역할 설정을 읽어 `{ roles: [...] }` 형태로 반환한다.
    - `toRegisterRankRolesPayload(cfg)`:
      - 위 `roles` 배열을 `register_rank_game` RPC에서 기대하는 payload로 변환한다:
        - `{ name, slot_count, score_delta_min, score_delta_max, active }[]`
- 향후 통합 방향 (planned):
  - 게임 등록 페이지 / rank 등록 코드에서:
    - 선택된 워크스페이스의 `/game/roles.rank.json`을 읽어,
    - `loadRolesConfig` → `toRegisterRankRolesPayload`를 거쳐 RPC `p_roles` 인자에 전달한다.
  - Maker/프롬프트 에디터 쪽에서는:
    - “역할/점수 설정” 도구를 추가해, 이 파일을 편집하는 편의 UI를 제공하는 것을 목표로 한다.

차후 작업(등록 플로우 · 점수 반영 연동):

- `/game/roles.rank.json` → 랭크 등록:
  - `ai-roomchat/ai-roomchat/pages/api/rank/register-game.js`에서:
    - 폼으로 들어온 `roles`를 그대로 사용하는 대신,
    - 가능하면 워크스페이스의 `/game/roles.rank.json`을 읽어 `loadRolesConfig` → `toRegisterRankRolesPayload`를 거친 결과를 `p_roles`로 넘기는 방향으로 점진적 리팩터링을 진행한다.
- 점수 계산 흐름(개념 구조, planned):
  1. **워크스페이스 런타임/훅**  
     - `/game/hooks/automation.js`나 별도 헬퍼에서:
       - `variables.battleScore` · `variables.rankScoreDelta` 등으로 “이번 판에서 누구에게 몇 점을 줄지”를 계산한다.
       - 필요하면 `/game/roles.rank.json`을 참고해 역할별 가중치/범위를 코드로 구현한다.
  2. **텍스트 배틀 로그/세션(`text_battle_*` 테이블)**  
     - `/api/ai-battle-judge` 경로에서 이미 구현된 것처럼:
       - 턴별 `battleLast`·`battleScore`·`lastPrompt`·`aiResponseRaw`를 `text_battle_turns`에 기록하고,
       - 배틀 종료 시 `text_battle_sessions`에 `battleWinner`·`final_score`를 best-effort로 반영한다.
     - 향후 `rankScoreDelta` 같은 필드를 추가해, “이 판의 제안 점수 변화량”을 함께 남길 수 있다.
  3. **랭크 백엔드(공식 점수 반영)**  
     - 별도의 Supabase RPC(예: `finalize_rank_match`)에서:
       - `text_battle_sessions`/턴 로그에서 읽은 `battleWinner`·`final_score`·`rankScoreDelta`를 기반으로,
       - `/game/roles.rank.json`의 최소/최대 점수폭 안에서 클램프/검증한 뒤,
       - 최종 랭크/레이트 테이블에 반영한다.  
     - 이때 “최종 쓰기 권한”은 항상 백엔드 서비스 롤이 갖고, 워크스페이스 코드는 점수 **제안자** 역할만 한다.

이 계획은 world/grid 엔진과는 **독립적인 텍스트 레벨의 배틀/랭크 흐름**을 먼저 완성하는 것이 목표다.  
이후 필요하면 각 노드의 상태를 `ctx.world`나 grid 엔진과 연결해, “배틀 위치/판”을 시각화하는 쪽으로 확장한다.

실행 순서(요약, 이 레포 기준):

1. **워크스페이스 역할/점수 설정 고정**  
   - `/game/roles.rank.json` 스키마를 유지하면서, Maker 도구(“역할 / 점수 설정” 패널)로 이 파일을 편집·저장하는 흐름을 사용한다.  
   - 코드 에디터/훅에서는 이 파일만을 역할/점수폭의 단일 소스로 삼는다.
2. **텍스트 배틀 → 로그/세션까지 마무리**  
   - `/api/ai-battle-judge` 경로를 통해 `text_battle_turns` · `text_battle_sessions`에 프롬프트/응답/판정/스코어를 모두 남기는 현재 구조를 유지·안정화한다.  
   - 필요 시 `variables.rankScoreDelta` 등 추가 변수를 도입해 “점수 제안값”까지 함께 기록한다.
3. **랭크 등록 플로우 리팩터링**  
   - `register-game` API에서 `/game/roles.rank.json`을 읽어 `loadRolesConfig` → `toRegisterRankRolesPayload` 결과를 `p_roles`로 넘기도록 점진적으로 이관한다(폼 기반 roles는 fallback 또는 보조 역할로 제한).  
4. **매치 종료 → 공식 점수 반영 RPC 추가**  
   - Supabase 쪽에 `finalize_rank_match`(가칭) RPC를 추가해,  
     - `text_battle_sessions`·turn 로그와 `/game/roles.rank.json`을 함께 참고해,  
     - 제안 점수(`rankScoreDelta`)를 검증·클램프 후 최종 랭크/레이트 테이블에 반영한다.  
   - 이 단계까지 구현되면: “게임 제작 → 텍스트 배틀 진행 → 승자/점수 로그 → 공식 랭크 반영”까지의 최소 루프가 완성된다.

Supabase/SQL 작업 협업 메모:

- 이 레포에서는 Supabase DDL/쿼리 작업을 사람·에이전트가 같이 할 수 있도록 `ai-roomchat/SPPP_FI` 파일을 사용한다.
  - SQL 작업이 필요할 때:
    - Codex/Copilot 쪽에서 `SPPP_FI`에 “요청서(어떤 쿼리를 실행하고, 결과를 어디에 써 둘지)”를 적는다.
    - 사람이 Supabase 콘솔/CLI/`tools/run_sql*.py`로 실제 쿼리를 실행한 뒤,
      - 결과를 `assistant-sql/results_*.json`이나 별도 응답 파일(예: `ai-roomchat/SPPP_FO`)에 남긴다.
  - 이후 Codex는 `SPPP_FI`/`SPPP_FO`와 `assistant-sql/results_*.json`을 읽어,
    - 실제 DB 상태를 기준으로 런타임/매칭/랭크 로직을 계속 설계·구현한다.

---

### 10.10 매칭 파이프라인 개요 (planned)

텍스트 배틀/랭크 게임의 “누구와 누구를 한 판에 묶을지”는, 하나의 거대한 알고리즘이 아니라 몇 개의 모듈을 조합해서 처리하는 파이프라인으로 바라본다.

- 후보 선택 모듈 (`match.candidates`)  
  - 입력: `game_id`, `mode`, 큐 테이블(`rank_match_queue`) 상태.  
  - 역할: 같은 게임/모드에서 상태가 `waiting`인 엔트리를 모아, 인원 수/기본 필터(예: 최소 인원, 최대 12인)를 만족하는 후보 그룹을 만든다.
- 역할/슬롯 배치 모듈 (`match.assignRoles`)  
  - 입력: 후보 리스트 + `rank_game_roles` + `rank_game_slots` + `/game/roles.rank.json`.  
  - 역할: 슬롯 그리드(공격/수비/지원 등)에 각 참가자를 배치해 `{ slot_index, role, user_id, hero_id }[]` 형태의 로스터를 만든다.
- 점수 윈도우 모듈 (`match.scoreWindow`)  
  - 입력: 후보들의 점수(레이팅/스코어) + 게임별 매칭 설정(기본/최대 점수 폭 등).  
  - 역할: 이 조합을 허용할지, 일부 후보를 제외하고 재시도할지 결정한다(실시간/비실시간에 따라 윈도우/대기시간 정책만 다르게 적용).
- 난입 모듈 (`match.dropIn`)  
  - 입력: 이미 진행 중인 매치의 빈 슬롯(`rank_rooms` / `rank_room_slots`) + 새 큐 엔트리.  
  - 역할: 기존 로스터에 영향을 최소화하면서 빈 슬롯만 채우는 별도 파이프라인을 제공한다(기본 `assignRoles` 로직을 재사용).

향후에는:

- 게임별 설정 파일 또는 DB 설정(예: `/game/matchmaking.config.json` 또는 `rank_games`의 확장 필드)을 통해  
  - 어떤 모듈 조합을 쓸지,  
  - 최대 인원, 허용 점수 폭, 난입 허용 여부 등을 선언하고,  
- 매칭 서버/RPC는 위 선언에 따라 모듈을 순차적으로 적용해 매칭을 수행하는 구조를 목표로 한다.

현재 이 레포에서는:

- 큐/역할/슬롯/룸/세션 테이블은 `supabase.sql` 및 `docs/sql/*matchmaking*.sql`에 정의되어 있고,  
- 매칭 알고리즘은 위 모듈 구조를 참고해 텍스트 배틀 1세대(단순 2인 매칭)부터 점진적으로 리팩터링하는 것을 계획하고 있다.

실제 구현 순서(현재 계획):

1. **텍스트 배틀 세션/턴 로그 안정화 (진행 중)**  
   - `/api/ai-battle-judge`에서 `text_battle_turns`/`text_battle_sessions`에 베이직 로그를 남긴다.  
   - `pages/text-battle/session/[id].jsx`로 “결과/턴 로그”를 확인할 수 있게 만든다.  
   - 이 단계에서는 아직 랭크 점수와 직접 연결하지 않는다.
2. **간단한 JS 매칭 엔진 도입 (진행 중, 장르 공용)**  
   - `lib/rank/simpleMatchEngine.js`:
     - DB에 의존하지 않는 순수 함수로  
       - 후보 선택,  
       - 역할/슬롯 배치(예: 1:1 텍스트 배틀용 공격/수비 2슬롯),  
       - 점수 윈도우 적용  
       을 `matchRankParticipants` 위에 얇게 래핑한다.  
     - 작은 샘플 데이터나 Supabase에서 읽어온 큐/역할 데이터를 그대로 넣어  
       Node/브라우저에서 직접 호출·검증할 수 있다.
    - `pages/api/rank/match/preview.js`:
      - `gameId`(+선택적인 `mode`)를 받아  
        `rank_game_roles` / `rank_match_queue`를 Supabase에서 읽어온 뒤,  
        `runSimpleMatch(...)`를 호출해 1회 매칭 계획과 디버그 요약을 JSON으로 돌려주는
        **개발/디버그용 프리뷰 API**를 제공한다.
      - 텍스트 배틀 뿐 아니라, 같은 랭크 스키마를 사용하는 어떤 장르에서도 재사용 가능하다.
    - `pages/api/rank/match/join.js`:
      - POST 바디의 `{ gameId, mode, ownerId, heroId, role, score }`를 받아  
        1) 호출자를 `rank_match_queue`에 `status='waiting'`으로 upsert 한 뒤,  
        2) 동일 `gameId/mode` 큐를 `runSimpleMatch(...)`에 넣어 1회 매칭을 수행하고,  
        3) 이 ownerId가 포함된 `ready=true` 매치가 있으면:
           - `rank_rooms` / `rank_room_slots` / `rank_sessions`에 단순 방/슬롯/세션을 생성하고,  
           - 사용된 큐 엔트리의 `status`를 `matched`, `match_code`를 방 코드로 업데이트한다.  
        4) 아직 준비되지 않은 경우에는 `matched: false` 상태와 매칭 프리뷰를 반환한다.
      - 이 API 또한 장르에 독립적인 “공용 랭크 매칭 조인 엔드포인트”로 설계되어 있으며,  
        텍스트 배틀 런타임은 이 엔드포인트 위에 얹어 쓰는 소비자 역할만 맡는다.
3. **Supabase 매칭 RPC와 브리지 (다음 단계)**  
   - Supabase 쿼리/함수는 `SPPP_FI` + `assistant-sql/results_*.json` 루프를 통해 협업으로 적용한다.  
   - JS 매칭 엔진에 맞춘 형태로 `rank_match_queue`/`rank_rooms`/`rank_sessions`를 읽고 쓰는 RPC를 설계한다  
     (예: `find_text_battle_pair(...)`, `finalize_text_battle_rank(...)` 등).  
4. **멀티플레이/난입/모드별 정책 확장 (후속)**  
   - 위 1~3단계가 안정된 뒤, `match.dropIn`, 12인 슬롯 구성, 모드별 정책(실시간/비실시간, 난입 허용 등)을  
     동일한 모듈 구조 위에서 확장한다.

---

## 11. Rank 메인게임(StartClient) vs Play 오버레이

### 11.1 단일 게임 런타임 원칙

- 워크스페이스 기반 게임은 **단 하나의 런타임 엔진**을 기준으로 한다.
  - 엔진: `coreRuntime` + `/graph/prompt-graph.json` + `/game/runtime.config.json` + `/game/hooks/automation.js`
  - 월드/캔버스/네트워크 등은 이 엔진 위에 올라가는 어댑터/캡ability로 취급한다.
- UI는 여러 개일 수 있다.
  - Play 오버레이: 개발/디버그용 미니 게임 화면 (에디터 위).
  - Rank StartClient: 매칭/세션에 붙는 메인 게임 화면.
- 두 UI 모두 **같은 런타임/같은 훅/같은 파일 세트를 사용해야 한다.**
  - 차이는 “참여자가 실제 사람인지”, “매칭/세션 컨텍스트가 붙어 있는지” 정도로 제한한다.

### 11.2 현재 상태 (이 레포 사본)

- Play 오버레이:
  - 이미 `core.text-runtime` 흐름을 그대로 사용한다.
  - `/graph` + `/game/runtime.config.json` + `/game/hooks/automation.js` + (선택) `worldGridEngine`를 읽어  
    `createCoreRuntime({ graph, config, hooks, files })` + `MainGameMobileUI`를 구동한다.
- Rank StartClient:
  - 별도 엔진(`matchFlow` + `preflight` + `timeline` 등)을 가지고 있고,
  - Supabase `rank_*` 테이블에서 읽은 슬롯/참가자/턴 이벤트를 바탕으로 **독자적인 전투 상태 머신**을 돌리고 있다.
  - 최근 작업으로:
    - 매칭(`match-join`) → `rank_sessions` → StartClient 입장 흐름이 연결되었고,
    - `matchDataStore`를 통해 일부 매치 스냅샷/세션 메타를 공유하지만,
  - 실제 게임 진행/프롬프트/훅 호출은 아직 Play 오버레이 엔진과 완전히 같지 않다.

### 11.3 목표 구조 (정렬 계획)

- 엔진:
  - `coreRuntime` + 워크스페이스 훅(`/game/hooks/automation.js`)이 **유일한 게임 규칙/턴 엔진**이다.
  - Rank StartClient는 이 엔진을 “세션 컨텍스트 위에 올려서” 실행한다.
- 컨텍스트:
  - 랭크/매칭 정보는 **엔진 바깥 컨텍스트**로만 제공한다.
    - 예: `sessionId`, `roomId`, 슬롯/참가자, 점수/레이팅, 드롭인 상태, 턴 제한 등.
    - 런타임에서는 `ctx.variables.rank` 아래에만 랭크/매칭 관련 변수를 둔다. 예:
      - `ctx.variables.rank.sessionId` – 현재 랭크 세션 id (또는 null).
      - `ctx.variables.rank.gameMode` – `'rank_shared'` 등 랭크 모드 토큰.
      - `ctx.variables.rank.realtimeEnabled` / `ctx.variables.rank.dropInEnabled`.
      - `ctx.variables.rank.players[]` – `{ ownerId, heroId, heroName, role, score, rating }` 형태의 참가자 목록.
  - 이 컨텍스트는:
    - 엔진 생성 시 `createCoreRuntime({ ..., initialVariables: { rank: {...} } })`로 주입되거나,
    - UI(Play/StartClient)가 디버그/요약용으로만 읽는다.
- UI:
  - Play 오버레이:
    - 개발/디버그용이지만, 실제 게임 규칙/프롬프트/훅은 메인게임과 **완전히 동일**해야 한다.
  - Rank StartClient:
    - “플레이 엔진 모드”를 갖추고, 텍스트 배틀 장르에서는  
      `MainGameMobileUI` 또는 그 변형을 그대로 사용해 동일한 런타임 결과를 보여준다.
    - 슬롯/참가자/점수/정산/투표 뷰는 **엔진 위의 추가 패널**로만 취급한다.

### 11.4 구현 순서 (요약)

1. 문서 정렬 (이 섹션):
   - “엔진은 하나, UI는 둘” 원칙을 명시하고, Rank StartClient가 런타임 소비자임을 못 박는다.
2. Rank StartClient에 플레이 엔진 탑재:
   - 텍스트 베틀/`core.text-runtime`인 경우:
     - `MainGameMobileUI + coreRuntime` 흐름을 StartClient 안에서 그대로 구동하는 모드를 추가한다.
   - 기존 `matchFlow` 기반 엔진은 텍스트 베틀에선 점진적으로 축소/제거한다.
3. 랭크 컨텍스트 주입:
   - `sessionId`/`roomId`/슬롯/참가자/점수/드롭인 상태를:
     - 런타임 훅 컨텍스트(ctx.variables/meta)와,
     - StartClient의 보조 패널(참가자, 정산, 점수 요약)에만 사용하도록 정리한다.
4. 레거시 엔진 정리:
   - 텍스트 베틀 장르에서 `matchFlow`/`preflight`가 담당하던 영역을  
     `coreRuntime` + 워크스페이스 훅 + 랭크 컨텍스트로 대체하고,
   - 향후 다른 장르도 같은 패턴(단일 런타임 + 랭크 컨텍스트)으로 정렬한다.

상태:

- Play 오버레이 / 워크스페이스 런타임: **in progress → stable에 근접**  
- Rank StartClient와의 런타임 정렬:  
  - `buildRankContext`로 랭크 컨텍스트를 만들고,  
  - `useStartClientEngine`에서 `textRuntimeEnabled` 플래그와 함께 노출하며,  
  - `StartClient`의 플레이 영역은  
    - `textRuntimeEnabled === true`인 게임에 대해서는 `MainGameMobileUI + coreRuntime` 조합을 **메인 화면으로 사용**하고,  
    - 그 외 레거시 게임에 대해서만 기존 `TurnInfoPanel + ManualResponsePanel` 엔진을 사용한다.  
- 이후 코드 리팩터는 이 섹션을 기준으로 진행한다.

### 11.5 Rank 컨텍스트 헬퍼 (`buildRankContext`)

- 위치: `ai-roomchat/lib/rank/rankContext.js`
- 함수: `buildRankContext({ game, session, participants, room })`
  - 입력:
    - `game`: `rank_games` 행 (`id`, `rules`, `realtime_match`, `match_source` 등).
    - `session`: `rank_sessions` 행 (또는 `{ id, mode, status, room_id, ... }` 형태의 스냅샷).
    - `participants`: 현재 세션/룸 참가자 배열:
      - 최소 `{ owner_id/ownerId, hero_id/heroId, hero: { id, name }, role, score, rating }` 필드를 포함.
    - `room`: `rank_rooms` 행(선택) – `mode` / `realtime_mode` 등.
  - 출력(`rankContext`):
    - `sessionId`: `session.id` (또는 `session.session_id`) 정규화.
    - `gameMode`: `session.mode` / `room.mode` / 기본 `'rank_shared'`.
    - `realtimeEnabled`: `extractMatchingToggles(game, rules).realtimeEnabled` 기반 boolean.
    - `dropInEnabled`: 동일 토글 기반 boolean.
    - `players`: `{ ownerId, heroId, heroName, role, score, rating }[]`.

### 11.6 StartClient의 메인 런타임(플레이 엔진 탑재)

- 위치:
  - 훅: `components/rank/StartClient/useStartClientEngine.js`
    - `loadGameBundle(...)` 결과로 `graph` + `participants` + `slotLayout`을 불러온 뒤,
    - `buildRankContext({ game, session, participants, room })`로 `rankContext`를 생성하고,
    - `engineState`에 `rankContext`, `textRuntimeEnabled: true`를 함께 저장한다.
    - 훅의 반환값으로 `graph`, `slotLayout`, `rankContext`, `textRuntimeEnabled`를 노출한다.
  - UI: `components/rank/StartClient/index.js`
    - `textRuntimeEnabled === true`인 게임에 대해서:
      - 플레이 컬럼 전체를 `MainGameMobileUI + coreRuntime` 조합으로 사용하고,
      - 기존 `TurnInfoPanel + ManualResponsePanel` 엔진은 레거시 게임(비 텍스트‑런타임)에만 사용한다.
- 동작 개요:
  - StartClient는 랭크 세션 입장 시:
    1. `rank_game_workspaces`에서 해당 `game_id`의 워크스페이스 스냅샷을 조회한다:
       - `template`  → `/template.json`
       - `graph`     → `/graph/prompt-graph.json`
       - `runtime_config` → `/game/runtime.config.json`
       - `hooks_source`  → `/game/hooks/automation.js`
    2. 스냅샷이 있으면 이를 기준으로 coreRuntime를 구성한다:
       - `graph`: 스냅샷 `graph` 또는 `loadGameBundle`의 `graph`.
       - `config`: 스냅샷 `runtime_config` (없으면 `{}`) + `entryNode` 보정:
         - `entryNode`가 비어 있으면, 그래프 첫 노드 id로 채운다.
       - `hooks`: `hooks_source`를 `loadHooksFromSource`로 로드한 훅 모듈(없으면 `null`).
       - `files`: 위 네 파일을 모두 포함한 VFS 스냅샷 (`ctx.files`에서 그대로 보인다).
       - `initialVariables: { rank: rankContext }`.
    3. 스냅샷이 없으면:
       - Supabase에서 구성한 `graph`만 `/graph/prompt-graph.json`으로 쓰고,
       - 나머지 파일은 `CodeWorkspaceProvider`의 기본값을 사용한다.
    4. `runtimeBus`:
       - `turn:next` → `runtime.step({ reason: 'auto' })`,
       - `player:chat` → `runtime.step({ reason: 'user_action', input: text })`,
       - 결과 프롬프트를 `system:message` 이벤트로 `MainGameMobileUI`에 전달한다.
  - 플레이 UI:
    - `MainGameMobileUI`는 `CodeWorkspaceProvider`로 감싸져 있고:
      - StartClient에서 로드한 워크스페이스 스냅샷이 있으면 그 내용을 `initialFiles`로 받는다.
      - 따라서 코드 에디터/프롬프트‑노드 에디터에서 저장한 템플릿/그래프/런타임 설정/훅이  
        랭크 메인게임에도 동일하게 반영된다.

- 사용처(계획):
  - Rank 기반 실행 시:
    - Supabase에서 `game` / `session` / `participants` / `room`를 읽고,
    - `const rank = buildRankContext({ game, session, participants, room });`
    - `createCoreRuntime({ graph, config, hooks, files, initialVariables: { rank } })`로 엔진 생성.
  - 훅에서는 언제나 `ctx.variables.rank`로 랭크 정보를 읽고, 장르에 무관하게 동일 구조를 사용한다.

### 11.7 Rank 게임 워크스페이스 스냅샷 (`rank_game_workspaces`)

- 테이블 / RPC:
  - SQL: `ai-roomchat/ai-roomchat/docs/sql/rank-game-workspace-snapshot.sql`
    - `public.rank_game_workspaces`:
      - `game_id uuid primary key references public.rank_games(id) on delete cascade`
      - `template jsonb` — `/template.json` 파싱 결과
      - `graph jsonb` — `/graph/prompt-graph.json`
      - `runtime_config jsonb` — `/game/runtime.config.json`
      - `hooks_source text` — `/game/hooks/automation.js` 원본 소스
      - `created_at`, `updated_at`
    - `public.save_rank_game_workspace(p_game_id uuid, p_workspace jsonb)`:
      - `p_workspace` 구조 예:
        ```json
        {
          "template": { "nodes": [], "resources": {} },
          "graph": { "nodes": [...], "edges": [...] },
          "runtime_config": { "version": 1, "entryNode": "start", "roles": ["players"] },
          "hooks_source": "export function onUserAction(ctx,input){...}"
        }
        ```
      - `game_id` 기준으로 upsert (없으면 insert, 있으면 update).
  - API:
    - `GET /api/rank/game-workspace?gameId=...`
      - 구현: `ai-roomchat/ai-roomchat/pages/api/rank/game-workspace.js`
      - 응답: `{ ok: true, workspace: { template, graph, runtime_config, hooks_source, ... } | null }`
    - `POST /api/rank/save-game-workspace`
      - 구현: `ai-roomchat/ai-roomchat/pages/api/rank/save-game-workspace.js`
      - 요청: `Authorization: Bearer <token>`, body:
        ```json
        {
          "gameId": "<rank_games.id>",
          "workspace": {
            "template": { ... },
            "graph": { ... },
            "runtime_config": { ... },
            "hooks_source": "export function ..."
          }
        }
        ```
      - 동작:
        - 토큰으로 유저 확인 (`supabase.auth.getUser`).
        - `rank_games.owner_id === user.id` 인지 권한 체크.
        - 우선 `save_rank_game_workspace` RPC 호출, 미배포 환경에서는 `rank_game_workspaces`에 직접 upsert.
- 플로우(의도):
  1. Maker/코드 에디터에서 `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`를 작성·저장한다.
  2. 랭크 게임 등록:
     - `/api/rank/register-game` → `gameId` 생성.
     - 같은 세트/워크스페이스 컨텍스트에서 위 네 파일을 읽어 `/api/rank/save-game-workspace`로 전송한다.
  3. 메인게임(StartClient) 입장:
     - `GET /api/rank/game-workspace?gameId=...` → 스냅샷 로드.
     - 스냅샷이 있으면, 이 내용을 coreRuntime + `CodeWorkspaceProvider.initialFiles`에 그대로 주입해  
       플레이/메인게임이 동일한 파일/구성을 바라보도록 한다.

### 11.8 남은 정렬 작업 (요약)

- 워크스페이스 → 랭크 스냅샷 저장:
  - (현재 레포 상태: **구현 완료**)  
    - Rank 등록 UI(`RankNewClient`)에서 `/api/rank/register-game` 성공 후,  
      현재 워크스페이스의 `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`를 읽어  
      `/api/rank/save-game-workspace`로 전송하는 흐름이 연결되어 있다.
  - 이때 “어느 워크스페이스 세트의 파일을 읽을지”는 Maker/Rank 화면 간 공유 컨텍스트(예: set id)를 기준으로 결정한다.
- 텍스트 런타임 게임에서 레거시 엔진 정리:
  - `textRuntimeEnabled === true`인 게임:
    - 메인 턴 진행/프롬프트/승패 로직은 오직 `coreRuntime + /game/hooks/automation.js`에서만 처리한다.
    - (현재 레포 상태: StartClient UI와 레거시 `advanceTurn`에서 텍스트 런타임 게임에 대한 직접 진행은 막아둔 상태이며,  
      `matchFlow`/타임라인 엔진은 로그/슬롯/투표 패널용 데이터만 유지하도록 단계적으로 축소 중이다.)
- 훅에서 `ctx.variables.rank` 적극 사용:
  - 예제 훅(`/game/hooks/automation.js`, 텍스트 배틀 예시)에서:
    - `ctx.variables.rank.players`, `sessionId`, `gameMode`,  
      `realtimeEnabled`, `dropInEnabled` 등을 실제로 읽어:
      - 실시간/비실시간 분기,
      - 난입 허용 여부,
      - 참가자/역할별 프롬프트/점수 계산에 활용하는 패턴을 정착시킨다.
- 세션 종료 → 랭크 점수 반영:
  - 텍스트 배틀 세션 종료 시:
    - `text_battle_sessions`/`text_battle_turns`와 `/game/roles.rank.json`을 함께 참고해  
      최종 승자/점수 스냅샷을 만들고,
    - `finalize_rank_session_outcome` 또는 이를 래핑한 RPC를 호출해 랭크/레이팅 테이블을 갱신하는 경로를 마련한다.
- 매칭 모드/디버그 UX:
  - `realtime_match`(`standard/off`)와 난입 옵션을:
    - 매칭 큐 → `rankContext` → 훅 → UI까지 일관되게 전달하고,
    - 실시간/비실시간/난입 여부에 따라 StartClient UI와 텍스트 런타임 훅이 동일한 규칙을 따르도록 정리한다.
  - Play 디버그 패널(현재 턴 프롬프트, AI 호출 로그)와 StartClient의 로그/요약 뷰를  
    같은 정보 소스(coreRuntime · rankContext · Supabase 로그)에 맞춰 재정비한다.

### 11.9 GameShell 통합 UI (planned)

- 목표:
  - “플레이”와 “메인게임(StartClient)”가 **엔진뿐 아니라 UI 레벨에서도 가능한 한 동일한 구조**를 공유하도록 한다.
  - 특히 상단 타이틀, 좌우 카드, 로그 패널 같은 **게임 셸 UI**를:
    - 호스트 앱에 박힌 고정 레이아웃이 아니라,
    - 엔진/워크스페이스가 선언하는 기능을 소비하는 공용 컨테이너(`GameShell`)로 재구성하는 것이 목표다.
- 현재 상태:
  - 엔진/파일:
    - `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js` → `coreRuntime` 구성은 Play/StartClient 모두 공유한다.
    - 텍스트 런타임 게임의 메인 턴 진행/프롬프트/승패는 `coreRuntime + /game/hooks/automation.js`만 사용한다.
  - UI:
    - Play 오버레이:
      - `MainGameMobileUI`를 감싼 개발용 오버레이(에디터, AI 채팅, 디버그 바)가 존재한다.
    - StartClient:
      - 텍스트 런타임 게임의 플레이 컬럼은 `MainGameMobileUI`를 사용하지만,
      - 상단 타이틀/좌우 카드/로그 패널 등 랭크용 셸이 별도의 레이아웃으로 둘러싸고 있는 상태다.
- GameShell 설계(초안):
  - 컴포넌트:
    - `components/game/GameShell.jsx` (가칭):
      - 내부에 `MainGameMobileUI`를 포함하고,
      - 외곽에 다음 영역을 가진다:
        - `header` – 게임 제목/상태/모드 요약.
        - `leftPanels` / `rightPanels` – 참가자/점수/로그/디버그 패널 슬롯.
        - `footer` – 턴 진행/메시지 입력 등 “공통 컨트롤 바”.
      - 각 영역에 어떤 패널을 띄울지는 **props + 워크스페이스 설정**으로 제어한다.
  - 설정 파일 (워크스페이스에서 제어 가능한 부분):
    - 권장 경로: `/game/ui.shell.json`
    - 예시 스키마(초안):
      ```json
      {
        "layoutPreset": "standard",
        "panels": {
          "header": { "enabled": true, "showTitle": true, "showMode": true },
          "rankSummary": { "enabled": true, "region": "left" },
          "participants": { "enabled": true, "region": "left" },
          "turnLog": { "enabled": true, "region": "right" },
          "debugPrompt": { "enabled": false, "region": "right" }
        }
      }
      ```
    - 이 파일은 “어떤 패널을 쓸 수 있는지”를 선언하지는 않고,
      - 호스트가 제공하는 패널 타입(`rankSummary`, `participants`, `turnLog`, `debugPrompt` 등) 중
      - 어떤 것을 어디에, 켜고/끄고 싶을지만 지정한다.
  - 호스트 책임(변경 불가한 최소 셸):
    - 세션 종료/떠나기 버튼, 치명적인 오류 표시, 보안/권한 관련 경고는 **항상 호스트에서만 제어**하며,
      워크스페이스/템플릿에서는 끄거나 대체할 수 없다.
    - 그 외의 UI(상단 타이틀, 좌우 카드, 로그 패널)는 GameShell의 패널 슬롯을 통해 제어 가능해야 한다.
- Play / StartClient 통합 사용 패턴:
  - 공통:
    - 두 환경 모두 `GameShell`을 사용하고, 내부 엔진으로 `coreRuntime + MainGameMobileUI`를 사용한다.
    - 워크스페이스에 `/game/ui.shell.json`이 있으면 이를 우선 사용하고, 없으면 디폴트 레이아웃을 쓴다.
  - Play 오버레이:
    - 기본적으로:
      - `panels.rank*`는 꺼 두고,
      - `panels.debug*`는 켜 두는 레이아웃을 사용한다.
    - 개발자가 `/game/ui.shell.json`에서 패널 구성을 바꾸면, Play에서도 즉시 반영된다.
  - StartClient:
    - 랭크 모드에서는:
      - `rankSummary`/`participants` 패널을 기본 on,
      - 디버그 패널은 off, 또는 별도 개발자 전용 플래그로만 on.
    - 워크스페이스에서 해당 패널을 끄면(예: 완전 미니멀 텍스트 게임을 만들고 싶을 때),
      - 랭크 셸의 카드/로그도 자연스럽게 사라지고,
      - Host가 보장해야 하는 최소 UI(나가기 버튼 등)만 남는다.

이 설계의 의도는:
- “게임 엔진 + 메인 게임 UI”뿐 아니라,
- 상단/좌우/로그 같은 셸까지 **기능 단위로 동기화/제거 가능**하게 해 두어서,
  - 워크스페이스에서 새로운 패널/레이아웃을 추가하면 Play/StartClient 양쪽이 같은 GameShell을 통해 소비하고,
  - 필요할 경우 셸 요소를 완전히 끄고 “게임 화면만” 남기는 것도 가능하게 만드는 것이다.

--- 

## 12. Extensions: planned GitHub sync and AI web helpers

This section outlines planned work around extensions that live on top of the workspace/runtime contracts.

### 12.1 GitHub sync panel (`github-sync`)

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

### 12.2 AI web helpers (`codex-web`, `copilot-web`)

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

### 11.3 UI sandbox agent extension (`ui-sandbox`)

- Built-in extension: `ui-sandbox`
  - Purpose:
    - Integrate a locally running UI sandbox agent (`ui-sandbox-agent/`) into the Maker editor.
    - Make it easy to open the agent’s dashboard from the editor, and to let AI code chat dispatch `ui_sandbox_step` actions.
  - Installation:
    - Exposed in the “확장 프로그램 설치” modal as `UI Sandbox Agent`.
    - Does not store heavy config; presence simply marks that the current workspace wants to use the sandbox.
  - Behaviour:
    - Toolbar “확장” 메뉴에서 `UI Sandbox Agent`를 선택하면:
      - The editor opens the agent dashboard in a new tab:
        - URL resolution order:
          - `ext.config.agentUrl` (if set in future),
          - `process.env.NEXT_PUBLIC_UI_SANDBOX_AGENT_URL`,
          - Fallback: `http://127.0.0.1:7010`.
      - This dashboard lets humans:
        - Create/select sessions.
        - Trigger `open/click/type/wait/snapshot` steps.
        - See logs, DOM summaries, and screenshots for debugging.
    - When `UI_SANDBOX_AGENT_URL` / `NEXT_PUBLIC_UI_SANDBOX_AGENT_URL` is configured and the agent is running, AI code chat can:
      - Call `ui_sandbox_step` actions to drive the same agent.
      - Receive `{ sessionId, state: { logs, domSummary, screenshotId? } }` and use that state for code+UI debugging.

These extensions live on top of the workspace/runtime/editor contracts, so they can evolve independently without changing the core model.

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

---

## 13. AI code chat dock (planned UX improvements)

The AI code chat dock (`AIChatDock`) is functional but still has several UX items that will be addressed in later iterations.

- Prompt and guidance
  - The dock now includes workspace-specific guidance in its system prompt:
    - Prefer reading `ai-roomchat/docs/WORKSPACE_EDITOR_RUNTIME.md`, `ai-roomchat/docs/capabilities/*.md`, and `ai-roomchat/docs/AI_GAME_PROMPTS.md` instead of scanning the entire repo.
    - Avoid re-reading the same file repeatedly; summarize into memory with `memory_*` actions when needed.
  - Future work:
    - Add a short, user-visible summary explaining this behaviour so users know why the AI sometimes reads docs first.

- Auto-run / trust behaviour
  - Auto-run is controlled solely by the "자동 실행 횟수" slider:
    - `trustLimit ≤ 1` → auto-run effectively off.
    - `trustLimit > 1` → auto-run on, up to `trustLimit` actions per chain.
  - The assistant message has been updated to refer to this as "자동 실행" rather than a separate "신뢰 모드".

- Log / TODO presentation (planned)
  - Current behaviour:
    - Each action is logged as a single-line row (`role: action`) to reduce visual noise.
    - System/user/assistant messages still use full chat bubbles.
  - Planned improvements:
    - Collapsible task groups:
      - Group related action logs under a single summary line (for example, "- 파일 수정 3건 완료").
      - Tapping the summary toggles expansion to show full details.
    - TODO folding:
      - Allow the TODO list to be folded/unfolded more aggressively so long task lists do not dominate the dock.

- Drag vs scroll interaction (known issue)
  - The dock is draggable via its header, with `data-stop-drag="true"` on interactive sub-areas to prevent accidental moves.
  - Known issue:
    - On touch devices, vertical scrolling inside the chat/TODO area can sometimes conflict with the drag handler, causing the panel to "snap back" or jitter.
  - Planned fix:
    - Restrict drag start to a smaller, explicit handle in the header.
    - Ensure scrollable regions inside the dock never initiate drag, even on small pointer movements.

These items are tracked here as planned work so that AI/extension behaviour stays aligned with the workspace/editor contracts as the dock evolves.

---

## 14. Host app vs user workspace (planned architecture split)

Longer term, the goal is to clearly separate:

- **Host app / engine code**
  - The `ai-roomchat/` source tree (editor, runtime, extensions, API routes, etc.).
  - Deployed as a normal app; users do not edit this directly via AI actions.
- **User workspace / sets**
  - Workspace VFS (Supabase-backed `workspace_sets`, per‑set files such as `/template.json`, `/graph/prompt-graph.json`, `/game/**/*.json`, `/world/**/*.json`).
  - AI actions (`read_file`, `write_file`, etc.) should primarily operate here.

Current state (this repo copy):

- AI action runner:
  - Uses `lib/rank/actions.js` with a `BASE_ROOT` that defaults to the `ai-roomchat/` subdirectory when `WORKSPACE_ROOT` is not set.
  - This is acceptable for development (engine + workspace in a single repo), but not ideal for a multi‑tenant production environment.
- Workspace/editor/runtime:
  - All live under `ai-roomchat/` and are designed to be host‑side code; they are not intended to be directly modified by end users in production.

Planned changes and current status:

- Default sandbox tightening (in progress):
  - In this repo copy, `lib/rank/actions.js` now:
    - Sets `BASE_ROOT` to the `ai-roomchat/` subdirectory by default (unless `WORKSPACE_ROOT` is set).
    - Restricts write actions (`write_file`, `delete_file`, `delete_dir`, `move_file`, `copy_file`, `mkdirs`, `edit_patch`) to the `workspace/**` subtree under `BASE_ROOT`.
    - Restricts read actions (`read_file`, `read_file_range`, `list_files`, `stat_file`, `search_text`) to:
      - `workspace/**`
      - Docs allowlist under `BASE_ROOT`:
        - `docs/WORKSPACE_EDITOR_RUNTIME.md`
        - `docs/AI_GAME_PROMPTS.md`
        - `docs/capabilities/**`
    - Path normalisation:
      - User-facing paths like `/game/runtime.config.json` or `/world/tilemap.json` are internally mapped to `workspace/game/runtime.config.json`, `workspace/world/tilemap.json` so that AI actions only touch the workspace subtree, not the host app source tree.
    - CLI-style sandbox commands:
      - `sandbox_exec` is disabled unless `SANDBOX_EXEC_ENABLE` is set.
      - When enabled, commands are:
        - Allowed only if they match `workspace/config/ai-actions-allowlist.json`.
        - Executed with a working directory under the workspace subtree when possible (falling back to `BASE_ROOT` only as a dev-time escape hatch).
  - For production, `WORKSPACE_ROOT` should point to a per‑user/per‑workspace VFS root (for example, a mounted workspace directory or a separate storage layer), not the app source tree; the same path rules apply relative to that root.
- Keep engine/host code out of AI write scope (goal):
  - Host app source under `ai-roomchat/` should remain read‑only for end users; AI actions should edit only workspace storage.
  - Reserve host‑app edits for traditional Git workflows and trusted maintainers.

Impact:

- Most of the work done so far (editor, workspace provider, runtime core, capability contracts, extensions, AI dock) remains valid and reusable.
- The architecture split mainly affects:
  - Where AI actions are allowed to read/write.
  - How the host app and user workspace storage are wired in deployment.
- Estimated refactor scope is limited to the sandbox/action runner + boundary wiring, not a rewrite of the editor/runtime itself.

---

## 15. External UI test sandbox (planned)

Status: planned (separate tool, this repo integrates as a client)

The host app itself does not try to drive a real browser for UI testing. Instead, a future “UI sandbox agent” will run as a separate program/extension that both humans and the AI can use.

- Goal:
  - Allow scripted UI tests (click, type, navigate) to run in a real browser with:
    - Per-step console logs.
    - Optional screenshots.
    - A compact DOM/ARIA/text summary.
  - Keep heavy browser control and local machine permissions outside the main web app.
- Shape:
  - Separate project/repo (for example, `ui-sandbox-agent/`) that:
    - Uses Playwright/Puppeteer or the Chrome DevTools Protocol to control a browser.
    - Exposes a narrow JSON API over HTTP/WebSocket, for example:
      - `POST /session` → `{ sessionId }`
      - `POST /session/:id/step` with `{ action: 'click' | 'type' | 'navigate' | 'drag' | 'wait', ... }`
      - `GET /session/:id/state` → latest `{ logs, domSummary, screenshotId? }`
    - Returns structured results:
      - `{ ok, state: { logs, domSummary, screenshotId? } }` per step.
      - `logs`: recent console/network log lines.
      - `domSummary`: compact description of visible text, key buttons/inputs, and error banners.
      - `screenshotId`: handle that maps to a locally stored image (for humans to open).
    - Stores screenshots and traces locally per session so both humans and the AI can inspect them.
  - ai-roomchat integrates this as a “remote tool”, not as part of the runtime:
    - Capability/extension id (planned): `ui.test-sandbox`.
    - The editor/AI dock can call into the agent when this extension is installed and configured.
    - AI code chat would treat UI steps as just another action family (“ui_click”, “ui_type”, “ui_drag”, “ui_wait”) that proxies to the agent.
- Security and separation:
  - The agent runs on the user’s machine (or a dedicated runner), with its own install/update lifecycle.
  - Host app (`ai-roomchat/`) only sees:
    - Structured action requests/responses.
    - No direct access to local browser/devtools permissions.
  - Production deployments can choose to:
    - Enable UI sandbox integration only for trusted environments.
    - Treat it exactly like other external helpers (`github-sync`, `codex-web`), not as a mandatory dependency.
- Environment / portability:
  - The agent’s base URL and API token (if any) are provided via environment/config, so any compatible agent implementation can be plugged in.
  - Other apps (not just ai-roomchat) can reuse the same agent by speaking the same JSON protocol.

This keeps the Maker workspace/editor/runtime focused on workspace files and game runtime, while still giving us a path to “AI-driven UI testing” via a dedicated, opt‑in external tool.

### 15.2 Local run (dev) — example setup

For local development in this repo, the `ui-sandbox-agent/` folder contains a minimal Playwright-based agent that matches the API described above.

- Manual start (recommended, current tested path):
  ```bash
  cd c:\Users\yujin\Documents\234423\starbase\ui-sandbox-agent
  npm install
  npx playwright install chromium
  set UI_SANDBOX_AGENT_PORT=7010
  node server.mjs
  ```
  - Once running, the agent listens on `http://127.0.0.1:7010` and exposes:
    - `POST /session` → `{ ok, sessionId }`
    - `POST /session/:id/step` → `{ ok, state }`
    - `GET /session/:id/state` → `{ ok, state }`
    - `GET /screenshots/:id` → PNG screenshot.
    - `GET /` → small HTML dashboard for manual inspection (sessions, logs, DOM summary, screenshot).
- ai-roomchat integration:
  - Set `UI_SANDBOX_AGENT_URL=http://127.0.0.1:7010` in the ai-roomchat environment.
  - The `ui_sandbox_step` action in `lib/rank/actions.js` / `ai-roomchat/lib/rank/actions.js` will:
    - Create a session if needed (`POST /session`),
    - Forward `{ action, params }` to `/session/:id/step`,
    - Return `{ ok, result: { sessionId, state } }` to AI code chat.
  - This is intended for **local/dev** use only; cloud deployments (for example, Vercel) cannot reach a user’s `localhost`, so `UI_SANDBOX_AGENT_URL` / `NEXT_PUBLIC_UI_SANDBOX_AGENT_URL` should generally be left unset there.

### 15.3 Hub install and environment detection (planned)

Longer term, the UI sandbox agent is one instance of a broader “Starbase Hub” concept: a native helper that runs on the user’s device and exposes capabilities (UI testing, local Git, etc.) to web/PWA apps.

- Environments:
  - Desktop (Windows/macOS/Linux):
    - Preferred: a native “Starbase Hub” app that:
      - Starts on login (background).
      - Hosts the same HTTP/WS API as `ui-sandbox-agent` (including `/health`).
      - May include a small tray UI for status and logs.
  - Android:
    - Planned: an Android app exposing the same API on `localhost` (where permitted).
  - iOS:
    - Due to platform restrictions, most hub features will not be available directly.
    - iOS clients may instead connect to a remote hub (desktop/VM) in future designs.
- PWA / web behaviour (conceptual):
  - When a user attempts to enable a hub-dependent feature (such as `ui-sandbox`):
    - Detect platform via `navigator.userAgent` / `navigator.userAgentData`:
      - Desktop → show “Install Desktop Hub” CTA (link to installer) if `/health` fails.
      - Android → link to the Android Hub app (Play Store / APK) if `/health` fails.
      - iOS → show a clear “This feature is not available on iOS yet” message.
    - On success:
      - The app stores the hub endpoint (for example, `UI_SANDBOX_AGENT_URL` / `NEXT_PUBLIC_UI_SANDBOX_AGENT_URL`) and treats hub-backed actions (like `ui_sandbox_step`) as available.
- Integration contract:
  - ai-roomchat and other apps are only aware of:
    - A base URL for the hub.
    - A small set of JSON actions (`ui_sandbox_step`, future `git_local_step`, etc.).
  - The hub is responsible for:
    - Managing browser instances and local resources.
    - Returning structured, text-friendly summaries (logs, DOM, statuses) so the AI can debug and act without direct access to device APIs.

This lets the Maker/PWA side remain purely web-based while still opting into richer, device-level features when a hub is installed and reachable.

### 15.1 AI-centric debugging workflow (how the agent is used)

From the AI’s point of view, the UI sandbox agent should feel like a simple “remote REPL” for the browser:

- Minimal actions:
  - `ui_sandbox_step` (exposed as an action in AI code chat) with payload:
    - `sessionId?: string` – omitted on first call, the agent creates one.
    - `action: "open" | "click" | "type" | "drag" | "wait" | "snapshot"`.
    - `params: { ... }` – for example:
      - `open`: `{ url }`
      - `click`: `{ selector }`
      - `type`: `{ selector, text, pressEnter?: boolean }`
      - `drag`: `{ fromSelector, toSelector }`
      - `wait`: `{ ms?: number, selector?: string }`
      - `snapshot`: `{}` (no-op step that just returns current state).
  - Each step returns:
    - `{ ok, sessionId, state: { logs, domSummary, screenshotId? } }`.
    - AI code chat keeps `sessionId` in its own memory and includes it in subsequent steps.
    - Screenshots are not sent directly in-text; the host/orchestrator can:
      - Map `screenshotId` → a local file or URL, and
      - Attach one or more images from that set to the next model call as image inputs, so the AI can literally “see” the UI reaction without the human manually uploading files every turn.
- Typical debugging loop:
  - 1) `ui_sandbox_step { action: "open", params: { url: "https://.../dev" } }`
  - 2) Inspect `domSummary` / `logs` in the next model turn, decide what to click.
  - 3) `ui_sandbox_step { sessionId, action: "click", params: { selector: "button.play" } }`
  - 4) Repeat with `type`, `drag`, `wait`, occasionally `snapshot` to get a fresh screenshot/log bundle.
  - 5) When done, the agent may optionally support `action: "close"` to free resources.
- Presentation in the host app:
  - AI gets the full JSON state on every step, but the user UI can show:
    - A short text summary (“UI step #3: click button.play, 2 console errors, 1 warning”).
    - A link/thumbnail for `screenshotId` that humans can click to open the full image.
  - This makes the tool usable both as:
    - A low-friction debugging helper for developers, and
    - A durable test surface for the AI code chat without exposing raw browser control to the web app.

Dom summary shape (current agent implementation):

- `state.domSummary` is an object:
  - `elements: ElementSummary[]`
  - `errors: ElementSummary[]` (subset of `elements` with `kind: "error"`)
- `ElementSummary`:
  - `kind`: `"element" | "error" | "dialog"` – basic classification (normal element, error banner, dialog/modal).
  - `tag`: lowercased tag name (`button`, `a`, `input`, etc.).
  - `role`: ARIA role when present.
  - `region`: high-level layout region inferred from ancestors (`header`, `main`, `footer`, `nav`, `aside`, or `null`).
  - `text`: visible text content (whitespace collapsed).
  - `name`: best-effort accessible name (`aria-label`, `alt`, `title`, `placeholder`, ...).
  - `attrs`: selected attributes:
    - `href` (for links),
    - `type`, `value` (for inputs/buttons),
    - `testId` (from `data-testid` / `data-test-id` when present).
  - `state`:
    - `disabled`, `hidden`, `checked`, `selected`, `focused`, `invalid` (boolean flags).

This makes `domSummary` closer to a compact, text-friendly “Elements panel” snapshot: the AI sees which interactive elements and error banners are visible, how they are labelled, and what state they are in, without needing the raw screenshot pixels.

#### 15.1.1 Real environment vs dedicated sandbox

- The UI sandbox agent is intended to drive a **real browser** (for example, Chrome) against:
  - A staging or preview deployment of the app (recommended), or
  - A local dev server, depending on configuration.
- The agent itself is an **external program** the user installs:
  - It knows how to launch/attach to a browser and open the target URL.
  - It keeps its own profile/data directory so tests do not interfere with the user’s normal browsing.
- The host app (`ai-roomchat/`) only needs:
  - The agent base URL (for example, `UI_SANDBOX_AGENT_URL`) and optional token.
  - A small mapping layer between `ui_sandbox_step` actions and the agent’s HTTP/WebSocket API.

With this split, the AI can:
- Issue multiple `ui_sandbox_step` calls in a single reasoning turn.
- Receive logs + DOM summary + one or more screenshots as context.
- Use that context to decide the next steps, without the human manually pasting images every time.


Developer comment — The command will only work if you put it inside $ cmd /c '' or $ cmd /c "". You seem to forget this often, so keep it in mind. When the time comes to use Supabase SQL, try doing it yourself as well. If you need the required keys, ask the developer.
