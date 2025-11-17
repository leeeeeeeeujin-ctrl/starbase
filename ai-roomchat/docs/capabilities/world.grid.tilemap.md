# Capability: world.grid.tilemap

> 격자/타일맵 기반 월드(roguelike, tactics, puzzle 등)를 표현하는 capability.
> Status: phase 1 spec complete (reference_data 매핑; world.grid.engine 어댑터는 설계 단계, 실제 구현/연동은 이후 단계).

---

## 1. Workspace 계약

- **역할**: “어떤 타일이 어디에 있고, 어떤 유닛/객체가 어떤 규칙으로 움직이는지”를 정의하는 월드 레이어.
- **필수 파일** (capabilityContracts 기준):
  - `/world/tilemap.json`
    - 권장 스키마(예시):
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
    - 권장 스키마(예시):
      ```json
      {
        "player": { "id": "player", "x": 1, "y": 1, "kind": "hero", "facing": "south" },
        "goblin1": { "id": "goblin1", "x": 4, "y": 2, "kind": "mob", "hp": 10 }
      }
      ```
- **훅 요구사항** (capabilityContracts 기준):
  - `/game/hooks/automation.js`에서 다음 중 일부/전체를 제공하는 것을 권장:
    - `export function stepSimulation(dt, ctx) { ... }`
      - 물리/시간 진행, 몬스터 AI 등 “프레임/턴 단위 시뮬레이션”을 수행.
    - `export function applyAction(action, ctx) { ... }`
      - 플레이어 또는 네트워크에서 들어온 액션(예: `{ type: 'move', dx: 1, dy: 0 }`)을 적용.
  - 여기서 `ctx`는 최소한 다음을 포함하는 방향으로 맞춘다(문서 레벨 설계):
    - `ctx.world.tilemap` – `/world/tilemap.json` 파싱 결과.
    - `ctx.world.entities` – `/world/entities.json` 파싱 결과.
    - `ctx.variables` – coreRuntime과 공유하는 상태 (예: 턴 수, 점수, 플래그 등).

---

## 2. 런타임 계약 (world.grid.engine 어댑터)

- **어댑터 id**: `world.grid.engine`
- **목표 인터페이스 (설계 단계)**:
  - `createGridEngine({ tilemap, entities, config })` → `engine`
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

