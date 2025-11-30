# Capability: world.grid.tilemap

> 격자/타일맵 기반 월드(roguelike, tactics, puzzle 등)를 표현하는 capability.
> Status: phase 1 spec complete (reference_data 매핑; world.grid.engine 어댑터는 기본 프리뷰/이동까지 구현, 심화 기능은 이후 단계).

---

## 1. Workspace 계약

- **역할**: “어떤 타일이 어디에 있고, 어떤 유닛/객체가 어떤 규칙으로 움직이는지”를 정의하는 월드 레이어.
- **필수 파일** (capabilityContracts 기준):
  - `/world/tilemap.json`
    - 권장 스키마(예시, 최소 동작 세트):
      ```json
      {
        "width": 40,
        "height": 25,
        "tileSize": 32,
        "layers": [
          {
            "id": "ground",
            "data": [
              [0, 0, 1, 1, 1, 0],
              [0, 0, 1, 2, 1, 0]
            ]
          }
        ],
        "tileset": {
          "0": { "walkable": true },
          "1": { "walkable": false },
          "2": { "walkable": true, "cost": 2 }
        }
      }
      ```
  - `/world/entities.json`
    - 권장 스키마(예시, 최소 동작 세트):
      ```json
      {
        "player": { "id": "player", "x": 1, "y": 1, "kind": "hero", "skin": "hero_knight", "label": "플레이어" },
        "goblin1": { "id": "goblin1", "x": 4, "y": 2, "kind": "mob", "skin": "goblin_green", "hp": 10 }
      }
      ```
- **훅 요구사항** (capabilityContracts 기준):
  - `/game/hooks/automation.js`에서 다음 중 일부/전체를 제공하는 것을 권장:
    - `export function stepSimulation(dt, ctx) { ... }` (선택)
      - 물리/시간 진행, 몬스터 AI 등 “프레임/턴 단위 시뮬레이션”을 수행.
    - `export function applyAction(action, ctx) { ... }` (선택)
      - 플레이어 또는 네트워크에서 들어온 액션(예: `{ type: 'move', dx: 1, dy: 0 }`)을 적용.
  - 여기서 `ctx`는 최소한 다음을 포함하는 방향으로 맞춘다(문서 레벨 설계):
    - `ctx.world.tilemap` – `/world/tilemap.json` 파싱 결과.
    - `ctx.world.entities` – `/world/entities.json` 파싱 결과.
      - 각 엔티티는 최소 `{ id, x, y, kind }` 를 가지며,
        선택적으로 `{ skin, label, ...}` 과 같은 메타데이터를 포함할 수 있다.
    - `ctx.variables` – coreRuntime과 공유하는 상태 (예: 턴 수, 점수, 플래그 등).

---

## 2. 런타임 계약 (world.grid.engine 어댑터)

### 2.1 어댑터 id 및 기본 인터페이스

- **어댑터 id**: `world.grid.engine`
- **초기 구현 위치**: `ai-roomchat/lib/runtime/adapters/worldGridEngine.js`
- **현재 인터페이스 (단순 프리뷰/이동)**:
  - `buildInitialGridState(files)`:
    - `files['/world/tilemap.json'].content`, `files['/world/entities.json'].content`를 읽어 최소 `gridState`를 구성한다.
  - `movePlayerOnGrid(grid, dir)`:
    - `dir`가 `'up' | 'down' | 'left' | 'right'` 중 하나일 때,
    - 첫 번째 `player` 엔티티(`kind: "player"` 또는 `id: "player"`)를 한 칸 이동시킨 새 `gridState`를 반환한다.
    - 맵 밖으로 나가거나 `walkable === false`인 타일로는 이동하지 않는다.
  - `createWorldGridEngine({ files, bus, hooks })`:
    - 내부에 `gridState`를 보관하는 간단한 엔진을 만든다.
    - `hooks` (선택):
      - `/game/hooks/automation.js`에서 로드된 훅 객체를 그대로 넘길 수 있다.
      - `stepSimulation(dt, ctx)`, `applyAction(action, ctx)`가 정의되어 있으면 엔진이 이를 호출한다.
    - 주요 메서드:
      - `getGrid()` – 현재 상태 반환.
      - `setGrid(next)` – 내부 상태를 교체하고, 필요하면 bus에 반영.
      - `movePlayer(dir)` – `movePlayerOnGrid`를 사용해 플레이어를 이동시키고, 변경 내용을 브로드캐스트.
      - `applyAction(action, ctx)` –
        - 먼저 `hooks.applyAction(action, ctx)`가 있으면 호출하고,
        - 반환값에 `grid` 또는 `entities`가 있으면 그 값을 사용해 내부 상태를 갱신한 뒤 브로드캐스트한다.
        - 훅이 없거나 아무 것도 반환하지 않으면, `action.dir / action.direction` 또는 `action.text`에서 방향을 추론해 `movePlayerOnGrid`로 처리한다.
      - `step(dt, ctx)` –
        - `hooks.stepSimulation(dt, ctx)`가 있으면 호출하고,
        - 반환값에 `grid` 또는 `entities`가 있으면 그 값을 사용해 상태를 갱신한 뒤 브로드캐스트한다.
      - `setHooks(nextHooks)` – 런타임 중 훅 집합을 교체할 때 사용.
    - `bus`가 주어지면:
      - 상태가 바뀔 때마다 `bus.emit('world:grid:state', { grid })` 이벤트를 발생시킨다.

### 2.2 향후 확장 목표 (설계 단계)

- `createGridEngine({ tilemap, entities, config })` → `engine` 형태로 일반화:
  - `tilemap`: `/world/tilemap.json`에서 읽은 구조.
  - `entities`: `/world/entities.json`에서 읽은 구조.
  - `config`: `/game/runtime.config.json` 또는 별도 `/world/config.json`에서 읽은 옵션.
- `engine`가 제공해야 할 메서드(예시):
  - `stepSimulation(dt, hooksCtx)`:
    - 내부 상태를 업데이트하고, 필요하면 `stepSimulation(dt, ctx)` 훅을 호출.
  - `applyAction(action, hooksCtx)`:
    - 이동/공격 등 액션을 적용하고, 필요하면 `applyAction(action, ctx)` 훅을 호출.
  - `getState()`:
    - 현재 타일맵/엔티티 상태를 반환 (UI에서 렌더할 수 있도록).
  - 선택 사항:
    - `computeFov(origin, radius)` – 시야/시야각 계산.
    - `findPath(from, to)` – 경로 탐색 (별도 pathfinding 어댑터와 결합 가능).
- **coreRuntime와의 관계**:
  - world.grid.tilemap은 “그래프 위의 한 노드”로도, “독립 월드 엔진”으로도 동작할 수 있다.
    - 간단한 케이스:
      - core.graph는 “스토리 흐름”만 다루고,
      - grid 월드는 하나의 노드에서만 사용되며, `applyAction`/`stepSimulation`은 내부 월드 상태만 바꾼다.
    - 복합 케이스:
      - 월드 상태/플래그에 따라 `selectNext(ctx, neighbors)`에서 다음 노드를 결정하는 구조.

---

## 3. Play overlay 연동 (설계)

- UI capability와 결합:
  - `ui.canvas2d`:
    - `rendererCanvas2D.draw(state)`에서 grid 월드의 타일/엔티티를 렌더.
  - `ui.text`:
    - `transformPrompt(ctx)`에서 월드 상태를 요약한 텍스트(예: “플레이어는 (1,1)에 있고, 고블린이 오른쪽에 있다”)를 만들어 채팅 패널에 표시.
- 입력/턴과 결합:
  - 입력:
    - `input.keyboard` / `input.gamepad` 어댑터가 key/gamepad 이벤트를 `{ type: 'move_up' }` 같은 액션으로 바꿔 `onUserAction` 또는 `applyAction`으로 전달.
  - 턴/타이머:
    - `timing.turns` 어댑터(`createTurnTimer`)가 시간에 따라 `turn:next` 또는 “AI 턴”을 트리거.
- 설계 예시(문서 수준):
  - `PlayOverlayContent`에서:
    - `/world/tilemap.json` / `/world/entities.json`을 파싱해 grid engine을 생성.
    - `runtimeBus` 이벤트를 grid engine과 연결:
      - `player:chat` 또는 별도 `player:action` 이벤트 → `engine.applyAction(...)`.
      - 틱/턴 이벤트 → `engine.stepSimulation(dt, hooksCtx)`.
    - `engine.getState()` 결과를:
      - 캔버스(rendererCanvas2D)와
      - 텍스트 UI(transformPrompt) 모두에 전달할 수 있도록 분리.

---

## 4. reference_data 매핑

world.grid.tilemap는 다음 레퍼런스를 기반으로 설계된다.

- **타일맵/로그라이크 엔진**  
  - `reference_data/rot.js-master/`
    - 맵 생성, FOV(Field of View), 경로 탐색, 턴 기반 전투 등 roguelike 패턴.
    - world.grid.engine의 `computeFov`, `findPath`, 턴 구조 설계에 반영 가능.
- **AI/스티어링/경로 탐색**  
  - `reference_data/yuka-master/`
    - steering/에이전트 AI, 경로/회피 등의 개념을 grid 엔진 위에 얹는 용도로 참고.
  - `reference_data/easystarjs-master/` + `ai-roomchat/lib/runtime/adapters/pathfindingEasystar.js`
    - grid 기반 최단 경로 탐색 패턴을 그대로 가져와 `findPath` 구현에 사용 가능.
- **렌더링/시각화**  
  - `reference_data/phaser-master/`, `reference_data/pixijs-dev/`
    - 타일맵 렌더링, 카메라, 레이어 시스템 패턴.
    - rendererCanvas2D를 확장해 타일맵/엔티티를 그릴 때의 구조를 설계하는 데 참고.

1단계에서는 이 라이브러리들을 **직접 코드 의존성으로 추가하지 않고**,  
world.grid.tilemap capability가 어떤 파일/훅/어댑터/레퍼런스 개념과 연결되는지 문서 레벨에서 먼저 확정해 둔다.
