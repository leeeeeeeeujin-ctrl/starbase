# Capability: core.hooks

> Prompt‑graph 실행 시 게임 고유 로직을 주입하는 훅 집합.
> Status: phase 1 spec complete (reference_data 매핑 + builtin runtime 연동까지 반영).

---

## 1. Workspace 계약

- **역할**: 그래프 전이/프롬프트 구성/유저 입력 처리 등을 게임별로 커스터마이징.
- **필수 파일**:
  - `/game/hooks/automation.js`
    - ESM 스타일로 함수들을 `export` 하는 스크립트 파일.
- **해야 할 일**:
  - 다음 시그니처 중 필요한 것만 선택적으로 export:
    - `export function onTurnStart(ctx) { ... }`
    - `export function onUserAction(ctx, input) { ... }`
    - `export function transformPrompt(ctx) { ... }`
    - `export function selectNext(ctx, neighbors) { ... }`
  - 여기서 `ctx` 타입은 `ai-roomchat/lib/runtime/contracts.js`의 `HookContext`와 정렬된다:
    - `turn: number` – 현재 턴 번호
    - `activeRole: string` – 현재 활성 역할(예: `"players"`)
    - `variables: Record<string, any>` – 런타임 전체에서 공유되는 가변 상태 객체
    - `node: GraphNode | null` – 현재 노드
    - `files: Record<string, { content: string, readonly?: boolean }>` – VFS 파일 스냅샷

---

## 2. 런타임 계약

- **로더/가드**:
  - `ai-roomchat/lib/runtime/safeEvalHookModule.js`
    - `loadHooksFromSource(source)`:
      - `new Function('exports','module','require', ...)`로 훅 스크립트를 평가.
      - `require`는 막혀 있음(`require()` 호출 시 에러).
      - **지원하는 작성 스타일**
        - CommonJS: `module.exports = { onUserAction, transformPrompt, ... }`.
        - ESM 스타일: `export function onUserAction(...) {}`, `export function transformPrompt(...) {}` 등.
          - 로더가 `export function` / `export const` / `export let` / `export var` 를 내부적으로 제거한 뒤,
            전역 범위에 정의된 `onTurnStart` / `onUserAction` / `transformPrompt` / `selectNext` / `onEnterNode` / `onLeaveNode`
            / `stepSimulation` / `applyAction` 를 자동으로 `module.exports`에 매핑한다.
      - 평가 이후 반환 객체:
        - `onTurnStart`, `onUserAction`, `transformPrompt`, `selectNext`, `onEnterNode`, `onLeaveNode` 중
          실제 함수로 정의된 것만 포함되며, 나머지는 `null` 로 채워진다.
    - `callHookWithTimeout(invoke, timeoutMs)`:
      - 훅을 Promise + 타임아웃 레이스로 감싸서, 지정된 ms 안에 끝나지 않으면 `'hook timeout'` 에러.
  - `ai-roomchat/lib/runtime/coreRuntime.js`
    - `createCoreRuntime({ graph, config, hooks, files })` 내부에서:
      - 공통 `variables` 객체를 생성해 모든 훅 호출에 동일 객체를 넘김.
      - `step({ reason, input })` 시:
        - `callHookWithTimeout`을 사용해 각 훅을 호출.
        - `reason` 값(`'auto' | 'user_action' | 'inspect'`)을 `ctx.reason`에 포함.
    - 훅별 동작:
      - `onUserAction(ctx, input)`:
        - 문자열을 반환하면 → 해당 값을 next node id로 사용.
        - `{ next }` 객체를 반환하면 → `next` 필드를 next node id로 사용.
      - `selectNext(ctx, neighbors)`:
        - 문자열을 반환하면 → 그 id를 next node로 사용.
        - `null`/`undefined` → fallback 규칙(첫 번째 엣지 등)으로 전이.
      - `transformPrompt(ctx)`:
        - 문자열을 반환 → `result.prompt`로 사용.
        - `{ prompt, ui }`를 반환 → prompt/추가 UI 메타로 분리.
        - `null`/`undefined` → 노드 라벨에 기반한 기본 텍스트 사용.

---

## 3. Play overlay 연동

- 구현 파일: `ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx`
  - `PlayOverlayContent`에서:
    - `/game/hooks/automation.js` 내용을 읽어 `hookSrc`로 얻는다.
    - `loadHooksFromSource(hookSrc)`로 훅 객체를 만들고, `createCoreRuntime({ graph, config, hooks, files })`에 전달.
    - `runtime.step(...)` / `runtime.getCurrentWithPrompt()`가 반환하는 `prompt`/`ui`를 `system:message` 이벤트로 `runtimeBus`에 발행.
    - `MainGameMobileUI`가 이를 받아 “AI 게임 채팅” 패널에 표시하고, 필요하면 UI 메타를 사용할 수 있다.

---

## 4. reference_data 매핑

core.hooks는 “게임 로직을 훅으로 주입한다”는 점에서 여러 엔진/프레임워크의 스크립팅/훅 구조와 대응된다.

- **게임 루프/훅 패턴**  
  - `reference_data/phaser-master/`, `reference_data/godot-master/`, `reference_data/engine-main/`  
  - 사용 아이디어:
    - `onTurnStart` ↔ 씬/스테이트의 `create` / `enter` 훅.
    - `onUserAction` ↔ 입력 처리 콜백 (키보드/마우스/네트워크 이벤트 → 추상 action → graphed node).
    - `selectNext` ↔ 상태머신에서 “다음 상태 선택” 로직.
- **대화/텍스트 엔진**  
  - `reference_data/chat-master/`  
  - 사용 아이디어:
    - `transformPrompt`에서 “시스템 메시지 + 유저 발화 + 컨텍스트 파일”을 조합해 프롬프트를 만드는 패턴 참고.
- **AI/스크립팅 런타임**  
  - `reference_data/webcontainer-core-main/`, `reference_data/vscode-main/` 등은
    “사용자 코드/스크립트를 샌드박스에서 실행하는 방식”을 참고하는 용도로 쓴다.

1단계에서는 이 라이브러리 코드를 직접 연결하지 않고,  
어떤 개념을 `onUserAction` / `transformPrompt` / `selectNext` 훅으로 옮겨와야 할지 문서로 먼저 명확히 해 두는 데 집중한다.
