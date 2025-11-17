# Capability: network.realtime

> 실시간 룸/로비 + 상태 동기화를 위한 네트워킹 capability.
> Status: phase 1 spec complete (reference_data 매핑; adapterManager + netSocketIO/netColyseus 스켈레톤까지, 게임 런타임과의 구체적인 메시지 계약은 이후 단계).

---

## 1. Workspace 계약

- **역할**: 매치/룸/세션 계층과 연동해, 여러 플레이어가 같은 세트/게임 상태를 공유할 수 있게 하는 레이어.
- **필수 파일** (capabilityContracts 기준):
  - `/game/network.config.json`
    - 예시 스키마(문서 수준):
      ```json
      {
        "engine": "socketio",
        "url": "https://example.com/realtime",
        "room": "game-1234",
        "tokenSource": "supabase", 
        "channels": {
          "playerAction": "evt:player_action",
          "statePatch": "evt:state_patch"
        }
      }
      ```
    - 최소 필드:
      - `engine`: `"socketio"` | `"colyseus"` | 기타 adapter id.
      - `url`: 서버 엔드포인트.
      - `room`/`matchId`: 참여할 룸/매치 식별자.
- **훅 요구사항** (capabilityContracts 기준):
  - `/game/hooks/automation.js`에서 네트워크 이벤트를 처리하는 훅을 제공할 수 있다:
    - `export function onRoomJoin(player, ctx) { ... }`
    - `export function onRoomLeave(player, ctx) { ... }`
  - 1단계에서는 “훅이 어떤 시점에 어떤 payload를 받는지”까지만 문서로 규정하고,
    실제 호출 타이밍/페이로드 구조는 매치/세션 연동 설계(다른 문서)와 함께 확장한다.

---

## 2. 런타임 계약 (adapterManager + net adapters)

- **어댑터 매니저**:
  - `ai-roomchat/lib/runtime/adapterManager.js`
    - `initAdapters(config = {}, onEvent = () => {})` → `{ net, sync, dispose }`
      - `config.networking`을 읽어 네트워크 어댑터를 선택/초기화.
      - 네트워크 이벤트가 수신되면 `onEvent(evt)`로 전달.
    - `net` 필드(있다면):
      - `emit(type, payload)` – 추상 이벤트 전송.
      - `on(event, fn)` – 네트워크 라이브러리 고유 이벤트에 대한 리스너 등록(선택적).
      - `disconnect()` – 연결 해제.
- **Socket.IO 어댑터**:
  - `ai-roomchat/lib/runtime/adapters/netSocketIO.js`
    - `connectSocketIO(url, { token })` → `SocketClient`
      - `emit(event, payload)`, `on(event, fn)`, `disconnect()` 제공.
  - adapterManager가 사용하는 형태:
    - `config.networking.id === 'socketio'` && `url`이 있을 때:
      - `connectSocketIO(url, { token })` 호출.
      - `sock.on('evt', (evt) => onEvent(evt))`로 추상 이벤트 브리지 구성.
      - `net.emit(type, payload)` → `sock.emit('evt', { type, payload })`로 변환.
- **Colyseus 어댑터**:
  - `ai-roomchat/lib/runtime/adapters/netColyseus.js`
    - `connectColyseus(url)` → `{ join(roomName, payload) }`
  - adapterManager에서는 “기본 클라이언트 래퍼”만 제공하고,
    실제 룸 join/send/receive 패턴은 사용자 훅/런타임 쪽에서 정의하도록 남겨둔다.

---

## 3. Play overlay / 메인 게임 연동 (설계)

1단계에서는 **네트워크 계층 자체의 계약만** 정의해 두고,  
실제 게임 상태/행동과의 매핑은 후속 단계에서 완성한다.

- 연결 수명:
  - Play overlay 또는 메인 게임 런타임 진입 시:
    - `/game/network.config.json`을 읽어 `networking` 설정을 구성.
    - `initAdapters({ networking }, (evt) => { ... })`로 네트워크 어댑터를 초기화.
  - overlay/게임 종료 시:
    - `adapters.dispose()` 호출로 연결/리스너 정리.
- 메시지 흐름(설계 예시):
  - 에디터/런타임 → 네트워크:
    - `runtimeBus` 또는 내부 게임 로직이 `net.emit('player_action', action)` 호출.
    - adapterManager가 `{ type: 'player_action', payload: action }` 형태로 서버에 전달.
  - 네트워크 → 런타임/게임:
    - `onEvent({ type, payload })` 콜백이:
      - `type === 'state_patch'` → 월드/세션 상태를 병합.
      - `type === 'room_event'` → `onRoomJoin` / `onRoomLeave` 훅 호출 트리거.
    - 1단계에서는 이 타입/페이로드 규약을 문서 수준으로만 정의하고, 실제 구현은 매치/세션 런타임과 함께 진행.

---

## 4. matchmaking / Supabase와의 관계

network.realtime capability는 Supabase 기반 매치/룸/세션 스키마와 함께 동작하는 것을 전제로 설계된다.

- 참고 문서:
  - `ai-roomchat/docs/matchmaking-schema-reference.md`
  - `ai-roomchat/docs/game-session-store-reference.md`
  - `ai-roomchat/docs/game-system-refactor-report.md`
- 핵심 아이디어:
  - Supabase 테이블(`rank_rooms`, `rank_room_slots`, `rank_match_queue`, `rank_sessions`, `rank_turns` 등)에
    “지금 어떤 룸/매치에서 어떤 세트가 실행 중인지”가 기록된다.
  - network.realtime 어댑터는 이 정보(예: `match_instance_id`, `room_id`)를 기반으로
    적절한 room/channel로 접속하도록 구성해야 한다.
  - 예:
    - `/game/network.config.json`에 `matchInstanceId`/`roomId`/`gameId` 등을 포함.
    - 서버 측 Socket.IO/Colyseus 핸들러는 이 id들로 방을 구분하고, 동일 match/room에 속한 클라이언트에게만 상태를 브로드캐스트.

1단계에서는 “network.realtime가 어떤 파일/어댑터/DB 개념과 연결되는지”를 문서로 먼저 고정해 두고,  
실제 게임별 프로토콜(이벤트 타입/페이로드 구조)은 매치/세션 런타임 설계와 함께 2단계에서 확장한다.

