# Capability Contracts (게임 기능 계약)

이 문서는 “거의 모든 게임”을 에디터 하나로 만들 수 있게 하기 위해,  
게임을 **기능(capability) 단위**로 쪼개고 각 기능이 요구하는 파일/훅/어댑터를 정의하는 계약을 모아 둔 곳입니다.

자세한 워크스페이스/런타임 구조는 `WORKSPACE_EDITOR_RUNTIME.md`를,  
엔진 어댑터 개념은 `GAME_ADAPTERS.md`를 함께 참고하세요.

---

## 1. Core (필수 코어)

**목표**: 모든 세트가 최소 이 코어만 지키면 “텍스트/턴 기반” 게임으로는 바로 실행 가능하게.

- `core.graph`
  - 필수 파일: `/graph/prompt-graph.json`
  - 계약:
    - `{ nodes: [{ id, type, label }], edges: [{ id, source, target, label }] }`
    - `type`: `'ai' | 'user_action' | 'system' | 'prompt'` (기본값 `'prompt'`)
  - 역할:
    - 런타임이 현재 노드/다음 노드를 결정할 수 있는 최소한의 구조.

- `core.runtimeConfig`
  - 필수 파일: `/game/runtime.config.json`
  - 주요 필드:
    - `version`: number
    - `engine`: `"builtin"` | `"external"` | 기타 엔진 id
    - `mode`: `"turn"` | `"realtime"` | `"solo"` | `"sim"` 등
    - `entryNode`: 시작 노드 id
    - `roles`: `["players", "observers", ...]`
    - `durations`: 턴/라운드 시간 배열
    - (향후) `matchmaking`: { mode, minPlayers, maxPlayers, roles }
  - 역할:
    - 메인게임/매칭이 “이 세트를 어떻게 돌릴지”를 이해하는 계약.

- `core.hooks`
  - 필수 파일: `/game/hooks/automation.js`
  - 필수/권장 시그니처:
    ```js
    export function transformPrompt(ctx) { /* string or { prompt, ui } */ }
    export function onUserAction(ctx, input) { /* next id or { next } */ }
    export function selectNext(ctx, neighbors) { /* id */ }
    // 확장용: onTurnStart, onTick, onMessage 등 추가 가능
    ```
  - `ctx` 예시 필드:
    - `ctx.node`, `ctx.graph`, `ctx.files`, `ctx.runtimeConfig`, `ctx.variables`, `ctx.players`...
  - 역할:
    - “장르 독립적인 상태머신 + 텍스트/액션”을 구현하는 코어.

- `state.turns`
  - 참조 문서: `docs/STATE_AND_TURNS.md`
  - 계약:
    - 턴/라운드/타임아웃/투표에 대한 공통 상태 머신.
  - 역할:
    - 보드게임/마피아/라운드제 등 공통 턴 구조를 하나의 계약으로 묶기.

---

## 2. UI 계층 (표현)

UI는 “어떤 엔진으로 그리는가”와 독립적으로, 다음 두 층으로 나눕니다.

- `ui.text`
  - 기본 텍스트 UI.
  - 계약:
    - `transformPrompt(ctx)` 가 string 또는 `{ prompt, ui }` 를 반환할 때,  
      `prompt` 부분을 텍스트로 렌더링.
  - 사용처:
    - 가장 단순한 텍스트/챗 기반 게임, 로그 기반 RPG 등.

- `ui.canvas2d`
  - 2D 캔버스 UI (엔진 추상화).
  - 어댑터 예시: `lib/game/adapters/exampleAdapter.js` (HTML5 캔버스)
  - 레퍼런스 엔진:
    - `reference_data/engine-main`
    - `reference_data/phaser-master`
    - `reference_data/pixijs-dev`
  - 계약:
    - `/game/runtime.config.json.engine` 이 `"canvas2d"` 또는 특정 엔진 id일 때,
    - `/game/hooks/automation.js` 와 상호 작용하는 렌더/입력 어댑터를 제공.

- `ui.webgl3d`
  - 3D/WebGL UI.
  - 레퍼런스 엔진:
    - `reference_data/three.js-dev`
    - `reference_data/Babylon.js-master`
  - 계약:
    - `GAME_ADAPTERS.md` 의 어댑터 인터페이스(`init/start/stop/update`)를 구현한 JS 파일을 `/game/adapters/**` 아래에 두고,
    - `runtime.config.engine` 또는 별도 설정으로 어떤 어댑터를 사용할지 지정.

- `ui.dynamic`
  - JSON 기반 동적 UI (`/game/pages/**`, 템플릿 · HUD 등).
  - 계약:
    - `/game/pages/index.json` 에 페이지 레지스트리를 두고,
    - 각 페이지는 JSON 스키마 또는 JS `render(ctx)` 를 통해 UI/핸들러를 정의.
  - 레퍼런스:
    - 현재 워크스페이스 기본 템플릿에 포함된 `pages/ui/*.json`, `pages/scripts/*.js`.

---

## 3. 입력 계층 (Input)

기본 개념: 어떤 엔진이든 “입력 → 행동(action)”으로 정규화.

- `input.keyboard`
  - 계약:
    - 키 → 게임 액션 매핑 (`move`, `interact`, `menu`, …).
    - 워크스페이스 파일 예시: `/game/input/keyboard.json` (추가 예정).
  - 레퍼런스:
    - `reference_data/input-remapper-main`
    - `reference_data/kibo-keyboard-master`

- `input.gamepad`
  - 계약:
    - 패드 버튼/스틱 → 액션 매핑.
  - 레퍼런스:
    - `reference_data/gamepad-to-keyboard-mapper-master`

- `input.pointer/touch`
  - 계약:
    - 포인터/터치 → “셀 선택/드래그/화면 회전” 등 액션으로 변환.
  - 레퍼런스:
    - `reference_data/interact.js-main`

이 입력 계약을 잘 잡아두면, 키보드/패드/모바일 터치가 같은 게임 로직 위에서 돌아갈 수 있습니다.

---

## 4. Simulation / World (로직/월드)

게임 장르별로 필요한 시뮬레이션/월드 계층은 다음처럼 나눌 수 있습니다.

- `grid.tilemap`
  - 계약:
    - 격자/타일맵 정의 파일 (`/game/world/tilemap.json` 등) + 이동/충돌 규칙.
  - 레퍼런스:
    - `reference_data/rot.js-master` (로그라이크)
    - `reference_data/yuka-master` (경로/AI)

- `ai.pathfinding`
  - 계약:
    - 맵 + 시작/목표 → 경로를 반환하는 어댑터.
  - 레퍼런스:
    - `reference_data/easystarjs-master`
    - `reference_data/yuka-master`

- `physics.basic`
  - 계약:
    - 간단한 충돌/중력/속도 계산을 담당하는 어댑터.
  - 레퍼런스:
    - `reference_data/three.js-dev` (기본 예제들)
    - 외부 물리 엔진과의 브리지 추가 가능.

- `worker.offthread`
  - 계약:
    - Web Worker 등에 시뮬레이션/AI를 넘겨 계산하는 인터페이스.
  - 레퍼런스:
    - `reference_data/worker-rpc-master`

이 계층은 대부분 `/lib/runtime/adapters/**`와 `/game/**` 파일로 구현되고,  
`runtime.config` 나 별도 설정 파일로 어떤 어댑터를 사용할지 고르게 됩니다.

---

## 5. Network / Realtime / CRDT

멀티플레이/동기화 관련 기능을 묶은 계약입니다.

- `network.socketio`
  - 계약:
    - 서버와의 실시간 메시지 송수신.
    - 세트가 네트워크 이벤트 이름/페이로드를 정의할 수 있는 파일 제공.
  - 레퍼런스:
    - `reference_data/socket.io-main`

- `network.colyseus`
  - 계약:
    - Colyseus 룸/스테이트와의 연결.
  - 레퍼런스:
    - `reference_data/colyseus-master`

- `matchmaking`
  - 계약:
    - `/game/runtime.config.json.matchmaking` 필드로  
      “어떤 매치모드(큐/룸/파티)를 쓸지, 몇 명이 필요한지, 역할은 무엇인지” 정의.
  - 레퍼런스:
    - `docs/match-mode-structure.md`
    - `docs/matchmaking-schema-reference.md`

- `crdt.yjs`
  - 계약:
    - Yjs로 공유 상태를 동기화하는 어댑터.
  - 레퍼런스:
    - `reference_data/yjs-main`

---

## 6. Persistence / Snapshot

게임 진행/리플레이/상태 저장 관련 기능입니다.

- `storage.snapshot`
  - 계약:
    - 세트별 “현재 상태/히스토리 스냅샷” 파일들을 저장/복원하는 어댑터.
  - 레퍼런스:
    - 기존 Rank/게임 세션 스냅샷 문서 (`docs/game-session-store-reference.md` 등).

- `storage.local`
  - 계약:
    - 브라우저 localStorage/IndexedDB 를 이용한 클라이언트 측 캐시.
  - 현재 워크스페이스:
    - drafts/UI 상태를 `localStorage`에 저장하는 구조를 이미 사용 중.

---

## 7. 레퍼런스 데이터 활용 가이드

`/reference_data` 아래에는 각 기능에 대응하는 오픈소스 프로젝트들이 들어 있습니다.

- 예시 매핑:
  - 그래프/상태: `javascript-state-machine`, `machina.js`, `jssm` 등
  - UI/캔버스: `phaser-master`, `pixijs-dev`, `tldraw-main`
  - 3D: `three.js-dev`, `Babylon.js-master`
  - 입력: `input-remapper-main`, `kibo-keyboard-master`, `gamepad-to-keyboard-mapper-master`, `interact.js-main`
  - 네트워크: `socket.io-main`, `colyseus-master`, `open-match2-main`
  - CRDT/동기화: `yjs-main`, `automerge-main`
  - 테스트/도구: `jest-main`, `ava-main`, `mitt-main`, `nanoevents-main`

이 레퍼런스들은 “계약을 어떻게 구현할 수 있는지”를 보여주는 예시로만 사용하고,  
실제 제품 코드에는 계약만 가져오거나, 필요한 부분만 참고해 새로 구현하는 것을 권장합니다.

---

## 8. “거의 모든 게임”을 위한 설계 원칙

1. **기능 단위로 쪼개기**  
   - “장르(슈팅/퍼즐)”가 아니라 “기능(격자, 시야, 경로탐색, 턴, 채팅, 매칭, CRDT)” 기준으로 계약을 정의합니다.

2. **각 기능은 “필요한 파일/훅/어댑터”만 요구**  
   - 예: `grid.tilemap` 이 필요로 하는 건 `/game/world/tilemap.json` + 이동 규칙 훅 정도.

3. **엔진 독립적인 계약**  
   - “Phaser 전용 API”가 아니라 `ui.canvas2d` 같은 추상화 위에 얹어,  
     나중에 Babylon/Three 같은 다른 엔진도 같은 계약으로 묶을 수 있게 합니다.

4. **런타임과 에디터가 같은 계약을 공유**  
   - 에디터에서 보여주는 파일 구조/문서/템플릿이 런타임이 실제로 요구하는 계약과 1:1로 대응되도록 유지합니다.

5. **멀티플레이/매칭은 별도 계층으로 분리**  
   - 게임 로직은 “싱글에서도 돌아가는 상태 머신”으로 두고,  
     매칭/세션/네트워크는 그 위에 얹는 방식으로 설계합니다.

이 문서는 “어떤 기능을 추가하든, 에디터에서 어떤 파일을 어떻게 채우면 되는지”를 정의하는 용도입니다.  
새 기능을 추가할 때마다 여기에 **기능 이름, 필요한 파일/훅/어댑터, 관련 레퍼런스**를 계속 쌓아가면,  
시간이 지날수록 “거의 모든 게임을 만들 수 있는 계약 카탈로그”가 자연스럽게 완성됩니다.

