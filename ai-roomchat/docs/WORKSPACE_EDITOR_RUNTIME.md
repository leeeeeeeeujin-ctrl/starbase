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

### Quick dev log (2025-12-05)

- Pushed `assistant-adjust-character-panels-layout` to `main` (origin). Touched `ai-roomchat/components/character/CharacterBasicView.js` to stop carousel/game cards from clipping and make overlay slides stretch to container width on narrow/rotated layouts.
- Pushed `assistant-fix-info-slider-width` to `main` (origin). `ai-roomchat/components/character/CharacterBasicView.js`�� info slider Ʈ���� flex ��� 2����(�� 50%%)�� ������ ����/ĳ���� �г��� ���ݸ� ���̴� ������ �ؼ�.
- Pushed `assistant-remove-game-count-badge` to `main` (origin). `ai-roomchat/components/character/CharacterPlayPanel.js`���� �������� ���ӡ� ��� �� ���� ���� ������ ����(���� �����̶� ���ʿ�).
Current high-level status (this repo copy)

- Security / sandbox (AI actions): **in progress**
  - Host app vs workspace 경계 확립, 파일 액션 범위 축소, sandbox_exec 허용 리스트 적용.
- Runtime features (`core.text-runtime`, `world.grid-basic`): **in progress**
  - Text runtime는 실사용 가능 수준, grid-basic은 프리뷰 + 간단 엔진까지 연결.
- AI code chat dock (UX / actions): **in progress**
  - JSON 액션 파싱/게이팅, 자동 실행 슬라이더, 로그 표현 개선 일부 반영.
- Hub/플러그인 기반 확장: **planned**
  - Hub(로컬/외부 에이전트)를 통해 UI 테스트, 로컬 Git, Supabase 연동 등 확장을 외부 플러그인으로 제공하고 ai-roomchat은 JSON API로만 연결하는 방향.
 - Standard data slots (`variables.stats / scene / effects / speaker`): **in progress**
   - 장르에 무관한 공통 슬롯 계약을 `docs/standard-data-slots.md` 에 정의하고, 텍스트 배틀 예제를 통해 사용하는 중.
- Supabase persistence + SQL helpers: **planned**
  - Capability/확장 스펙만 정의되어 있고, 실제 어댑터/패널 구현은 이후 단계.

### Open tasks (dev notes)

- PlayOverlayContent 구조 분리 진행 중: 어댑터 초기화는 헬퍼로 분리했으나 디버그 UI/입력 처리도 별도 훅/컴포넌트로 쪼개기.
- 선택된 capability 대비 필요한 파일 안내: Play/Capabilities 패널에서 누락 파일 경고+생성 안내 표시. Capabilities 선택 화면에도 빠른 파일 추가 액션을 더 보강.

### Next goals (platform fit)

- 사용자 흐름 강화: Capabilities 선택 → 필수 파일 자동 생성/가이드 → 런타임/Play에서 즉시 피드백까지 한 화면에서 연결되는 UX 추가.
- 모듈화 보강: PlayOverlayContent의 입력 처리/디버그/런타임 실행을 훅/컴포넌트로 더 분리해 유지보수·테스트 용이성 확보.
- 검증/가이드: `computeRuntimeFeatureIssues` 등 핵심 헬퍼의 경량 테스트 추가, 누락 파일 경고가 지속적으로 동작하는지 자동 확인.
- GameShell 위젯/스타일 토큰: 현재 설계된 토큰을 위젯별로 더 일관되게 적용할 수 있게 모듈화(커스터마이즈성↑).

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

### 5.1 Play vs. 프롬프트‑노드 “테스트” (단일 실행 경로)

- Maker에는 예전부터 프롬프트‑노드 에디터 안에 별도의 “테스트” 뷰가 있었다.
- 하지만 코드 에디터와 프롬프트‑노드 에디터가 **같은 텍스트 런타임/파일 세트를 공유**하는 구조이므로,
  실행/테스트용 UI도 하나만 두는 쪽이 디버깅·유지보수에 유리하다.
- 앞으로는:
  - 프롬프트‑노드 에디터 안의 레거시 “테스트”는 제거/폐기하고,
  - **Play 오버레이(이 섹션의 엔진)** 를 프롬프트‑노드 에디터 상단에서도 그대로 호출하는 식으로 대체한다.
- 즉, “테스트”라는 별도 엔진은 두지 않고,  
  코드 에디터/프롬프트‑노드 에디터 모두 **동일한 Play 엔진 + GameShell UI** 를 공유하는 것을 원칙으로 한다.

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

> 현실적인 범위 메모  
> 이 문서에서 말하는 "거의 모든 게임"은 **텍스트/프롬프트/턴 기반 + 캐릭터/매칭/랭크 중심의 AI 게임/도구**를 주 대상으로 한다.  
> Godot/Unity 수준의 범용 2D/3D 렌더링·물리·애니메이션·오디오·멀티플랫폼 빌드까지 포괄하는 일반 게임엔진을 목표로 하지는 않으며,  
> 그런 영역이 필요할 때는 별도 엔진(Phaser/PIXIS/three 등)과의 연동을 전제로 한다.

### Debug snapshot (update when things change)

- 플랫폼 목적 요약:
  - 제작자: 워크스페이스/AI 코드 채팅으로 게임을 만들고, 공용 엔진(GameShell+coreRuntime)으로 실행/배포.
  - 플레이어: 자신 캐릭터를 들고 매칭/랭크/정산 구조에서 플레이.
  - 확장/보안: 워크스페이스 VFS 경계 + Hub 플러그인으로 UI 테스트/로컬 Git/Supabase 등 확장을 외부에서 제공, ai-roomchat은 JSON API로만 연결.
- 핵심 디렉터리:
  - `components/workspace/` — CodeEditorOverlayV2(PlayOverlay 포함), Capabilities 패널/모달, WorkspaceFrame.
  - `lib/runtime/` — `coreRuntime`, `runtimeFeatures`, adapters(`adapterManager`, `safeEvalHookModule`, `worldGridEngine` 등).
  - `components/game/` — `GameSessionShell`, `GameShell`, `MainGameMobileUI`, renderers, PlayScaffold/MainGameParity.
  - `lib/game/` — AI orchestrator/template, character context, reference 데이터 맵.
  - `lib/rank/**`, `pages/api/rank/**` — 매칭/랭크/점수(정산은 미구현 추정).
- 주요 파일/변수 흐름:
  - 워크스페이스 파일: `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`, `/game/hooks/automation.js`, `/game/ui.shell.json`, `/characters/*.json`, 선택적 `/game/network.config.json`, `/debug/play.json`.
  - 런타임 컨텍스트: `coreRuntime` → `ctx = { turn, variables, node, files, world }`, 표준 슬롯(`variables.stats.turn` 등) 자동 업데이트.
  - 런타임 기능 선택: `meta.capabilities` + 파일 존재 여부 → `runtimeFeatures` / `flags` (`wantsRealtimeNetwork`, `wantsSharedCrdt`).
  - 네트워크/CRDT: `adapterManager.initAdapters` 로딩 (`network.realtime` + `/game/network.config.json`, `crdt.yjs`).
  - 캐릭터: `GameSessionShell`이 `character` 상태를 주입/autoLoad, `UnifiedGameSystem`/렌더러가 `characterData`를 UI/템플릿 변수로 등록.
  - 디버그 상태: PlayOverlay `debugState = { lastPrompt, turnEvents, calls, simUsers }` (localStorage `playDebug.simUsers@{ns}`).
- TODO(갱신 시 반영): 매칭/정산 구현 상태, Hub/플러그인 연결 여부, 테스트/관측 구성 여부를 여기에 짧게 기록해 둘 것.

### If we aim for “general engine/platform” competitiveness

- Rendering/physics/audio/animation: 2D/3D 엔진(Phaser/Pixi/three 등 일급 연동 또는 내장) + 물리/오디오/애니메이션 파이프라인 확보.
- Creator tooling: 씬/노드/타임라인 편집기, 에셋 임포트·파이프라인, 디버거/프로파일러, 플러그인/에셋 마켓 등 에코시스템 강화.
- Sandbox/Hub: 워크스페이스 VFS 경계 실제 적용, Hub 플러그인 권한/배포/업데이트, 로컬/원격 에이전트 안전 연결.
- Matching/economy/scoring: 점수·랭크·정산 데이터모델/DB/API/UI 완결, 멀티플레이/세션/재접속/복구까지 포함.
- Quality/ops: 자동 테스트(런타임·매칭·헬퍼), 부하·성능 검증, 로깅·모니터링·알림, CI/CD·릴리즈/롤백, 멀티테넌시+버전/영속 관리.
- Docs/SDK: 안정된 API/SDK, 예제/템플릿, 확장·플러그인 가이드로 개발자 경험을 상용 수준으로 끌어올리기.

### Execution plan (draft, refine into tickets)

1) Sandbox / Hub 플러그인
   - Scope: 워크스페이스 VFS 경계 적용, `ai-actions-allowlist`/경로 매핑, Hub 플러그인(JSON API) 권한/배포/업데이트 흐름.
   - Deliverables: allowlist+경로 적용 코드, Hub API 초안(권한/토큰/헬스체크), 최소 1개 플러그인 PoC(UI 테스트 또는 로컬 Git).
   - Progress: `ai-actions-allowlist.json` 자동 생성/확인 추가(서버 측). `sandbox_exec`는 여전히 allowlist+경로 매핑을 강제하며, 가드 테스트(`__tests__/lib/rank/actions.sandbox.test.js`) 추가. `/api/rank/handle-action` 도 동일 가드( env 켜짐 + 인증 )를 선행 체크하며 batch 내 sandbox_* 포함 시도도 차단. Hub API 초안 `/docs/hub-api.md` 작성.
   - Next tickets:
     - API: Hub JSON 스펙(인증/헬스/플러그인 등록·호출) 초안 리뷰 + 권한/토큰 예제 보완.
     - Sandbox: `/api/rank/handle-action` 경로 가드 e2e(allowlist 적용 포함) + 배치 액션 시나리오 확인.
     - Plugin PoC: UI 테스트 플러그인 또는 로컬 Git 플러그인 1개 데모.
   - Planned plugins (권한/스코프는 `/docs/hub-api.md`에 추가 예정):
     - UI 테스트 샌드박스(`ui-sandbox`): Playwright/Puppeteer/DevTools 기반, 세션 단위로 click/type/navigate/drag/wait 수행, 콘솔/네트워크 로그+DOM 요약+스크린샷 반환. 브라우저 권한을 웹앱과 분리해 보안 유지.
     - 로컬 Git(`git-local`): 허용된 cwd에서 status/commit/push/pull 등 최소 git 액션 제공.
     - Supabase 커넥터(`supabase-client`): 사용자가 등록한 Supabase 프로젝트/키를 이용해 SQL/스토리지 등을 워크스페이스(Play/메인게임 포함)에서 호출하도록 중계. 프로젝트/키는 유저 소유이며, 메인게임/플레이에서도 동일 백엔드를 선택해 사용 가능하도록 연결.
     - (추가 여지) 로컬 빌드/파일 헬퍼: 허용 경로 내 스크립트 실행·에셋 처리 등, 엄격한 allowlist/스코프 전제.
   - 현재 Hub 없이 동작하는 에디터 확장/도구(웹앱 내):
     - AI Code Chat Dock: 코드/파일 액션을 수행하는 내장 도크(Next API 기반).
     - Capabilities Help/Extensions 패널: capability 계약 조회, 필수 파일 템플릿 안내, 확장 메타 저장.
     - Play/디버그 패널: 텍스트 런타임 실행, 네트워크/CRDT 어댑터 선택, 디버그 로그·턴 로그 조회.

2) Matching / 정산
   - Scope: 점수/랭크/정산 데이터모델+DB, `/api/rank/**` 확장, UI(라운드/랭크/정산 뷰), 캐릭터/세션 연계.
   - Deliverables: 스키마/마이그레이션, 정산 엔드포인트, 단순 정산 UI, 재접속/복구 시나리오 정의.
   - Next tickets:
     - 스키마/DB: 점수/랭크/정산 테이블 설계(MVP) + 마이그레이션 초안.
     - API: `/api/rank/settle` 등 정산 엔드포인트 설계, 세션/캐릭터 연계 계약.
     - UI: 정산/랭크 표시용 최소 UI 와이어프레임.
     - Battle log authoring: 코드 에디터/프롬프트-노드 에디터에서 턴 로그를 가공해 “전투 로그/하이라이트”를 구성·미리보기하는 편집/발췌 기능 추가. (예: 요약 프리셋, 구간 선택, 문단 템플릿)
     - 표준 로그 스키마/템플릿: 턴 이벤트 타입(`system`, `ai_action`, `user_action`, `judge`, `state_change`, `score_change`, `effect`, `dialogue`, `summary`)을 공통 필드(턴, speaker 슬롯, visibility, variables.stats/scene/effects/speaker) + 타입별 필드로 정의하고, `participants`(slotId → owner/name/team/role/bio) 맵을 별도 보관. 템플릿 엔진(Mustache 수준)으로 `highlightEvents` + `participants` + `finalState` 를 주입해 배틀로그 텍스트/HTML 생성. (세부안: `docs/battle-log-schema.md`, 헬퍼: `lib/runtime/battleLogSchema.js`)
     - 하이라이트 추출 규칙: `onBattleEnd(ctx)` 훅에서 승패/점수/태그된 이벤트 기반으로 `highlightEvents` 목록을 만들고, `summary_payload`에 outcome/scoreboard/highlightIds 저장. 재생성 가능하도록 템플릿/하이라이트 메타를 함께 저장.
     - 편집기 UX: 프롬프트-노드 노드/엣지에 “로그 라벨/하이라이트” 태그를 붙이고, 코드 에디터에 `logTemplates` 블록(`/game/runtime.config.json` 등)으로 프리셋/변수 매핑 선언. Play/메인게임 뷰어에서 전체/하이라이트/승패 요약 탭 및 참여자 필터 제공.

3) Play/툴링 마감
   - Scope: PlayOverlay 입력/런타임/디버그 훅 분리, Capabilities 선택→필수 파일 템플릿 자동 생성/가이드, runtimeIssues 빠른 액션 완성.
   - Deliverables: 모듈화된 Play 훅, “필수 파일 생성+템플릿 삽입” 버튼, runtimeIssues 경고/가이드 일관화.
   - Next tickets:
     - PlayOverlay: 입력/런타임 훅 분리 티켓(커스텀 훅 1~2개).
     - Capabilities UI: 템플릿 생성 버튼 추가(ExtensionInstallModal) 및 경고/가이드 문구 정리.
     - Battle log debug hook wiring (미완): runtimeBus → turnLog → participants/outcome → `useBattleLogDebug`로 정규화/하이라이트 생성. MainGameMobileUI에 데이터 배선(import/참여자 매핑)까지 추가, 디버그 패널 렌더링/정산 호출 연결은 TODO.

4) 품질/운영
   - Scope: 핵심 헬퍼·런타임·매칭 API 테스트, 기본 로깅/모니터링/알림, CI/CD·릴리즈/롤백 흐름, 리소스/타임아웃 가드.
   - Deliverables: 테스트 스위트, 관측 스택(MVP), 배포/롤백 절차 문서, 리미트/쿼터 설정.
   - Next tickets:
     - 테스트: `computeRuntimeFeatureIssues` 등 헬퍼 단위 테스트 세트.
     - 빌드/CI: `npm run build` 체크, 간단한 CI 스크립트 초안.
     - 관측: 에러/경고 로깅 경로 정의 및 최소 설정.

5) 렌더링 확장(선택/장기)
   - Scope: 2D/3D 엔진 일급 연동(Phaser/Pixi/three 중 1개 우선) + 씬/노드 편집기 초안.
   - Deliverables: 엔진 연동 PoC, 씬 편집 UI 스케치/프로토, GameShell와 연계 규칙 초안.

6) Docs/SDK 패키지
   - Scope: 안정된 API/SDK(런타임/매칭/Hub), 예제/템플릿, 확장/플러그인 가이드.
   - Deliverables: SDK 번들, 샘플 세트, 개발자 가이드 세트.

### Testing / validation guide (keep updated)
- 빠른 스크립트 체크: Node로 핵심 헬퍼 검증(예: `computeRuntimeFeatureIssues`), 필수 파일 존재 여부 검사. 필요 시 `npm test`/`npm run build` 실행.
- 단위 테스트 우선: 런타임(coreRuntime), 매칭/랭크 API, Hub/플러그인 경계, Capabilities 검증 로직에 집중.
- 샌드박스 가드: `__tests__/lib/rank/actions.sandbox.test.js`에서 SANDBOX_EXEC_ENABLE + allowlist 기반 실행/차단, `__tests__/api/rank/handle-action.test.js`에서 API 레벨 env/인증 + batch 포함 여부, allowlist 미스매치 차단/매치 성공 플로우까지 검증.
- 최근 실행(2025-12-04): `npm test -- __tests__/api/rank/handle-action.test.js __tests__/lib/rank/actions.sandbox.test.js` (PASS). reference_data 경고는 `modulePathIgnorePatterns` 로 일부 줄였고, 패키지 중복 경고도 `modulePathIgnorePatterns`에 `<rootDir>/ai-roomchat` 추가로 해소.
- 최근 실행(추가): `npm test -- __tests__/lib/rank/actions.sandbox.test.js` (PASS, regex allowlist + shell chaining 차단 + 500자 제한 + token: 규칙 + prefix 비활성 모드 검증 포함).

### Known gaps / tighten-up list
- Sandbox relax flags: `AI_ACTIONS_ALLOW_HOST=1` 는 dev 우회용으로만 허용. 배포/CI에서는 강제 off + 로그/메트릭 알람 필요.
- Allowlist strictness: 현재 prefix 매칭(예: `"node "`)은 과도 허용 가능. 정규식/토큰 단위 명시 allowlist로 좁히고, shell=true 의존도를 줄이기. (추가 가드: `;`,`&&`,`||`,`|`,`$()`,`\`` 포함 시 sandbox_blocked, 500자 초과 `cmd_too_long`, `SANDBOX_MAX_CMD_CHARS` 환경변수로 상한 조정 가능, `token:<cmd>`는 첫 토큰만 허용, `SANDBOX_ALLOW_PREFIX=0` 시 prefix 규칙 무시/기본 비활성.)
- Jest noise: `docs/reference_data/**` 내 다중 package.json으로 haste-map 경고 발생 → `modulePathIgnorePatterns` 로 일부 완화. 루트/중첩 styleMock 중복 제거를 위해 mapper를 `ai-roomchat/__mocks__/styleMock.js`로 고정했고 상위 `__mocks__`는 ignore. 여전히 패키지명 충돌(package.json) 경고 1건은 남아 있음.
- Hub/플러그인 권한: `/docs/hub-api.md`에 Bearer 토큰 스코프/원점 제한/명령·경로 제한 초안이 있으나, 실제 키 발급·회수/플러그인별 스코프 적용 로직은 미구현.
- Hub/플러그인: `/docs/hub-api.md`는 초안 상태, 권한/토큰/배포 플로우 미정. 플러그인 PoC 전에 권한 모델 확정 필요.
- 매칭/정산: 스키마·API·UI 미구현. 문서/티켓만 있음.
- 배틀로그 런타임 연결: `battleLogSchema/helpers`는 추가됐지만 PlayOverlay/정산/뷰어로의 실제 연결·커스텀 템플릿 입력 경로는 미구현.
- PlayOverlay: 입력/런타임/디버그 훅 분리 리팩터 미완료(계획만 기록).
- 통합/수동: PlayOverlay(디버그 패널 포함)에서 capability 누락 경고, 필수 파일 템플릿 생성 동작 확인.
- 관측/로그: 에러/경고 로그 수집 경로를 명시하고, 주요 경계(샌드박스/HUB/매칭)에서 로깅·타임아웃·리밋을 점검.
- 빌드/배포 전: `npm run build`로 기본 컴파일 체크, CI에 동일한 스크립트 연결(준비되면).

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

### 10.9 역할별 점수폭 설정 (`/game/roles.rank.json`) (in progress)

기존 랭크/게임 등록 플로우에서는 UI에서 역할/점수폭을 직접 입력해 `register_rank_game` RPC의 `p_roles` 인자로 넘겼다.  
텍스트 배틀 / Maker 중심 워크플로우에서는 이를 **워크스페이스 파일 + 프롬프트/코드 에디터 도구**로 이관한다.

- 원칙:
  - 역할/점수폭의 **단일 출처(single source of truth)** 는 워크스페이스 파일 `/game/roles.rank.json` 이다.
  - 게임 등록 페이지에 남아 있는 역할/점수 입력 UI는 점진적으로:
    - 이 파일을 보여주는 **뷰/보조 편집기** 역할만 하고,
    - 별도의 값(폼 상태)을 저장하거나 RPC에 직접 `p_roles` 를 넣지 않도록 정리한다.


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
  - 실제 구현 상태 (요약):
    - `components/rank/RankNewClient.js` 에서 게임 등록 시,
      먼저 워크스페이스의 `/game/roles.rank.json` 을 `loadRolesConfig` → `toRegisterRankRolesPayload` 로 읽어 `roles` payload 를 만든다.
    - 해당 파일이 없거나 파싱에 실패하면 기존 폼(`RolesEditor`) 값을 기반으로 role payload 를 생성하는 폴백 경로를 유지한다.


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
- 함수: `buildRankContext({ game, session, participants, room, viewer })`
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
    - **매칭 직후 자동 시작**:
      - 텍스트 런타임 게임에서 랭크 매칭이 성공해 StartClient로 진입하면,
        별도의 “게임 시작” 버튼을 누르지 않아도 `useStartClientEngine.handleStart()`가 자동으로 호출되어  
        `/api/rank/start-session` → 랭크 세션 생성이 진행된다.
      - 이 자동 시작은 StartClient가 `textRuntimeEnabled === true`이고,  
        아직 `sessionInfo.id`가 없는 경우에만 1회 수행된다.
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
    - `/debug/play.json`의 `logAiCalls: true` 일 때, Play 오버레이 상단 디버그 패널은
      `variables.debug.aiCalls` 값을 읽어 간단한 AI 호출 로그를 함께 보여준다.
      (텍스트 배틀 예제 훅은 `/api/ai-battle-judge` 호출 후 이 배열에 호출 결과를 누적한다.)

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
      - (현재 레포 상태: 텍스트 런타임 게임에서는  
        - 상단 “랭크 매치 / 메인 게임 / 참가자 0/0 …” 요약 영역,  
        - `매치 정보 / 내 캐릭터 / 매칭 편성` 카드,  
        - 오른쪽 `정보 가시성` 카드와 참가자 카드  
        는 기본적으로 렌더링되지 않고,  
        게임 화면 + **턴/히스토리 로그 패널**만 표시된다.  
        추후 `/game/ui.shell.json`과 `rank_game_workspaces.ui_shell`를 통해  
        이 패널들을 기능/설정 단위로 다시 노출할 예정이다.)
- GameShell 설계(초안):
  - 컴포넌트:
    - `components/game/GameShell.jsx` (가칭):
      - 내부에 `MainGameMobileUI`를 포함하고,
      - 외곽에 다음 영역을 가진다:
        - `header` – 게임 제목/상태/모드 요약.
        - `viewer` – 현재 플레이어 캐릭터 카드(이름/아바타/역할 요약).
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
          "viewer": { "enabled": true },
          "rankSummary": { "enabled": true, "region": "left" },
          "participants": { "enabled": true, "region": "left" },
          "turnLog": { "enabled": true, "region": "right" },
          "aiHistory": { "enabled": true, "region": "right" },
          "playerHistory": { "enabled": true, "region": "right" },
          "realtimeEvents": { "enabled": true, "region": "right" },
          "debugPrompt": { "enabled": false, "region": "right" }
        }
      }
      ```
    - 이 파일은 “어떤 패널을 쓸 수 있는지”를 선언하지는 않고,
      - 호스트가 제공하는 패널 타입(`rankSummary`, `participants`, `turnLog`, `debugPrompt` 등) 중
      - 어떤 것을 어디에, 켜고/끄고 싶을지만 지정한다.
    - 반응형 동작:
      - `layoutPreset`는 현재 `standard` / `stacked` 두 가지를 지원한다.
        - `standard`: 최대 폭 약 1080px, 데스크탑/와이드 화면에 맞춘 기본 레이아웃.
        - `stacked`: 최대 폭 약 720px, 세로 비율이 긴 화면에서 위아래로 쌓아 두는 레이아웃.
      - 구체적인 브레이크포인트/레이아웃은 GameShell 내부 CSS에서 처리하되,  
        셸 설정은 “어떤 패널이 우선적으로 보이는지, 모바일에서는 무엇을 접을지” 정도만 선언한다.
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
      - 스냅샷 저장:
        - `RankNewClient`에서 게임 등록 후 워크스페이스 스냅샷을 저장할 때,
          `/game/ui.shell.json`이 존재하면 이를 파싱해 `rank_game_workspaces.ui_shell`에 함께 저장한다.
        - StartClient는 `GET /api/rank/game-workspace`로 이 스냅샷을 로드하고,  
          `workspace.ui_shell`를 그대로 `GameShell`의 `shellConfig`로 넘겨 Play와 동일한 셸 구성을 사용한다.
       - 현재 구현 상태(이 레포 사본):
         - `layoutPreset`(`standard` / `stacked`)를 해석해 GameShell 전체 폭/정렬을 제어한다.
         - 랭크 모드에서는 `viewer` 패널을 통해 현재 플레이어 캐릭터(아바타, 이름, 역할 요약)를  
           헤더 바로 아래에 공통 셸 UI로 표시한다. (플레이 모드에서는 기본적으로 꺼진 상태)

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

---

## 17. Play ↔ Rank 동기화 현황 (중요 메모)

Status: in progress

이 섹션은 플래이(코드 에디터 Play)와 랭크 메인게임(StartClient)이 **같은 엔진/데이터를 어떻게 공유하고 있는지**, 그리고 아직 완전히 구현되지 않은 부분이 무엇인지 요약한다.

### 17.1 현재까지 보장되는 것

- 공통 엔진:
  - 두 화면 모두 `createCoreRuntime({ graph, config, hooks, files, initialVariables })` 로 텍스트 런타임을 생성한다.
  - 사용 파일:
    - `/graph/prompt-graph.json`
    - `/game/runtime.config.json`
    - `/game/hooks/automation.js`
  - 랭크 메인게임은 `initialVariables.rank = rankContext` 를 주입해 훅에서 매칭/세션 정보를 읽을 수 있다.
- 워크스페이스 스냅샷:
  - 게임 등록 시 `/api/rank/save-game-workspace` 를 통해
    - `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`,
      `/game/hooks/automation.js`, `/game/ui.shell.json`
    를 `rank_game_workspaces` 에 저장한다.
  - 메인게임은 `/api/rank/game-workspace?gameId=...` 로 이 스냅샷을 읽어와
    - `CodeWorkspaceProvider` (read‑only) + `GameShell` + `MainGameMobileUI` 를 구성한다.
- 매칭/세션 컨텍스트 (`ctx.variables.rank`):
  - `useStartClientEngine` 이 Supabase에서 `rank_games`, `rank_rooms`, `rank_match_roster`, `rank_game_slots`, `rank_sessions` 를 읽어
    - `buildRankContext({ game, session, participants, room, viewer })` 를 호출한다.
    - `viewer` 는 Supabase `auth.getUser()` 로 확인한 현재 사용자 id(`viewerId`)와
      매칭된 참가자 목록(`participants`)을 기준으로 `{ ownerId, heroId, role }` 형태로 채워진다.
  - 현재 스키마(간단 버전):
    - `rank.sessionId: string | null` – 현재 랭크 세션 id.
    - `rank.gameMode: "rank_shared" | string` – 세션/방 모드.
    - `rank.realtimeEnabled: boolean` – 실시간 매치인지 여부.
    - `rank.dropInEnabled: boolean` – 난입 허용 여부.
    - `rank.players: Array<{ ownerId, heroId, heroName, role, score?, rating? }>` – 매칭된 플레이어/캐릭터 요약.
    - `rank.viewer: { ownerId, heroId, role } | null` – 현재 뷰어(본인)에 대응되는 참가자 요약.
  - 이 `rankContext` 는:
    - 엔진 쪽에는 `ctx.variables.rank` 로,
    - UI 쪽에는 GameShell `rankContext` prop으로 내려가 `MainGameMobileUI` 에서 필요할 때 참조할 수 있다.

### 17.2 아직 미완인 부분 (의도적으로 남겨둔 TODO)

- 캐릭터/능력 표시:
  - 현재 메인게임의 `MainGameMobileUI` 는 템플릿의 `resources.characters` 를 사용해
    “샘플 캐릭터 카드”를 그리는 수준이다.
  - 실제 매칭된 참가자(`rankContext.participants`)와 템플릿 리소스를 연결해:
    - 역할/슬롯별 캐릭터 카드 리스트,
    - 능력/스탯/점수 등 상세 정보를 플래이·메인게임 공통 UI로 보여주는 단계는 **아직 구현되지 않았다.**
- 오디오/배경(브금, 배경 이미지):
  - 템플릿 수준에서는 캐릭터/장면별로 이미지·배경·브금 메타데이터를 적을 수 있으나,
  - 메인게임/플래이 공통 계약(`rankContext`, `ctx.variables`, `runtimeBus`)에서
    `activeBgmUrl`, `activeBackdropUrls` 같은 필드를 공식적으로 노출하는 단계는 **아직 정의되지 않았다.**
  - 이후 단계에서:
    - `rankContext.audio` 또는 별도 `ctx.variables.scene` 구조로
      “현재 장면/캐릭터에 대응하는 브금·배경·이미지 선택 결과”를 제공하고,
    - Play/메인게임 UI가 동일한 규칙으로 배경/브금을 교체하도록 하는 계약을 추가할 예정이다.
- 턴 로그 / 히스토리:
  - LogsPanel 은 현재 랭크 StartClient 안에만 있고, coreRuntime 이벤트를 “임시 형태”로 받아 표현한다.
  - 계획:
    - 엔진 → 로그 스트림을 공식 계약(`transformLogs(ctx, events)`)으로 승격하고,
    - GameShell 에 공통 로그 슬롯을 둔 뒤
      플래이와 메인게임 모두에서 동일한 LogsPanel/구성을 사용할 것.
- API 키 / 외부 호출:
  - StartClient에는 `useStartApiKeyManager` 등을 통해 랭크 전용 API 키 관리가 있다.
  - 텍스트 런타임 훅에서 “사용자 API 키를 안전하게 읽어 외부 API를 호출하는” 표준 계약은
    아직 도입되지 않았고, 텍스트 배틀 judge API 등 일부 경로에서만 부분적으로 사용 중이다.
- 난입/비실시간 정책과 UI:
  - 매칭/세션 레이어는 `realtime_match`, `dropInEnabled`, `asyncFill` 등의 정책을 이미 처리한다.
  - 그러나 메인게임 UI/엔진에서:
    - 실시간 vs 비실시간에 따른 정보 가시성,
    - 난입 허용 시 표시/제어 방식 등은 최소 수준으로만 연결되어 있고,
    - 장르/게임에 따라 커스터마이즈 가능한 수준까지는 아직 올라오지 않았다.

### 17.3 공통 턴 로그 이벤트 계약 (runtime:turn-log)

> 구현 메모 (표준 슬롯/턴 로그 파이프라인)
> - `coreRuntime.step()` / `getContextSnapshot()` 는 항상 `variables.stats.turn` 을 현재 턴 번호로 채운다.
> - 플래이 오버레이(CodeEditorOverlayV2)는 step 결과에서 나온 `result.variables` 를 그대로
>   `runtimeBus.emit('runtime:turn-log', { ..., variables: result.variables })` 에 포함한다.
> - StartClient 엔진(useStartClientEngine)은 메인게임 로그 엔트리를 만들 때
>   가능한 경우 `entry.variables` 에 텍스트 런타임의 `ctx.variables`(표준 슬롯 포함)를 넣고,
>   `/api/rank/log-turn` 호출 시 그대로 전달한다.
> - `/api/rank/log-turn` 은 `buildTurnSummaryPayload({ ..., variables })` 를 통해
>   `rank_turns.summary_payload.variables` 아래에 `speaker / stats / scene / effects` 구조를 복사한다.
> - 결과적으로, 텍스트 베틀 예제 기준으로는:
>   - 훅이 `variables.battle*` 와 표준 슬롯들을 채우고,
>   - 플래이 / 메인게임 / 랭크 턴 로그가 모두 동일한 `variables` 스냅샷을 공유하는 상태다.

- visibility / audience:
  - `runtime:turn-log` 엔트리는 선택적으로 `isVisible: boolean` 또는 `visibility: string` 을 가질 수 있다.
    - `visibility: "hidden" | "private" | "invisible" | "internal"` → 기본적으로 턴 로그 UI에서는 숨김.
    - `visibility: "public" | "party" | "visible" | "shared"` → 기본적으로 표시.
  - 값의 출처:
    - 플래이(CodeEditorOverlayV2):
      - 현재 노드의 `node.data.invisible === true` 이면 `visibility: "invisible"`, `isVisible: false` 로 기록된다.
      - 그렇지 않고 `node.data.visibility` 가 문자열이면 그대로 `visibility` 필드에 복사된다.
    - StartClient(랭크 메인게임):
      - 엔진 로그 항목의 `visibility` / `isVisible` / `public` 값을 그대로 전달한다.
        - `visibility` 가 문자열이면 그대로 사용.
        - `isVisible` 이 boolean 이면 그대로 사용,
        - 없고 `public` 이 boolean 이면 `isVisible = public` 으로 해석한다.
    - 값이 없으면 `public !== false` 를 기준으로 표시 여부를 결정한다.
  - UI Shell 위젯(`chatLog`, `turnTimeline` 등)은 위 규칙에 따라
    `runtime:turn-log` 스트림에서 “보여도 되는” 항목만 필터링해서 출력한다.

- 이벤트 이름:
  - `runtimeBus.emit('runtime:turn-log', event)` 형태로 발행한다.
  - Play(코드 에디터 Play 오버레이)와 랭크 메인게임(StartClient) 모두 **같은 형식**의 이벤트를 소비하는 것이 목표다.
- 최소 이벤트 스키마(초기 버전):
  - `event.turn: number | null` – 1부터 증가하는 턴 번호(없으면 null).
  - `event.nodeId: string | null` – 현재 노드 id.
  - `event.nodeLabel: string | null` – 노드 라벨(프롬프트 기본값).
  - `event.reason: "auto" | "user_action" | "inspect" | string | null` – 호출 이유.
  - `event.input: string | null` – `reason === "user_action"`일 때 사용자 입력 텍스트.
  - `event.prompt: string` – 실제 LLM에 보낼 최종 프롬프트 텍스트.
  - `event.ui: any` – `transformPrompt`가 돌려준 UI payload(있다면).
  - `event.variables: any` – 해당 턴 수행 직후의 `ctx.variables` 스냅샷(얕은 복사).
– 현재 구현 상태:
  - Play:
    - `CodeEditorOverlayV2.jsx`에서 `turn:next` / `player:chat` / 초기 `getCurrentWithPrompt` 호출 시
      `runtime:turn-log` 이벤트를 위 스키마로 발행한다.
    - 디버그 패널은 아직 “현재 턴 프롬프트”만 표시하지만, 이후 이 이벤트를 사용해
      공통 LogsPanel 또는 비슷한 UI를 붙일 수 있다.
  - 랭크 메인게임:
    - `StartClient/index.js`에서 `engine.logs` 배열이 증가할 때마다
      새 로그 항목을 `runtime:turn-log` 이벤트로 브리지해 `runtimeBus`로 흘려보낸다.
    - `LogsPanel` 자체는 아직 Rank 전용 `logs`/`aiMemory` 구조를 사용하고 있으며,
      차후 단계에서 `runtime:turn-log`를 직접 소비하는 공통 패널로 리팩터링할 예정이다.

### 17.4 기본 턴 로그 UI (TurnLogBar)

- 컴포넌트:
  - `components/game/TurnLogBar.jsx`
  - `GameShell` 안에서 `turnLogBarEnabled` 가 true일 때 렌더링된다.
- 동작:
  - `runtimeBus` 의 `runtime:turn-log` 이벤트를 구독해 최근 20개 턴 로그를 메모리에 유지한다.
  - 기본 상태에서는 얇은 바 한 줄로:
    - `턴 N · 첫 줄 요약` 형태의 텍스트를 보여준다.
  - 바를 클릭하면 작은 2‑열 패널이 펼쳐진다.
    - 왼쪽: 최근 턴 목록(턴 번호/이유/요약), 항목 클릭 시 선택.
    - 오른쪽: 선택된 턴의 전체 프롬프트 전문을 `pre` 블록으로 표시.
- 노출 정책:
  - 기본값:
    - 모든 모드에서 TurnLogBar는 **비활성화(off)** 상태다.
    - 워크스페이스의 `/game/ui.shell.json`에서
      `panels.turnLogBar.enabled: true` 를 설정했을 때만 표시된다.

요약하면, **엔진과 매칭/세션의 뼈대는 이미 Play ↔ Rank 사이에 공유되고 있고**,  
캐릭터 표시, 턴 히스토리, API 키, 난입 정책 등 “게임별 UI/경험을 풍부하게 만드는 계약”은  
이후 단계에서 GameShell + coreRuntime ↔ `/game/*` 계층으로 차례대로 끌어올릴 예정이다.

---

## 18. UI Shell 패널 / 위젯 계약 (계획)

Status: planned

이 섹션은 “플레이/메인게임이 공통으로 사용하는 UI 쉘”을  
**패널/슬롯/위젯 + 데이터 바인딩 계약**으로 정교하게 다듬기 위한 계획 메모다.

### 18.1 패널 / 레이아웃 모델

- 파일 위치 (초안):
  - `/game/ui.shell.json`
- 목표:
  - React 코드를 직접 수정하지 않고도
    - 어떤 패널을 사용할지,
    - 어느 영역에 얼마나 큰 비율로 배치할지,
    - Play / Rank 모드별 노출 여부를
    워크스페이스에서 제어 가능하게 만든다.
- 레퍼런스:
  - Godot의 `Control` + `HBoxContainer` / `VBoxContainer` / `GridContainer` / `MarginContainer`
    개념을 축소/재구성한 버전을 목표로 한다.
- 스키마 개요(예시):
  ```jsonc
  {
    "layout": {
      "columns": 2,
      "gutter": 12
    },
    "panels": {
      "header": { "enabled": true },
      "viewer": { "enabled": true },
      "turnLogBar": { "enabled": true },          // 17.4 TurnLogBar
      "leftMain": {
        "slot": "main",
        "span": 1
      },
      "rightSidebar": {
        "slot": "sidebar",
        "span": 1
      }
    }
  }
  ```
- 구현 순서:
  1. `ui.shell`을 단순 “패널 on/off + span 정도”만 가진 구조로 정의.
  2. GameShell / MainGameMobileUI 에서 이 정보를 읽어,  
     컬럼 수·패널 가시성·기본 폭 정도만 조정.
  3. 이후에 세부 위치(align, order 등)는 추가 옵션으로 확장.

### 18.2 위젯 타입 (kind) 계획

- 기본 위젯 후보:
  - `turnLogBar`: 17.4에서 구현한 얇은 턴 로그 바.
  - `chatLog`: 턴 로그 이벤트를 요약해서 보여주는 간단한 로그 뷰.
  - `heroCard`: 캐릭터/참가자 카드(이름/역할/점수 등 요약 정보).
  - `statMeter`: 점수/체력/게이지 등 수치 표현용 바.
  - `image`: 아바타/일러스트/아이콘 등 이미지를 표시하는 단순 이미지 뷰.
  - `badge`: 역할/상태/태그 등을 한 줄짜리 칩(chip) 형태로 표시.
  - `textBlock`: 짧은 설명/요약/공지 등을 제목+본문 블록으로 표시.
  - `gridCanvas`: 타일/보드 렌더링용 캔버스(월드 그리드, 보드게임 등).
  - `debugPanel`: 자유 텍스트/JSON 덤프 표시용.
- 패널 → 위젯 예시:
  ```jsonc
  {
    "panels": {
      "main": {
        "slot": "main",
        "widgets": [
          { "kind": "chatLog", "source": "turnLog" },
          { "kind": "gridCanvas", "source": "world.grid" }
        ]
      },
      "sidebar": {
        "slot": "sidebar",
        "widgets": [
          { "kind": "heroCard", "source": "rank.viewer" },
          { "kind": "heroCard", "source": "rank.players[0]" }
        ]
      }
    }
  }
  ```
- 구현 순서:
  1. TurnLogBar 처럼, 각 kind 에 대응하는 React 컴포넌트를 작게 설계.
  2. MainGameMobileUI 내에 “위젯 렌더러”를 두고 `kind`에 따라 컴포넌트 선택.
  3. 초기에는 1~2개의 kind만 실제 구현, 나머지는 스펙과 타입만 먼저 정의.

### 18.3 데이터 바인딩 규칙

- 위젯의 `source` 필드는 아래처럼 제한된 경로만 허용:
  - `rank.*` – `rankContext` (`game`, `session`, `viewer`, `players` 등).
  - `variables.*` – `ctx.variables` (`battleLast`, `battleScore`, 커스텀 변수 등).
  - `world.*` – `ctx.world` 또는 grid 엔진에서 제공하는 상태.
  - `turnLog.*` – `runtime:turn-log` 스트림에서 가져온 요약/최근 항목.
- 예시:
  ```jsonc
  { "kind": "heroCard", "source": "rank.viewer" }
  { "kind": "statMeter", "source": "variables.battleScore.hero" }
  { "kind": "chatLog",  "source": "turnLog" }
   { "kind": "image",    "source": "rank.viewer.avatarUrl", "variant": "circle" }
  ```
- 구현 아이디어:
  - 간단한 경로 해석기(`resolveBinding('rank.viewer', ctx)`)를 만들어
    UI 코드에서 공통으로 사용.
  - 잘못된 경로나 타입 오류는 UI에서 “데이터 없음” 정도로 안전하게 처리.

### 18.4 조건부 표시 / 변형 (visibleWhen, variantWhen)

- 패널/위젯 공통 옵션:
  ```jsonc
  {
    "kind": "heroCard",
    "source": "rank.viewer",
    "visibleWhen": "rank.viewer != null && variables.turn > 1",
    "variant": "compact"
  }
  ```
- `visibleWhen`:
  - 작은 표현식 언어를 문자열로 지정한다.
  - 1차 구현에서는 다음 형태만 지원한다:
    - 단일 경로 존재 여부: `"rank.viewer"`, `"variables.battleScore.hero"`, `"!rank.viewer"`
    - AND / OR 결합: `"rank.viewer && variables.turn"`, `"rank.viewer || variables.turn"`
  - 경로는 `rank.*` / `variables.*` / `turn.*` 로 제한되며,
    내부적으로는 `resolveBindingFromRoot`를 사용해 값의 truthy 여부만 평가한다.
- `variant` / `style`:
  - `"compact" | "normal" | "detailed"` 등 미리 정의된 스킨을 선택.
  - 색/여백/텍스트 크기 등은 변형마다 코드에 캡슐화.

### 18.5 구현 순서 (요약)

1. **1단계 – 레이아웃/패널 최소 계약**
   - `ui.shell.layout` + `panels.*.enabled/slot/span` 정도만 도입.
   - GameShell/MainGameMobileUI가 이 정보를 읽어 지금 있는 UI를 약간 유연하게 재배치.
2. **2단계 – 위젯 렌더러 + TurnLogBar 통합**
   - TurnLogBar를 첫 번째 “위젯 kind”로 삼아,
     `widgets: [{ kind: "turnLogBar" }]` 형태의 스키마를 실제 소비.
3. **3단계 – heroCard / chatLog / statMeter 기본 구현**
   - `rank.viewer`, `rank.players`, `runtime:turn-log`, `variables.battle*` 를 사용하는
     기본 위젯들을 소수 구현하고, 예제 워크스페이스에 반영.
4. **4단계 – 데이터 바인딩 / visibleWhen**
   - `source`/`visibleWhen` 해석기를 도입해,
     위젯을 상황에 따라 보였다/숨겼다 하거나 변형을 선택할 수 있게 함.
5. **5단계 – Maker / UI 편집 도구**
   - Maker(프롬프트-노드/코드 에디터)에서
     `/game/ui.shell.json`을 GUI로 편집할 수 있는 “UI 쉘 편집기” 추가.
   - 대부분의 사용자는 이 도구 안에서 패널 추가·크기 조정·데이터 바인딩만 조작하도록 유도.

### 18.6 Godot UI 개념과의 매핑 (참고)

이 프로젝트의 UI 쉘/위젯 계약은 Godot 엔진의 UI 시스템을 완전히 복제하지는 않지만,  
아래와 같은 1:1에 가까운 “마음속 대응표”를 두고 설계한다.  
이렇게 하면 Godot 경험이 있는 사람이 쉽게 구조를 이해할 수 있고,  
우리는 웹/React 환경에 맞는 축소판을 유지할 수 있다.

- 레이아웃 컨테이너:
  - Godot `HBoxContainer` ≒ `layout.type: "row"`
  - Godot `VBoxContainer` ≒ `layout.type: "column"`
  - Godot `GridContainer` ≒ `layout.type: "grid"` + `columns`
  - Godot `MarginContainer` / anchor 설정 ≒ `layout.align`, `padding`, `span`
- 패널/컨트롤:
  - Godot `Panel` / `PanelContainer` ≒ `panel.kind: "container"` + `style.variant`
  - Godot `Label` ≒ `widget.kind: "text"` / `"debugText"`
  - Godot `TextureRect` ≒ `widget.kind: "image"`
  - Godot `Button` ≒ `widget.kind: "button"` + `onClick` → `runtimeBus`/`step` 액션 계약
- 테마/스킨:
  - Godot `Theme` / `StyleBox*` ≒ `widget.variant` / `widget.style`
    (예: `"compact"`, `"pill"`, `"card"`, `"chip"` 등 미리 정의된 변형 이름)

실제 구현은 Godot의 모든 기능을 따라가진 않지만,  
“행/열/그리드 컨테이너 + 패널 + 텍스트/이미지/버튼 위젯 + 테마/변형”이라는  
큰 틀과 데이터 계약을 먼저 맞춰두고, 세부 기능은 필요할 때마다 단계적으로 추가해 나가는 것을 기본 원칙으로 한다.

### 18.7 이미지 / 스프라이트 자원과 압축 (계획)

- 저장 원칙:
  - 워크스페이스 파일에는 **이미지 원본을 직접 포함하지 않는다.**
  - 대신 `/resources/images.json`(예시)와 같이 “메타데이터만” 저장한다.
    ```jsonc
    {
      "id": "slime_green",
      "url": "https://cdn.example.com/assets/slime_green.webp",
      "width": 48,
      "height": 48,
      "format": "webp"
    }
    ```
  - 오브젝트/엔티티는 이 id를 `skin` 등의 필드로 참조한다.
- 업로드 / 압축 파이프라인(서버 측, 추후 구현):
  1. 클라이언트가 원본 이미지를 `/api/assets/upload-image`(가칭)에 업로드한다.
  2. 서버에서 `sharp` 등의 라이브러리를 사용해
     - 최대 해상도 제한(예: 가로/세로 1024px),
     - WebP/AVIF/압축 PNG 등으로 변환,
     - 품질(Q) 조정으로 용량 축소를 수행한다.
  3. 최적화된 이미지를 Supabase Storage 또는 별도 CDN에 저장하고,
     그 URL/크기/포맷 정보를 `/resources/images.json` 등 메타 파일에 기록한다.
- 런타임 사용:
  - 캔버스/렌더러(`rendererCanvas2D` 등)는 `skin` → `images.json` 의 매핑 결과를 사용해
    실제 이미지를 그려도 되고, 현재처럼 색상/도형 기반 플레이스홀더로 표현해도 된다.
  - 중요한 것은 “엔진/계약 레벨에서는 id/URL/크기/포맷 등 **압축된 메타 정보**만 의존한다”는 점이다.

### 18.8 UI 레이아웃/위젯 설계 레퍼런스

이 프로젝트의 UI Shell/위젯 시스템은 완전히 새로운 개념을 발명하기보다는,  
기존 엔진/웹/디자인 시스템에서 검증된 패턴을 축소·조합해서 사용한다.

#### 17.3.1 표준 데이터 슬롯 규약 (요약)

- 자세한 슬롯 구조와 헬퍼는 `docs/standard-data-slots.md` 와 `lib/runtime/standardSlots.js`, `lib/runtime/rankStandardSlots.js` 를 참고한다.


엔진/훅/위젯 사이의 결합도를 낮추기 위해, “어디에 무엇을 넣으면 어떤 UI가 그것을 소비하는지”를
몇 가지 공통 슬롯으로 약속한다.

- `event.variables.speaker`
  - 훅/엔진이 `runtime:turn-log` 이벤트에 다음 형태로 채운다:
    - `{ ownerId?, heroId?, role?, accentColor?, avatarUrl? }`
  - 효과:
    - `chatLog` 위젯(`ShellChatLogRich`)이 이를 발화자로 해석해
      - 캐릭터 이름/역할,
      - 아바타 이미지,
      - 강조 색(accentColor)이 있으면 말풍선 테두리/배경 톤
      을 함께 표시한다.
- `rankContext.players[*]`

#### 17.3.2 runtime:turn-log ↔ 랭크 턴 로그 매핑 (요약)

랭크 세션에서 core.text-runtime 을 사용할 때, 턴 로그는 다음 두 단계로 저장된다.

1. 클라이언트:
   - 엔진(step 결과)을 기반으로 `runtime:turn-log` 이벤트를 발행한다:
     - `{ turn, nodeId, nodeLabel, reason, input, prompt, ui, variables }`
   - StartClient 엔진은 이 이벤트/기록을 `logTurnEntries({ entries, turnNumber })` 로 변환해
     `/api/rank/log-turn` 에 전송한다.
2. 서버(`/api/rank/log-turn`):
   - `entries[*]` 를 정규화하면서, 전달된 `variables` 가 있으면
     `buildTurnSummaryPayload({ ..., variables })` 에 넘겨,
     `rank_turns.summary_payload.variables` 아래에:
       - `speaker / stats / scene / effects` 를 저장한다.

이 흐름을 통해:

- UI Shell / 디버그 패널은 `runtime:turn-log` 를 직접 소비하고,
- 랭크 세션/턴 기록은 `rank_turns.summary_payload` 를 통해 같은 정보를 조회할 수 있다.
  - 매칭/세션 쪽에서 `{ ownerId, heroId, heroName, role, score, rating }` 외에
    - `avatarUrl`, `backgrounds[]`, `bgmUrl`, `bgmDurationSeconds`, `audioProfile`
    를 채워 넣을 수 있다.
  - 효과:
    - `heroCard` / `image` 위젯이 공통으로 이 필드를 사용해
      캐릭터 카드/이미지, 배경/브금 등을 표현한다.

추가 기능(예: `stats`, `scene`, `effects` 등)도 동일한 패턴으로,
`variables.*` 또는 `rank.*` 아래에 슬롯을 정의하고,
어떤 위젯이 그것을 소비하는지 이 문서에 “~를 ~에 채우면 ~가 동작한다” 형태로 확장해 나간다.

#### 17.3.2 추가 데이터 슬롯 (stats / scene / effects)

- `event.variables.stats`
  - 훅/엔진이 턴 종료 시점에
    - `stats.hp`, `stats.mp`, `stats.gauge`, `stats.score` 등 수치형 상태를 채운다.
  - 효과:
    - `statMeter` 위젯이 `source: "variables.stats.hp"` / `"variables.stats.gauge"` 같은 경로를 통해
      체력/게이지/점수 등을 바로 시각화할 수 있다.
- `event.variables.scene`
  - 현재 장면/상황에 대한 요약 정보를 담는 슬롯:
    - 예: `scene.summary`(짧은 설명), `scene.backgroundKey`, `scene.bgmKey`.
  - 효과:
    - `textBlock` 위젯이 `source: "variables.scene.summary"`를 읽어 “현재 장면 요약”을 보여줄 수 있고,
    - 향후 배경/브금 위젯이 `backgroundKey` / `bgmKey`를 사용해 리소스를 선택하도록 확장할 수 있다.
- `event.variables.effects`
  - 버프/디버프/상태이상 등 턴 단위 효과의 리스트:
    - 예: `effects.active[]` 안에 `{ id, label, kind, remainingTurns }` 구조를 넣는다.
  - 효과:
    - `badge` / `textBlock` 조합으로 `source: "variables.effects.active[0].label"`처럼
      간단한 효과 표시를 할 수 있고,
    - 나중에 전용 effects 위젯을 추가해도 동일 슬롯을 재사용한다.

- 웹 레이아웃:
  - HTML + CSS Flex/Grid의 개념을 그대로 차용한다.
  - `row / column / grid / stack` 컨테이너와 spacing/padding/align 옵션은
    Flex/Grid의 단순화된 버전으로 본다.
- 디자인 시스템 / 헤드리스 컴포넌트:
  - Tailwind + Headless UI, Radix UI, Chakra 등에서 사용하는
    “컴포넌트 + variant + size + color” 패턴을
    `kind + variant + style` 설계에 반영한다.
- Godot UI:
  - 18.6에서 정리한 대로 `Control` + 컨테이너 + Theme/StyleBox 개념을
    패널/위젯/테마 모델의 기본 레퍼런스로 삼는다.
- Unity UI Toolkit / Figma:
  - UXML/USS, Auto Layout/Component 같은 선언적 UI 정의 방식을 참고해
    `/game/ui.shell.json`이 “씬이 아닌 UI 스키마” 역할을 하도록 유지한다.

요약하면, UI Shell은 “웹 레이아웃 + Godot/Unity UI + 현대 디자인 시스템”의  
가장 작은 공통분모를 계약으로 정리한 뒤, 게임 장르에 맞게 필요한 만큼만 확장하는 것을 목표로 한다.

---

## 19. UI Shell 편집기 & 확장 로드맵 (요약)

지금까지는 **데이터 슬롯(speaker / stats / scene / effects / rankContext.players) ↔ 위젯(chatLog / heroCard / statMeter / badge / textBlock / image / gridCanvas)** 축의 계약을 먼저 정리했다.  
이제부터는 이를 Maker/랭크 메인게임/추가 장르에서 소비하는 방향으로 확장한다.

### 19.1 Maker UI Shell 편집기 v0

- 목표:
  - `/game/ui.shell.json`을 손으로 편집하지 않고도,
    Maker 화면에서 셸/위젯 구성을 직관적으로 바꿀 수 있게 한다.
- 최소 기능:
  - 패널 on/off 토글(header / playerChat / nextBar / widgets 등).
  - 위젯 리스트 편집:
    - kind 선택(chatLog / heroCard / statMeter / badge / textBlock / image / gridCanvas).
    - `source` 슬롯 선택(예: `variables.speaker`, `variables.stats.hp`, `rank.players[0]`).
    - 스타일 토큰 선택(padding / radius / tone / density 등).
  - JSON 스키마는 여전히 `/game/ui.shell.json`이 단일 진실이며,
    편집기는 이 스키마에 맞춰 읽고/쓰는 thin-layer 로 유지한다.

### 19.2 위젯 보강 (프리미티브 확장)

- 현재 프리미티브:
  - 정보 위젯: `heroCard`, `badge`, `textBlock`, `image`.
  - 로그 위젯: `chatLog`, `turnLogBar`(별도 컴포넌트).
  - 수치/세계 위젯: `statMeter`, `gridCanvas`.
- 추가 후보:
  - 리스트/테이블형 위젯 (예: 효과 목록, 참가자 목록).
  - 탭/섹션 전환 위젯 (여러 로그/패널을 교대로 보여줄 수 있도록).
- 원칙:
  - 새로운 기능을 위해 위젯 종류를 폭발시키기보다는,
    기존 프리미티브 + 데이터 슬롯 조합으로 표현할 수 있는지 먼저 검토한다.

### 19.3 텍스트 배틀 외 장르 준비

- world/grid:
  - `ctx.world` + `world.grid` + `GridCanvas` 를 이용해
    보드게임/퍼즐/2D 맵을 표현하는 기본 틀을 다듬는다.
  - 슬롯 예시:
    - `variables.worldSelection` – 현재 선택된 칸/객체.
    - `variables.worldHint` – 씬 힌트/규칙 요약.
- 2D/3D 디스플레이:
  - 장기적으로는 캔버스/웹GL/외부 엔진(Godot 등)과 연동하는 어댑터를 두되,
    UI Shell 레이어에서는 “뷰포트 위젯” 정도의 추상만 유지한다.

### 19.4 디버그/샌드박스 흐름

- 플래이:
  - API 키/매칭 없이도 슬롯(speaker / stats / scene / effects)에 더미 값을 흘려보내는
    “샌드박스 모드”를 제공해, UI Shell/위젯 구성을 빠르게 확인할 수 있게 한다.
- 메인게임:
  - 매칭/세션이 안정되면, 실제 랭크 세션 하나를 샌드박스 세션처럼 돌려보며
    플래이 ↔ 메인게임 UI가 동일하게 동작하는지 확인한다.

### 19.2 랭크 게임 워크스페이스 스냅샷 (ui_shell 포함)

- 목표
  - 워크스페이스 파일 맵에서 텍스트 런타임에 필요한 핵심 파일들을 추려
    `rank_game_workspaces` 테이블에 저장할 수 있는 스냅샷 구조로 변환한다.
  - 이후 `/api/rank/save-game-workspace` 에서 이 스냅샷을 사용해
    `/template.json`, `/graph/prompt-graph.json`, `/game/runtime.config.json`,
    `/game/hooks/automation.js`, `/game/ui.shell.json` 내용을 함께 저장한다.

- 코드 위치
  - `lib/workspace/uiShellSnapshot.js`
    - `extractUiShellFromFiles(files)`:
      - 워크스페이스 `files` 맵에서 `/game/ui.shell.json`을 찾아 JSON 파싱.
      - 존재하지 않거나 비어 있으면 `null` 반환.
    - `buildRankGameWorkspaceSnapshot(files)`:
      - 다음 키를 가진 객체를 반환:
        - `template`       ← `/template.json` (jsonb)
        - `graph`          ← `/graph/prompt-graph.json` (jsonb)
        - `runtime_config` ← `/game/runtime.config.json` (jsonb)
        - `hooks_source`   ← `/game/hooks/automation.js` (text)
        - `ui_shell`       ← `/game/ui.shell.json` (jsonb, 선택)
      - Supabase SQL `rank-game-workspace-snapshot.sql` 의
        `save_rank_game_workspace(p_game_id, p_workspace)` 에 넘길 `p_workspace` 형태를 그대로 따른다.

- 사용 예정 흐름
  - Maker / Studio에서 “이 워크스페이스를 랭크 게임 스냅샷으로 저장”할 때:
    1. `useWorkspace()` 의 `filesForSave()` 결과를 `buildRankGameWorkspaceSnapshot(files)`에 전달.
    2. 반환값을 `workspace` 페이로드로 `/api/rank/save-game-workspace` 에 POST.
    3. 백엔드는 `save_rank_game_workspace` RPC 또는 `rank_game_workspaces` upsert로 저장.

### 19.1.1 Maker UI Shell 편집기 v0 – 구현 상태

- 위치
  - Maker 프롬프트 에디터 상단 헤더 → `도구 ▾` → **게임 셸 설정**
  - 클릭 시 `components/maker/settings/GameShellEditor.js` 모달이 열린다.
- 동작
  - 현재 템플릿의 JSON(`templateText`)에서 `ui_shell` 블록을 찾아 읽어온다.
    - 없으면 `{}` 기준으로 시작한다.
  - 다음 필드를 v0 범위로 편집 가능:
    - `ui_shell.panels.widgets.enabled` – Shell 위젯 영역 전체 on/off
    - `ui_shell.panels.turnLogBar.enabled` – 하단 턴 로그 바 on/off
  - 저장 시:
    - 템플릿 객체에 `ui_shell.panels.widgets.enabled` / `ui_shell.panels.turnLogBar.enabled`
      값을 반영한 뒤, `setTemplateText(JSON.stringify(obj, null, 2))` 형태로 갱신한다.
- 목적
  - 나중에 workspace 기반 `/game/ui.shell.json` 파일을 사용할 때도 같은 스키마를 공유하기 위해,
    먼저 템플릿 수준에서 Shell 패널 on/off를 실험·조정할 수 있는 최소 편집기를 제공한다.



Developer comment — The command will only work if you put it inside $ cmd /c '' or $ cmd /c "". You seem to forget this often, so keep it in mind. When the time comes to use Supabase SQL, try doing it yourself as well. If you need the required keys, ask the developer.
---

### 18.x. UI 셸 스타일 토큰 (초안)

위젯 종류를 과도하게 늘리는 대신, core 위젯(chatLog / heroCard / statMeter / image / gridCanvas 등)에 **간단한 스타일 토큰**을 붙여 조합력을 높이는 방향으로 설계한다.

- 공통 스타일 토큰(제안)
  - `padding`: `"none" | "xs" | "sm" | "md" | "lg"`
  - `gap`: `"none" | "xs" | "sm" | "md"`
  - `radius`: `"none" | "sm" | "md" | "lg" | "full"`
  - `tone`: `"primary" | "secondary" | "muted" | "danger"`
  - `align`: `"start" | "center" | "end"`
  - `density`: `"compact" | "normal" | "relaxed"`

각 위젯은 `style` 혹은 `styleProps` 필드를 통해 이 토큰들을 받으며, 런타임에서는 토큰을 Tailwind / Figma 비슷한 스타일 맵으로 변환해 inline style에 적용한다.  
실제 토큰 → 스타일 변환 로직은 `ai-roomchat/components/game/uiShellStyle.js` 의 `applyShellStyleProps(styleProps)` 에 구현되어 있으며, Shell 위젯/컨테이너에서 공통으로 사용한다.

- 현재 구현 기준 동작 요약
  - `padding` / `gap` / `radius`:
    - 각 위젯 컨테이너의 여백·간격·모서리 라운드를 직접 조정한다.
  - `align`:
    - 컨테이너의 `alignSelf` 에 매핑되어, 같은 행/열 안에서 위젯을 시작/중앙/끝 쪽으로 정렬하는 데 사용된다.
  - `tone`:
    - 카드형 위젯의 배경·테두리 톤을 가볍게 바꾼다.
    - `primary` / `secondary` / `muted` / `danger` 값에 따라 파란 계열, 기본/보조, 흐린, 경고 느낌을 부여한다.
  - `density`:
    - `compact` 일 때 글자 크기를 약간 줄이고, 이미 지정된 padding 이 있으면 2px 정도 줄인다.
    - `relaxed` 일 때는 글자 크기를 약간 키워 좀 더 여유 있는 카드 느낌을 만든다.

- 구현 순서
  1. `Shell*` 위젯들에서 공통 `styleProps` 객체를 받고, 이를 실제 스타일로 풀어주는 헬퍼(`applyShellStyleProps(styleProps)`)를 사용한다.
  2. `/game/ui.shell.json` 스키마에 위 토큰들(`padding`, `radius`, `tone` 등)을 옵션으로 열어두고, 생략 시 기본값을 사용하도록 한다.
  3. Maker UI Shell 편집기에서 이 옵션들을 토글/셀렉트로 조정할 수 있는 간단한 편집 UI를 붙인다.

이 흐름을 유지하면, 위젯 종류 자체는 많지 않아도 “디자인 세부 기능”을 꽤 풍부하게 조합할 수 있는 구조가 된다.

#### 18.x.1. 위젯 예시 + 스타일 조합

간단한 예시:

```jsonc
{
  "panels": {
    "widgets": {
      "enabled": true,
      "widgets": [
        {
          "kind": "heroCard",
          "source": "rank.viewer",
          "style": {
            "padding": "md",
            "radius": "lg",
            "tone": "primary"
          }
        },
        {
          "kind": "chatLog",
          "style": {
            "padding": "sm",
            "radius": "sm",
            "density": "compact"
          },
          "visibleWhen": "turn.last"
        }
      ]
    }
  }
}
```

위와 같이 `style` 토큰만 바꿔도 같은 heroCard / chatLog 위젯을 카드형, 리스트형 등으로 재사용할 수 있다.  
토큰은 기본적으로 **선택 사항**이며, 생략 시 엔진이 지정한 기본 스타일이 사용된다.

#### 18.x.2. Maker UI Shell 편집기 (계획)

Maker 쪽에서는 `/game/ui.shell.json`을 직접 편집하는 대신, 다음과 같은 단계를 제공할 계획이다.

1. 패널 토글
   - header / playerChat / nextBar / widgets 등 패널별 on/off.
2. 위젯 추가/삭제
   - kind 선택(chatLog / heroCard / statMeter / image / gridCanvas 등),
   - source 바인딩 선택(rank.* / variables.* / turn.*).
3. 스타일 토큰 편집
   - padding / radius / tone / density 등을 셀렉트 박스로 조정.
4. 조건부 표시
   - `visibleWhen`을 간단한 표현식으로 입력하거나 프리셋에서 선택.

이 편집기는 **플래이 / 메인게임이 공유하는 UI 셸 계약**만 건드리고, 실제 React 코드는 수정하지 않는다.  
새 위젯(kind)을 추가해야 할 때만 엔진 개발자가 React 컴포넌트를 추가하고, Maker는 그 위젯을 조합해서 사용하는 구조를 유지한다.
#### (향후) GameShell 시각 편집 모드 / 공통 PLAY 버튼

- 프롬프트-노드 에디터의 상단 `테스트` 패널/버튼은 장기적으로 제거하고, **코드 에디터와 동일한 상단 PLAY 버튼 하나**로 테스트를 통합한다.
  - 프롬프트-노드 에디터 상단의 PLAY 버튼은 CodeEditorOverlayV2의 플레이 엔진을 그대로 사용하고, 현재 프롬프트 세트와 연결된 워크스페이스 파일을 실행한다.
- UI 셸 편집은 다음 두 진입점을 통해 **동일한 모드**를 공유하는 것을 목표로 한다.
  - 프롬프트-노드 에디터의 도구 드롭다운에 있는 `게임 셸 설정 / UI 편집` 항목
  - 플래이 화면 디버그 패널 안의 `UI 셸 편집` 버튼(예정)
- 이 시각 편집 모드는 실제 GameShell 레이아웃(플래이/메인게임에서 보는 것과 동일한 화면)을 미리보기로 띄운 뒤,
  - 위젯 박스를 드래그/토글하여 배치·표시 여부·스타일 토큰(padding/radius/tone/density 등)을 조정하고,
  - 결과를 `/game/ui.shell.json` 및 템플릿의 `ui_shell` 블록에 저장하는 형태로 설계한다.
- 엔진/계약 레벨 기본 규칙: 새로 추가되는 UI 기능은 모두 **비가시(기본 disabled)** 상태로 계약에만 먼저 추가되고,
  - Maker의 GameShell 에디터 또는 코드 편집으로 명시적으로 켠 경우에만 플래이/메인게임에 나타난다.
- 대신 기본 장르(예: 텍스트 베틀)용 예제 템플릿과 “새 게임 만들기” 마법사는,
  - 추천 레이아웃을 미리 활성화된 `ui_shell` 프리셋으로 제공하여,
  - 초보자는 “그냥 만들면 바로 보이는” 경험을 하고, 고급 사용자는 필요 시 GameShell 에디터로 세부 조정하는 흐름을 권장한다.
### 부록: 표준 데이터 슬롯과 랭크 턴 로그

- `coreRuntime` 는 모든 컨텍스트에서 `variables.stats.turn` 을 현재 턴 번호로 채운다.
  - (`standardSlots.updateStandardSlots(ctx, { stats: { turn } })` 호출)
- 플래이 / 메인게임 / StartClient 엔진에서 턴 로그를 만들 때,
  - 가능한 경우 `ctx.variables` 중 표준 슬롯(`stats / scene / effects / speaker`) 을
    `entry.variables` 로 함께 전달한다.
- `/api/rank/log-turn`:
  - 각 엔트리를 정규화(normalize)하면서 `entry.variables` 를 유지한다.
  - `buildTurnSummaryPayload({ ..., variables: entry.variables })` 를 호출해
    `rank_turns.summary_payload.variables` 아래에
    `speaker / stats / scene / effects` 구조를 그대로 복사한다.
- 이렇게 해 두면:
  - 나중에 세션 리플레이 / 하이라이트 / 통계 화면에서
    턴마다의 스피커, 점수, 장면, 효과를 공통 포맷으로 재사용할 수 있다.

### 부록: 역할 / 점수폭 config (`/game/roles.rank.json`) 단일 소스 계획

- 워크스페이스에는 역할/점수폭을 정의하는 전용 파일 `/game/roles.rank.json` 을 둔다.
  - 구조 예시:
    ```json
    {
      "roles": [
        { "name": "공격수", "slotCount": 1, "scoreDeltaMin": -20, "scoreDeltaMax": 40, "active": true },
        { "name": "수비수", "slotCount": 1, "scoreDeltaMin": -10, "scoreDeltaMax": 25, "active": true }
      ]
    }
    ```
  - Maker의 “역할 / 점수 설정” 도구는 이 파일을 편집하는 UI이다.
- 서버/등록 측에서는 `lib/rank/rolesConfig.js` 를 사용해 이 파일을 읽는다.
  - `loadRolesConfig(files)` → `{ roles: [...] }` 형태로 workspace VFS에서 로드.
  - `toRegisterRankRolesPayload(cfg)` → `register_rank_game` RPC 가 기대하는
    `p_roles` 페이로드로 변환.
- `/api/rank/register-game` 의 목표 동작:
  - 기본적으로는 기존 UI에서 넘어온 `req.body.roles / slots` 를 그대로 검증·사용하되,
  - 워크스페이스 스냅샷(예: `rank_game_workspaces.ui_shell` 와 동일한 스냅샷)이 존재하는 게임에 대해서는
    `/game/roles.rank.json` 을 단일 소스로 삼아:
    - UI 값과 roles.rank.json 이 충돌할 경우 roles.rank.json 을 우선시하고,
    - RPC `p_roles` 인자는 항상 roles.rank.json 기반으로 생성한다.
- 이 부록에 정의된 방향대로 정리되면:
  - 코드 에디터 / 프롬프트-노드 에디터에서 설정한 역할/점수폭이
    게임 등록/랭크/매칭 전체에서 같은 값을 사용하게 되고,
  - 기존 게임 등록 페이지의 역할/점수 입력은 보조 UI (또는 읽기 전용 미리보기)에 가깝게 다뤄진다.

### 부록: GameShell 기본 프리셋 운영 원칙

- 텍스트 베틀 기본 UI 셸은 예제 파일
  `docs/examples/text-battle-basic/game.ui.shell.json`
  로 제공한다.
  - 새 워크스페이스/예제를 만들 때 이 내용을 복사해 `/game/ui.shell.json` 으로
    사용하는 것을 권장하지만,
    이미 편집된 셸을 덮어쓰는 “프리셋 적용 버튼” 같은 것은 두지 않는다.
- 즉, 기본 프리셋은 **초기값/참고용**으로만 쓰이고,
  실제 게임의 화면 구조는 언제나 워크스페이스의 `/game/ui.shell.json`
  (또는 템플릿 `ui_shell` 블록)을 직접 편집해서 관리한다.
- GameShellEditor 는 이 파일을 편하게 편집하기 위한 UI일 뿐,
  한 번 편집된 뒤에는 프리셋으로 되돌리는 자동 동작을 제공하지 않는다.

### 부록: GameShell 위젯 분할 / 컴포넌트 세분화 계획

- 목표:
  - 기존 Rank 메인게임 UI에 흩어져 있는 기능들을 **작은 Shell 위젯 단위로 쪼개서**,
    `/game/ui.shell.json` 에서 자유롭게 배치·조합할 수 있게 만든다.
  - 플래이 / 메인게임 / 향후 장르 확장 모두가 같은 위젯 세트를 공유한다.

- 1차 대상 위젯 (예시 이름):
  - `turnTimeline`: 턴별 요약/상태를 수직 타임라인 형태로 보여주는 위젯.
    - 데이터: `runtime:turn-log` 스트림, `summary_payload.preview`, `variables.stats.turn` 등.
  - `aiHistory`: 마지막 N개의 AI 응답(또는 중요한 응답만)을 모아서 보여주는 패널.
    - 데이터: `runtime:turn-log` 중 AI/판정 계열로 분류되는 엔트리
      (`variables.speaker.role` 이 `"ai" | "assistant" | "judge"` 이거나,
       `reason` 문자열에 `"ai" / "judge"` 가 포함된 경우).
    - 표시 내용: 한 줄 요약(첫 줄) + 선택적으로 `summary` 텍스트.
  - `playerHistory`: 플레이어별 액션·채팅·투표 이력을 묶어서 보여주는 패널.
    - 데이터: `runtime:turn-log` 중 사용자/플레이어 이벤트로 분류되는 엔트리
      (`reason` 에 `"user" / "player" / "chat"` 포함).
    - 표시 내용: 턴 번호, 플레이어 이름(있다면), 첫 줄 텍스트.
  - `heroCard` / `participantCard`: 매칭된 참가자(뷰어/플레이어)를 카드 형태로 보여주는 위젯.
    - 데이터:
      - 기본: `rankContext.viewer`, `rankContext.players[*]` 등 랭크 참가자 정보.
      - 선택적으로 `variables.*` 경로를 통해 훅/런타임이 채운 캐릭터 오브젝트를 사용할 수 있다.
    - 설정 예:
      ```json
      {
        "kind": "heroCard",
        "source": "rank.viewer",
        "variant": "compact"
      }
      {
        "kind": "participantCard",
        "source": "rank.players[0]"
      }
      {
        "kind": "participantCard",
        "source": "variables.scene.mainHero"
      }
      ```
    - `source` 해석 규칙:
      - `"rank.viewer"`: `rankContext.viewer.ownerId` 와 일치하는 `rankContext.players` 항목을 찾아 카드로 출력.
      - `"rank.*"`: `rankContext` 루트에서 바인딩을 해석해 객체를 그대로 카드 입력으로 사용.
      - `"variables.*"`: 마지막 턴의 `variables` 루트에서 바인딩을 해석해 객체를 카드 입력으로 사용.
      - 그 외(`rank.players[0]` 등)는 기본 participants 배열에 인덱스로 접근하는 기존 규칙을 유지한다.
  - `participantCard`: 기존 메인게임의 “참가자 카드/슬롯 상태”를 대체하는 단일 카드 위젯.
    - 데이터: rankContext.viewer / rankContext.players / 슬롯 템플릿.

- 위젯 분할 원칙:
  - “한 위젯 = 한 책임”에 가깝게 쪼갠다.
    - 예: 턴 타임라인, AI 히스토리, 플레이어 히스토리는 각각 별도 `kind` 로 정의.
  - 위젯은 항상 **입력 데이터(standardSlots / rankContext / runtime:turn-log)** 만 읽고,
    내부에서 새로운 상태를 들고 있지 않는다 (필요하면 runtimeBus 이벤트를 사용).
  - 메인게임 전용으로 하드코딩된 JSX는 점차 제거하고,
    동일한 기능을 Shell 위젯으로 옮긴 뒤 `ui.shell.json` 에서 켜도록 한다.

- 설정 방식 (예시 스케치):
  ```json
  {
    "panels": {
      "widgets": {
        "enabled": true,
        "widgets": [
          { "kind": "heroCard", "source": "rank.viewer" },
          { "kind": "turnTimeline", "source": "runtime.turnLog" },
          { "kind": "aiHistory", "source": "runtime.turnLog" },
          { "kind": "playerHistory", "source": "rank.players" }
        ]
      }
    }
  }
  ```

- 컴포넌트 세분화 가이드라인:
  - 새 UI를 추가할 때는 먼저 “데이터 계약(standardSlots / rankContext / 이벤트)”를 정의하고,
    그 위에 **아주 작은 Shell 위젯**으로 구현한다.
  - 하나의 위젯이 복잡해지면:
    - 표시 책임(예: 리스트 렌더링)과
    - 상호작용 책임(예: 필터/탭 전환)을 분리해, 나중에 다른 Shell 위젯에서 재사용할 수 있게 설계한다.
  - 이 원칙에 맞춰 점진적으로 메인게임 기존 UI를 치환해 나간다.

### 부록: Shell 스타일 토큰 확장 (padding / radius / tone / density 외)

- 스타일 토큰은 가능한 한 작게 쪼개서 조합할 수 있게 설계한다.
  - `padding: none|xs|sm|md|lg|xl`
  - `gap: none|xs|sm|md|lg`
  - `radius: none|sm|md|lg|full`
  - `tone: primary|secondary|muted|danger` (+ 선택적 `accentColor` 헥스/색상값)
  - `density: compact|normal|relaxed`
  - `align: start|center|end`
  - `shadow: none|xs|sm|md|lg`
  - `emphasis: normal|strong|muted`
- `uiShellStyle.applyShellStyleProps(styleProps)` 는 위 토큰들을 다음과 같이 매핑한다.
  - padding/gap/radius → padding, gap, borderRadius
  - tone(+accentColor) → background, border
  - density → fontSize 및 padding 미세 조정
  - align → alignSelf
  - shadow → boxShadow
  - emphasis → fontWeight / opacity
- 위 토큰들은 모든 Shell 위젯에서 공통으로 쓸 수 있으며,
  “크기/모양/색/강조 정도”를 토큰 조합으로 표현할 수 있게 하는 것을 목표로 한다
  (완전 자유 좌표/픽셀 기반 배치는 추후 2D/3D 렌더러 영역으로 미룬다).

### 부록: 플래이 디버그 참가자 / API 키

- 텍스트 런타임을 플래이에서 테스트할 때,
  “여러 참가자 + 각자 API 키” 상황을 흉내 내기 위해
  플래이 디버그 패널에서 **참가자 / API 키 리스트**를 임시로 설정할 수 있다.
- 동작 방식:
  - CodeEditorOverlayV2 디버그 패널에
    “디버그 참가자 / API 키” 섹션이 있고,
    - 참가자 추가/삭제 버튼,
    - 참가자별 이름 입력란,
    - 참가자별 API 키 입력란(로컬 디버그 전용, password 필드)을 제공한다.
  - 이 값들은 브라우저 `localStorage` 의
    `playDebug.simUsers@{storageNamespace}` 키에만 저장되며,
    워크스페이스 파일이나 서버(Supabase, Vercel)로는 전송되지 않는다.
- 런타임 변수에서의 표현:
  - 플래이에서 coreRuntime 을 만들 때
    `initialVariables.debug.participants` 로 투영된다.
    ```js
    // variables.debug.participants: [{ name, apiKey }]
    {
      rank: { /* rankDefaults ... */ },
      debug: {
        participants: [
          { name: '테스터 1', apiKey: '...' },
          { name: '테스터 2', apiKey: '...' }
        ]
      }
    }
    ```
  - 훅(`/game/hooks/automation.js`) 이나 향후 GameShell 서비스 코드는
    이 값을 읽어
    - 외부 AI API 호출 시 참가자별 키를 적용하거나,
    - 랭크/메인게임과 비슷한 멀티 유저 시나리오를 플래이에서
      미리 시뮬레이션하는 데 사용할 수 있다.

#### 플레이 디버그 패널 표시

- 디버그 패널의 raw 턴 로그 summary에는 visibility와 apiRouting 요약이 함께 표시된다.
  - `visibility` 문자열이 있으면 `(visibility)`로 함께 표기.
  - `variables.battleLast.apiRouting` 이 있으면 `apiRouting → 참가자이름` 으로 요약을 붙인다.
  - 전체 이벤트는 그대로 JSON으로 펼쳐볼 수 있다.

#### (planned) 슬롯/프롬프트별 API 키 라우팅

- 현재는 `variables.debug.participants` 를 훅에서 직접 사용해야 하지만,
  향후에는 “어떤 프롬프트/슬롯에서 어느 참가자의 키를 쓸지”를
  **계약으로 정의**할 계획이다.
- 개략적인 방향:
  - 프롬프트‑노드/슬롯 설정에
    - `config.apiKeySlot` 또는 비슷한 옵션을 두어
      “이 노드(또는 이 슬롯)는 어느 참가자 슬롯을 대표하는지”를 표시.
  - 런타임/훅에서는:
    - 토큰(`@이름`) 또는 `slotNo` 를 기준으로
      `variables.debug.participants` / 랭크 참가자 풀에서
      하나의 참가자를 선택하고,
    - 그 참가자의 `apiKey` 를 실제 AI 호출에 사용.
  - 이 라우팅 규칙은:
    - 기본 정책(예: `slotNo` 기준, 없으면 랜덤)을 엔진에서 제공하고,
    - 더 복잡한 로직(가중치, 우선순위 등)은
      `/game/hooks/automation.js` 안에서
      사용자 정의 함수로 확장할 수 있게 하는 것을 목표로 한다.

### 부록: 플래이 / 메인게임 / GameShell 구조 – 쉬운 요약

- **엔진은 하나다.**
  - 코드 에디터 “플래이”와 랭크용 메인게임(StartClient)은 모두  
    같은 `coreRuntime` + 같은 그래프(`/graph/prompt-graph.json`) +
    같은 훅(`/game/hooks/automation.js`)을 사용한다.
- **화면 껍데기(GameShell)는 공통이다.**
  - 게임 화면의 상단 제목, 좌우 패널, 로그 패널 등은  
    `/game/ui.shell.json`(또는 템플릿의 `ui_shell`)에 적힌 설정을 읽어서
    `GameShell → MainGameMobileUI` 가 그린다.
  - 장르(텍스트 배틀 등)에 상관없이, “어디에 무엇을 둘지”는 이 셸 설정이 결정한다.
- **데이터는 표준 슬롯 + 턴 로그로 흐른다.**
  - `coreRuntime` 는 매 턴마다 `variables.stats / scene / effects / speaker` 같은
    표준 슬롯을 채우고,
  - 플래이는 이 결과를 `runtime:turn-log` 이벤트로 내보낸 뒤
    (필요하면 `/api/rank/log-turn` 으로도 전달한다),
  - 메인게임은 같은 이벤트/요약 데이터를 받아 Shell 위젯(턴 로그, 히스토리 등)에 뿌린다.
- **프롬프트‑노드 에디터 / 코드 에디터는 “입력면”이다.**
  - 두 에디터는 워크스페이스 파일(`/template.json`, `/graph/*`, `/game/*`)을 수정하는
    도구일 뿐이고, 실제 실행은 항상 위의 공통 엔진 + GameShell을 통해 이루어진다.
  - 따라서 한 번 구조를 잡아두면, 에디터 쪽에서 기능을 추가해도  
    플래이와 메인게임이 같은 엔진/같은 UI 셸 위에서 함께 진화한다.

## 추가 메모: API 키 라우팅
- 텍스트 배틀 흐름에서 라우팅된 API 키는 현재 OpenAI 엔드포인트에만 전달됩니다.
- 다른 프로바이더(Gemini, Claude 등) 키를 함께 쓸 경우 분기 처리가 없어 실패할 수 있으니, 추후 `provider` 필드를 받아 안전하게 분기하거나 OpenAI 전용임을 명시하는 경고를 UI/문서에 추가해야 합니다.

## 부록: Codex 작업/명령 요약

- 환경: Windows `cmd`에서 실행, `danger-full-access`, 네트워크 허용, 승인 정책 `never`(승인 요청 없이 해결). `node` v22.19.0 사용 가능, `python` 없음, `rg` 15.1.0 사용.
- 파일 읽기: 짧은 내용은 `cmd /C "type path\\to\\file"`; 검색은 `rg "pattern" path`; 일부 구간만 볼 때는 Node로 라인 슬라이스 출력:
  - `cmd /C node -e "const fs=require('fs');const l=fs.readFileSync('path','utf8').split(/\\r?\\n/);const s=120,e=160;for(let i=s-1;i<e;i++)console.log((i+1)+':'+l[i]);"` 
- 편집: 수동 변경은 `apply_patch` 사용(ASCII 유지, 불필요한 주석 금지). 자동 생성물/대량 치환은 스크립트·툴을 우선 고려. 사용자 기존 변경은 절대 되돌리지 않음.
- 대용량/이진: 전부 출력하지 않고 `rg`/부분 슬라이스로 확인. 에셋·이진은 내용 열람 안 함.
- 실행/테스트: 필요한 경우에만 스크립트 실행. 실행 전후 어떤 커맨드와 기대 결과인지 보고. 요청 없으면 테스트는 건너뛰고 이유를 명시.
- Git: 기본은 커밋/푸시 안 함. 읽기용 `git status`/`git diff`만 사용하며 강제 리셋(`reset --hard`, `checkout --`) 금지. 커밋 지시 시 메시지/범위 확인 후 진행, amend는 요청 시에만.
- 보고: 변경 경로를 인라인 코드(`ai-roomchat/...`)로 명시하고, 요약→세부→후속 제안 순서. 테스트 미실행 시 이유와 검증 제안 포함.

- turn-log ����ȭ ����: lib/runtime/battleLogSchema.js, lib/runtime/battleLogHelpers.js, components/workspace/hooks/useBattleLogDebug.js
- Play UI: turn-log ��� ��Ʋ �α� ����� ī��, runtime:battle-log �̺�Ʈ�� ȣ��Ʈ/���� �Һ� ����

- runtime:battle-log�� ����/���丮��/�� ����, /api/rank/settle ����
- �α� Ÿ��/���ü�/����Ŀ �ʵ� �ּ� ���� �� ���� �� ����/����� ���͸�
- ��ũ�����̽� ����: workspace/config/ai-actions-allowlist.json�� ����; ����� ����/���� ��ũ��Ʈ, ��Ʋ�α� �����, Ŀ���� ������ �ڻ� ����. �⺻ allowlist�� echo/node/npm/git status/diff ����.

- ��ũ�����̽� ����/���� ��ũ��Ʈ �̱���: battleLog��scores/winners/losers/draw/highlights ��� ����/��� ����
- ��ũ�����̽� �ڻ� ��Ȳ: config/ai-actions-allowlist.json �� ��� ����(���� ��ũ��Ʈ, ��Ʋ�α� ����/��� ���ø� ����)
- �ؾ� �� ��: settle���� ��ũ�����̽� Ŀ���� ��ũ��Ʈ �켱 ���������� �⺻ ����; ��ũ��Ʈ ��ġ/�Է�(battleLog)/���(scores,winners,losers,draw,highlightIds) ��� ����; ����/���ø� �߰�; ���� ������ ����
- workspace/score/score-default.js �߰� (battleLog �Է� �� scores/winners/losers/draw/highlightIds ���), workspace/score/sample-battlelog.json ���� �Է� ����.
- settle API: workspace ���ھ� ��ũ��Ʈ �켱 ����, ���� �� outcome/scoreboard fallback ����(����/��ŷ �ݿ� �̱���).
- settle: battleLog/result�� workspace/score/history/{sessionId}.json ���� ����(����/�ӽ�), ���� ���д� ����.
- ���� ���� ��ǥ: ��ũ�����̽� ��ũ��Ʈ�� ��� �� DB/���丮���� ����(����� workspace/score/history/*.json ���� �ӽ�)
- DB ���� �ʾ�: table battle_history(session_id, game_id, user_id, battle_log(jsonb), result(jsonb), created_at, idx(session_id/game_id/user_id)); API: POST /api/rank/settle -, GET /api/rank/history?sessionId - ����/����/����ŷ �ʼ�.
- battleHistoryStore: env BATTLE_HISTORY_PG_URL ������ Postgres�� ����/��ȸ, ������ workspace/score/history ���� fallback. settle/history API�� ���� ����� ���.
- Postgres ���̱׷��̼� ������ �߰�: supabase/battle_history.sql (battle_history ���̺� + �ε���).
- settle/history API�� x-api-key ��� ��� ���� ���� �߰� (env RANK_API_KEY)
### ����/�����丮 API ��� ���� (dev)
- POST /api/rank/settle (��� x-api-key: $RANK_API_KEY): curl -X POST http://localhost:3000/api/rank/settle -H "Content-Type: application/json" -H "x-api-key: test" --data @workspace/score/sample-battlelog.json
- GET /api/rank/history?sessionId=demo-session (��� x-api-key: $RANK_API_KEY)
- Play UI auto-settle: shellConfig.autoSettle=true and shellConfig.rankApiKey - /api/rank/settle (x-api-key)
- history API: sessionId �ܰ� �Ǵ� gameId ��� ��ȸ ����, Postgres or file fallback ���- history API pagination: gameId ��ȸ �� limit/offset ����(�⺻ 10, max 50), nextOffset ��ȯ
- history API: RANK_STRICT_USER=1�̸� x-user-id�� ������ ����ġ �� 403 (x-api-key ������ ��ȸ)
- battle log �� �� ������ �߰�: /battle-log/[sessionId]���� history API ȣ���� ���̶���Ʈ/��ü �α� ǥ��
