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

In this repo copy, most adapters are **thin wrappers around reference_data engines/libraries**:

- `core.*`
  - `core.graph` / `core.runtimeConfig` / `core.hooks`
    - Runtime core: `ai-roomchat/lib/runtime/coreRuntime.js`
    - Hook loader + timeout guard: `ai-roomchat/lib/runtime/safeEvalHookModule.js`
    - Prompt graph helpers: `ai-roomchat/lib/runtime/promptRunner.js`
    - References:
      - `reference_data/javascript-state-machine-master*/` – state machine patterns
      - `reference_data/jssm-master/`, `reference_data/stateless.js-master/`
- `ui.text`
  - Adapter surface: `ui.text.overlay` (MainGameMobileUI)
    - Implementation: `ai-roomchat/components/game/MainGameMobileUI.jsx`
    - Feeds on `system:message` events from the core runtime via `runtimeBus`.
    - References:
      - `reference_data/chat-master/` – text/chat UI patterns
      - `docs/STATE_AND_TURNS.md` – text turn flow
- `ui.canvas2d`
  - Adapter module: `ai-roomchat/lib/runtime/adapters/rendererCanvas2D.js`
    - `attachCanvas2D(canvas, options)` → `{ draw(state), resize(w,h), dispose() }`
    - Intended to be the shared 2D “surface” for capabilities like `world.grid.tilemap`.
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
      - `netSocketIO` → `ai-roomchat/lib/runtime/adapters/netSocketIO.js` (references `reference_data/socket.io-main/`)
      - `netColyseus` → `ai-roomchat/lib/runtime/adapters/netColyseus.js` (references `reference_data/colyseus-master/`)
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

In this copy, a minimal core runtime (`ai-roomchat/lib/runtime/coreRuntime.js`) is wired into
`PlayOverlayContent` for the builtin engine:

- Reads `/graph/prompt-graph.json` + `runtime.config` + `/game/hooks/automation.js` and steps through nodes
  using `createCoreRuntime({ graph, config, hooks, files })`.
- For each active node:
  - Builds a `HookContext` with shared `variables` and calls `hooks.transformPrompt(ctx)` when 정의되어 있으면,
    반환값의 `prompt` 문자열을 사용하고, 없으면 노드의 `label / id`를 사용합니다.
  - 그 텍스트를 `system:message` 이벤트로 `runtimeBus`에 발행하고, `MainGameMobileUI`가
    “AI 게임 채팅” 패널에 표시합니다.
  - `turn:next` → `reason: 'auto'` 전진.
  - `player:chat` → `reason: 'user_action'`, `input`으로 플레이어 입력 텍스트를 넘기고
    `onUserAction / selectNext` 훅을 이용해 전진.

Optional adapters (networking / CRDT sync) are selected **capability 기반**으로 초기화된다:

- `network.realtime` + `/game/network.config.json`:
  - `PlayOverlayContent`에서:
    - 현재 워크스페이스 id (`storageNamespace` 또는 router `[id]`)로 `loadCapabilitiesMeta(id)`를 호출해
      `meta.capabilities`를 가져온다.
    - 선택된 capabilities에 `network.realtime`가 포함되어 있고,
      `/game/network.config.json`이 존재하면:
      - `engine/id` 필드를 `"socketio"` 또는 `"colyseus"`로 해석해 `networking` 설정을 만든다.
      - `import('../../lib/runtime/adapterManager.js').initAdapters({ networking }, onEvent)`를 호출해
        네트워킹 어댑터를 초기화한다.
      - 네트워크에서 수신된 이벤트는 `onEvent(evt)` 콜백을 통해
        `runtimeBus.emit('net:event', evt)` 형태로 Play overlay에 전달된다.
- `crdt.yjs`:
  - `meta.capabilities`에 `crdt.yjs`가 포함되어 있으면:
    - `initAdapters({ sync: { id: 'yjs' } }, onEvent)`를 호출해 Y.Doc을 생성(`syncYjs.createYDoc`).
    - 반환된 `adapters.sync.doc`은 향후 world/ui/runtime에서 shared state로 사용할 수 있는 위치에 노출된다
      (1단계에서는 도큐먼트가 생성/수명관리만 되고, 구체적인 필드/업데이트 경로는 이후 단계에서 추가).

이렇게 해서 Play overlay는:

- `meta.capabilities` + 워크스페이스 파일(`/game/network.config.json`, `/state/shared.yjs.json` 등)을 기반으로
  어떤 runtime adapters를 활성화할지 결정하고,
- core runtime(`core.*`)과 UI(`ui.text`, `ui.canvas2d` 등) 위에  
  network/sync 계층을 단계적으로 얹어갈 수 있는 구조를 갖는다.

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

---

## 7. Current implementation status (this repo copy)

This repo copy has the following pieces already wired:

- Workspace / editor
  - VSCode‑style `files` + `drafts` + `filesForSave` model is implemented via `documentStore` and `CodeWorkspaceProvider`.
  - Monaco wrapper (`EditorMonaco`) is configured not to remount or reset on each keypress; it only applies external `value` when real external changes occur.
  - Maker editor keeps the code overlay mounted and uses display toggles instead of re‑creating the editor subtree.
- Runtime / Play overlay
  - Builtin core runtime (`core.graph` + `core.runtimeConfig` + `core.hooks`) is connected to `PlayOverlayContent` and `MainGameMobileUI`:
    - Reads `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`.
    - Uses `transformPrompt(ctx)` (if provided) to compute text, publishes it as `system:message` to the runtime bus.
    - `turn:next` / `player:chat` events drive `step({ reason:'auto'|'user_action', input })`.
  - Optional adapters are selected based on `meta.capabilities`:
    - `network.realtime` + `/game/network.config.json` → `adapterManager.initAdapters({ networking }, onEvent)` initializes `net` (Socket.IO / Colyseus skeleton).
    - `crdt.yjs` → `initAdapters({ sync: { id: 'yjs' } }, onEvent)` attaches a shared `Y.Doc` via the sync adapter.
- Capabilities / docs
  - All core capabilities (`core.graph`, `core.runtimeConfig`, `core.hooks`, `ui.text`, `ui.canvas2d`, `world.grid.tilemap`, `network.realtime`, `crdt.yjs`, `persistence.supabase`) have:
    - A static contract in `lib/runtime/capabilityContracts.js`.
    - A detailed spec under `docs/capabilities/*.md` with workspace files, hooks, adapter names, and `reference_data/**` mappings.
  - `AI_GAME_PROMPTS.md` includes guidance for AI assistants to treat these as installable “features” (via `meta.capabilities`), not arbitrary file edits.

This means the structural contract (store → provider → editor → runtime → adapters) is in place, and new features can be added by defining a capability + adapter + example set rather than changing the foundations.

---

## 8. Git main push flow (이 환경 기준)

이 Codex 작업환경에서 워크스페이스/런타임 관련 변경을 `main`에 반영할 때 쓴 기본 플로우를 정리해 둡니다.

1. **현재 작업 브랜치 상태 확인**
   - `git status -sb`
   - `git branch -vv`
   - `git remote -v`
   - `git branch -r`

2. **작업 브랜치에서 변경사항 커밋**  
   예: `chore/airoomchat-owner-compat` 에서
   - `git status`
   - `git add .`
   - `git commit -m "docs(workspace): update editor runtime notes"`  
     (메시지는 실제 변경 요약에 맞게 작성)
   - (필요 시) `git push origin chore/airoomchat-owner-compat`

3. **메인 브랜치 최신 상태로 맞추기**
   - `git switch main`
   - `git pull --rebase origin main`

4. **작업 브랜치를 main에 머지**
   - `git merge chore/airoomchat-owner-compat`

5. **로컬 main을 원격 main으로 푸시**
   - `git push origin main`

중간에 Git이 `.git/index.lock` 관련 에러를 내는 경우:

- 다른 터미널/IDE에서 Git 명령이 실행 중인지 먼저 확인하고 종료합니다.
- 여전히 문제가 지속되면, **이 리포를 사용하는 프로세스가 모두 종료된 상태**에서
  - `.git/index.lock` 파일을 삭제한 뒤,
  - 위 3~5단계를 다시 실행합니다.

---

## 9. Debugging remount / cursor jump / rollback

에디터 입력이 사라지거나, 저장 후 초기 상태로 롤백되는 문제를 추적하기 위해
워크스페이스/에디터에 디버그 로깅을 심어두었습니다.

### 8.1 디버그 모드 켜는 방법

클라이언트에서 다음 조건 중 하나라도 만족하면 디버그 모드가 켜집니다.

- 빌드 타임 환경 변수: `NEXT_PUBLIC_WORKSPACE_DEBUG=1`
- 런타임 플래그: `window.__WORKSPACE_DEBUG__ === true`
- URL 쿼리: `?wsdebug=1` 이 포함된 URL
- `localStorage['workspace:debug']` 가 `'1'` 또는 `'true'`

실제 사용 예 (브라우저 콘솔에서 한 번 실행):

```js
// 1) 현재 탭에서 디버그 모드 활성화 + 이후에도 유지
window.__WORKSPACE_DEBUG__ = true;
localStorage.setItem('workspace:debug', '1');
location.reload();
```

이후 같은 브라우저/도메인에서 워크스페이스를 열면 디버그 로그가 자동으로 찍힙니다.

### 8.2 어떤 로그가 찍히는지

디버그 모드가 켜져 있을 때, 주요 컴포넌트에서 다음 로그가 나옵니다.

- 워크스페이스 스토어 (Maker / main 둘 다)
  - `[Workspace] mount` / `[Workspace] unmount`
  - `[Workspace(flat)] mount` / `[Workspace(flat)] unmount`
  - 각 로그에는 `ns`(storageNamespace)와 현재 파일 개수(`filesCount`)가 함께 찍힘.

- 에디터 프레임
  - `[EditorPane] mount` / `[EditorPane] unmount`
  - 어느 파일(`path`)을 편집 중이었는지 같이 찍힘.

- Monaco 래퍼 (Maker 측)
  - `[EditorMonaco] mount` / `[EditorMonaco] unmount`
  - `[EditorMonaco] external setValue`  
    - 파일 전환 등으로 `editor.setValue(...)`가 호출될 때,
      이전/현재 path, 텍스트 길이(before/after)를 함께 로깅.

- Monaco 래퍼 (main / flattened copy)
  - `[EditorMonaco(flat)] mount` / `[EditorMonaco(flat)] unmount`
  - `[EditorMonaco(flat)] external apply`  
    - 외부 `value` 변경을 `executeEdits`로 적용할 때,
      path와 텍스트 길이(before/after)를 로깅.

- 통합 저장
  - `[unifiedSave] workspace save`  
    - 어떤 `setId`로 몇 개의 파일을 서버 측 `saveSet`에 넘겼는지 로깅.

### 8.3 재현 시 무엇을 봐야 하는지

1. **브라우저 콘솔을 켠 상태에서 워크스페이스 페이지를 새로고침.**
   - 페이지 최초 로드 시:
     - `[Workspace] mount` 또는 `[Workspace(flat)] mount` 가 1회 찍히는지 확인.
     - `EditorPane` / `EditorMonaco` 계열도 각각 1회씩만 mount 되는 것이 정상.

2. **문제 없는 일반 타이핑 시나리오를 한 번 확인.**
   - 같은 파일에서 몇 글자 타이핑해도:
     - `mount/unmount` 로그가 반복해서 나오지 않아야 함.
     - `external setValue` / `external apply` 로그는
       **파일을 바꿀 때나, 진짜 외부 값이 내려올 때만** 가끔 나타나는 것이 정상.

3. **커서가 1행 1열로 튀거나, 저장 후 초기 상태로 롤백되는 순간을 재현.**
   - 그 바로 직전에/이후에 콘솔에서 다음을 확인:
     - `EditorPane` 또는 `EditorMonaco(flat)`의 `unmount → mount` 페어가
       짧은 시간 안에 연속해서 찍혔는지?
       - 찍혔다면, 해당 순간에 **컴포넌트 리마운트**가 실제로 일어난 것.
     - `external apply` / `external setValue` 로그가
       **타이핑/저장 직후에 갑자기 많아졌는지?**
       - 많다면, 외부 `value`가 (초기 스냅샷 등으로) 다시 내려와
         현재 모델을 덮어쓰고 있다는 의미.

4. **버그 직후 워크스페이스 내부 상태 확인.**
   - 콘솔에서:
     - `window.__WORKSPACE_INSPECTOR__` 가 있는지 확인.
       - 없다면 디버그 모드가 제대로 켜졌는지 다시 확인.
   - 예시:
   ```js
   const ws = window.__WORKSPACE_INSPECTOR__;
   ws.api.activePath;         // 현재 편집 중이었던 path
   ws.api.files[ws.api.activePath];   // 스냅샷(content, readonly, ...)
   ws.api.drafts[ws.api.activePath];  // 드래프트(있다면)
   ```
   - 이 때,
     - `drafts[path]`는 최신 타이핑 내용인지,
     - `files[path].content`는 초기 상태인지 / 최신인지 비교해 보면
       “어디에서 롤백이 일어났는지” (드래프트 단계 vs 서버 리로드 단계)를 좁힐 수 있다.

5. **저장 버튼을 눌렀을 때의 흐름 확인.**
   - 저장 시 콘솔에서:
     - `[unifiedSave] workspace save` 로그가 찍히는지,
     - 그 직전/직후에 `Workspace`/`EditorPane`의 `unmount/mount`가 일어나는지,
     - `EditorMonaco(flat)` 쪽의 `external apply`가 “초기 스냅샷 길이”로 되돌리는 패턴인지
       (beforeLength/afterLength를 보고 판단) 확인해 달라.

이 로그들을 기반으로,
- **“언제 리마운트가 발생하는지”** (auth 토큰 갱신, 오버레이 토글, 저장 후 재로드 등),
- **“어느 계층에서 값이 옛날 것으로 되돌아가는지”** (drafts vs files vs 서버 응답)
를 단계별로 좁혀갈 수 있다.  
재현 로그/관찰 결과를 그대로 전달해주면, 그 다음 턴에서 해당 지점을 직접 수정해 나갈 수 있다.
