# Capability: core.graph

> Prompt‑graph 정의와 전이(노드/엣지) 구조에 대한 계약.
> Status: phase 1 spec complete (reference_data 매핑 + builtin runtime 연동까지 반영).

---

## 1. Workspace 계약

- **역할**: 게임/플로우의 전체 상태 공간을 “노드 + 엣지” 그래프로 정의.
- **필수 파일**:
  - `/graph/prompt-graph.json`
    - JSON 스키마(요약):
      - `nodes: { id: string, type?: 'ai'|'user_action'|'system', label?: string }[]`
      - `edges: { id?: string, source: string, target: string, label?: string }[]`
- **훅/코드 요구사항**:
  - core.graph 자체는 훅을 요구하지 않음.
  - 단, `core.hooks`와 함께 사용할 때 **노드 id/타입**이 훅 컨텍스트(`ctx.node`)로 전달됨.

---

## 2. 런타임 계약

- **주요 런타임 모듈**:
  - `ai-roomchat/lib/runtime/contracts.js`
    - `Graph`, `GraphNode`, `GraphEdge` typedef 정의.
  - `ai-roomchat/lib/runtime/promptRunner.js`
    - `buildIndex(graph)` → `{ nodesById, outEdges }` 인덱스를 생성.
    - `validateGraph(graph)` → 구조 검증용 문자열 에러 메시지(없으면 `''`).  
  - `ai-roomchat/lib/runtime/coreRuntime.js`
    - `createCoreRuntime({ graph, config, hooks, files })`:
      - 내부에서 `buildIndex(graph)`를 사용해 노드/엣지 인덱스를 유지.
      - `step({ reason, input })` 호출마다 그래프 상에서 다음 노드로 전이.
      - 반환값:
        - `current`: 현재 `GraphNode | null`
        - `turn`: 현재 턴 번호
        - `prompt`: `transformPrompt` 결과 또는 노드 라벨
        - `ui`: `transformPrompt`가 반환한 UI 메타(있다면)
        - `variables`: 런타임 공유 변수 객체
      - `getCurrentWithPrompt()`:
        - 그래프를 전진시키지 않고 **현재 노드 + prompt/UI**를 계산해 반환.
- **전이 규칙(요약)**:
  1. `reason === 'user_action'` 이고 `hooks.onUserAction`가 있으면 → 반환값에서 `next` 후보를 먼저 사용.
  2. 후보가 없고 `hooks.selectNext`가 있으면 → `selectNext(ctx, neighbors)`에서 반환한 id 사용.
  3. 둘 다 없으면 → 현재 노드에서 나가는 첫 번째 엣지의 `target`으로 전이.
  4. 위 조건으로도 전이할 수 없으면 → `current`를 `null`로 두고 “그래프 종료”로 간주.

---

## 3. Play overlay 연동

- 구현 파일: `ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx`
  - `PlayOverlayContent`에서:
    - `/graph/prompt-graph.json`을 읽어 `graph`로 파싱.
    - `/game/runtime.config.json`을 읽어 `config`로 파싱 (`entryNode`, `roles`, `durations` 등).
    - `/game/hooks/automation.js`를 `loadHooksFromSource`로 로드해 `hooks` 객체 생성.
    - `createCoreRuntime({ graph, config, hooks, files })`로 런타임 인스턴스 생성.
    - 런타임에서:
      - `getCurrentWithPrompt()` / `step()` 결과를 받아 `system:message` 이벤트로 `runtimeBus`에 발행.
      - `MainGameMobileUI`가 “AI 게임 채팅” 패널에 이를 표시.

---

## 4. reference_data 매핑

core.graph는 “어디에서나 쓸 수 있는 최소 그래프 인터페이스”를 목표로 하므로, 여러 상태머신/그래프 라이브러리를 참고해 설계되었다.

- **javascript-state-machine 계열**  
  - `reference_data/javascript-state-machine-master*/`  
  - 사용 아이디어:
    - 단순한 `'state' -> 'state'` 전이에 대한 naming/패턴을 참고 (events, transitions).
    - 향후 `GraphEdge`에 `event` 필드를 추가할 때 참조 가능.
- **JSSM / Stateless 등**  
  - `reference_data/jssm-master/`  
  - `reference_data/stateless.js-master/`  
  - 사용 아이디어:
    - 더 복잡한 가드/조건 전이를 `selectNext(ctx, neighbors)` 훅으로 표현할 때,  
      어떤 메타데이터를 노드/엣지에 두면 좋은지 참고.
- **게임 엔진/플로우 레퍼런스**  
  - `reference_data/phaser-master/`, `reference_data/godot-master/`, `reference_data/engine-main/`  
  - 사용 아이디어:
    - “씬 전이 / 스테이트 머신” 구현 패턴에서, prompt-graph 노드/엣지 구조로 가져올 수 있는 부분을 추출.  
    - 예: 타이틀 → 로비 → 인게임 → 결과 화면 같은 전형적인 플로우를, core.graph 기반 세트 예제로 구성.

1단계 목표에서는 **이 라이브러리들을 직접 코딩 의존성으로 삼지 않고**,  
“어떤 개념을 prompt-graph 모델에 어떻게 대응시킬 것인지”를 문서 레벨에서 명확히 해 두는 것을 우선으로 한다.
