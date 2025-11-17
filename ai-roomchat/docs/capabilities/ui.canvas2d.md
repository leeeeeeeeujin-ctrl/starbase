# Capability: ui.canvas2d

> 2D 캔버스 기반 렌더링 표면을 제공하는 UI capability.
> Status: phase 1 spec complete (reference_data 매핑; rendererCanvas2D 어댑터 스켈레톤까지 작성, 플레이 오버레이 직접 연동은 이후 단계).

---

## 1. Workspace 계약

- **역할**: 2D 보드/액션/타일 기반 게임의 “화면” 역할을 담당.
- **권장 파일**:
  - `/game/ui/canvas2d.config.json` (선택적)
    - 예시 필드:
      - `backgroundColor`: 기본 배경색.
      - `dpr`: 디바이스 픽셀 비율 (예: 1, 2).
      - `layers`: 앞으로 추가할 레이어/스프라이트 구성 힌트.
- **훅 연계 (추후 확장)**:
  - `core.hooks.transformPrompt(ctx)`가 `{ prompt, ui }` 형태로 반환할 때,
    `ui.canvas2d`가 캔버스에 그릴 상태를 포함하게 할 수 있다.
  - 예: `ui: { canvas2d: { text: 'Stage 1', ... } }`  
    (1단계에서는 “text만 그리는 최소 상태” 정도로 가이드만 문서화).

---

## 2. 런타임 계약

- **어댑터 모듈**:
  - `ai-roomchat/lib/runtime/adapters/rendererCanvas2D.js`
    - `attachCanvas2D(canvas, options?)` → `{ draw(state), resize(w,h), dispose() }`
    - 기본 구현 (skeleton):
      - `draw(state)`:
        - 캔버스 크기를 clientWidth/Height에 맞춰 리사이즈.
        - 배경을 지운 뒤 `"Canvas2D ready"` 텍스트를 그림.
        - `state.text`가 있으면 그 텍스트도 추가로 랜더링.
- **통합 방식(계약)**:
  - Play overlay 또는 `MainGameMobileUI`에서:
    - `DynamicSlot` 또는 별도 컴포넌트 안에 `<canvas>` 엘리먼트를 렌더.
    - 마운트 시 `attachCanvas2D(canvas, { dpr })`를 호출해 renderer를 획득.
    - 런타임/훅에서 전달한 상태(`ui.canvas2d` 등)를 `renderer.draw(state)`에 전달.
    - 언마운트 시 `renderer.dispose()` 호출.

---

## 3. 예상 사용 패턴

- 간단한 예(문서 수준):
  - `/game/ui/canvas2d.config.json`:
    ```json
    {
      "backgroundColor": "#020617",
      "dpr": 2
    }
    ```
  - `/game/hooks/automation.js`의 `transformPrompt`에서:
    ```js
    export function transformPrompt(ctx) {
      const label = String(ctx?.node?.label || '');
      return {
        prompt: label,
        ui: {
          canvas2d: { text: label }
        }
      };
    }
    ```
  - UI 쪽(향후 구현):
    - `system:message`로 텍스트를 채팅에 보여주는 동시에,
    - `ui.canvas2d.text`를 rendererCanvas2D의 `draw(state)`에 넘겨 캔버스에도 표시.

---

## 4. reference_data 매핑

ui.canvas2d는 Canvas API 위에 “엔진 없음” 레이어를 하나 두는 느낌이지만,
실제 게임에서 사용할 때는 아래와 같은 엔진 패턴을 참고한다.

- **Phaser / PixiJS / Three.js 2D**  
  - `reference_data/phaser-master/`
  - `reference_data/pixijs-dev/`
  - `reference_data/three.js-dev/`
  - 사용 아이디어:
    - 현재 skeleton인 `rendererCanvas2D`를 확장해:
      - 간단한 스프라이트/타일맵/카메라 개념을 추가.
      - 향후 `world.grid.tilemap` capability와 결합할 때, 타일맵/엔티티를 그릴 수 있도록 한다.
- **입력/시간/상태 어댑터와의 결합**  
  - 입력: `ai-roomchat/lib/runtime/adapters/inputKeyboard.js`, `inputGamepad.js`
  - 타이머: `ai-roomchat/lib/runtime/adapters/timingTurns.js`
  - 상태/월드: `ai-roomchat/lib/runtime/adapters/pathfindingEasystar.js` (경로 탐색),
    `world.grid.tilemap`(추후 문서/adapter)  
  - 사용 아이디어:
    - 키보드/패드 입력을 `onUserAction` 훅으로 전달해 세계 상태를 업데이트하고,
    - 캔버스 어댑터는 그 상태를 시각화하는 역할만 담당하도록 분리.

1단계에서는 ui.canvas2d를 “rendererCanvas2D 어댑터 + 최소 상태(text) 렌더링” 수준에서 계약으로 정의하고,  
실제 엔진급 기능(타일맵, 스프라이트, 카메라, 이펙트 등)은 이후 단계에서 capability/adapter를 확장하며 붙여 나간다.
