# GameSession Store Reference

본 문서는 매칭 → 방 → 본게임 흐름이 공유하는 GameSession Store(`modules/rank/matchDataStore.js`)의 데이터 모델과 구독 메커니즘을 정리한다. 세션 복원과 실시간 동기화가 확대되면서 필드가 늘어났기 때문에, 각 페이지가 어떤 조합을 사용해야 하는지 명확한 기준이 필요하다.

## 1. 저장 위치와 초기화
- **스토리지 키**: `rank.match.game.{gameId}` 형식의 `sessionStorage` 키를 사용한다. `matchDataStore`는 동일 키로 메모리 캐시(`memoryStore`)를 유지하고, 브라우저 새로고침 시 `sessionStorage` 값으로 복원한다.【F:modules/rank/matchDataStore.js†L6-L91】
- **초기 상태**: `createEmptyState()`는 `participation`·`slotTemplate`·`sessionMeta` 등 모든 서브 객체를 안전한 기본값으로 채워 예기치 않은 `undefined` 접근을 예방한다.【F:modules/rank/matchDataStore.js†L13-L61】

## 2. 핵심 데이터 구조
| 필드 | 설명 | 갱신 타이밍 |
| --- | --- | --- |
| `participation` | `roster`, `heroOptions`, `participantPool`, `heroMap`을 포함한다. 매칭/로비 단계가 Supabase에서 불러온 참가자 정보를 병합할 때 사용한다.【F:modules/rank/matchDataStore.js†L33-L44】 | `/rooms` 로비 로딩, `stage-room-match` API 호출 직후 |
| `slotTemplate` | 슬롯 번호·역할·활성 여부·버전·출처(`source`)를 보관한다. 룸 스테이징과 GameRoomView가 동일 슬롯 버전을 공유하는 기준 스냅샷이다.【F:modules/rank/matchDataStore.js†L18-L32】【F:pages/rooms/[id].js†L385-L475】 | `stage-room-match` 성공 시, 룸 상세 진입 시 캐시 |
| `sessionMeta` | 턴 타이머 투표(`vote`), 확정 시간(`turnTimer`), 드롭인/비실시간 스냅샷(`dropIn`, `asyncFill`), 턴 상태(`turnState`), 추가 정보(`extras`)를 가진다.【F:modules/rank/matchDataStore.js†L21-L32】【F:lib/rank/sessionMetaClient.js†L25-L211】 | MatchReady 투표, StartClient 엔진 동기화, `/api/rank/session-meta` 응답 |
| `postCheck`·`confirmation` | 매칭 완료 후 허브로 이동할 때 상태 메시지·확인 모달을 관리한다. | `stage-room-match` API 호출 결과 |
| `updatedAt` | 최근 변경 시각(ms). 스냅샷 비교 시 신뢰도 기준으로 활용한다. | 모든 `updateEntry()` 호출 | 

## 3. 구독/발행 메커니즘
- `matchDataStore.subscribe(gameId, listener)`는 메모리 캐시에 리스너를 등록하고 즉시 최신 스냅샷을 전달한다. `listener`는 항상 `safeClone()`된 값을 받으므로 직접 변경하면 안 된다.【F:modules/rank/matchDataStore.js†L93-L173】
- `emitUpdate()`는 `updateEntry()`가 호출될 때마다 등록된 리스너를 순회하며 알린다. 구독 해제(`unsubscribe`)를 반드시 호출해 메모리 누수를 막는다.【F:modules/rank/matchDataStore.js†L94-L131】【F:modules/rank/matchDataStore.js†L174-L210】
- MatchReady, StartClient, GameRoomView는 모두 이 구독 모델을 사용해 세션 메타·턴 상태를 수신한다.【F:components/rank/MatchReadyClient.js†L58-L155】【F:components/rank/StartClient/useStartClientEngine.js†L165-L442】

## 4. 세션 메타 구성 흐름
1. **MatchReady 투표**: 준비 화면이 `sessionMeta.vote`를 갱신하고 `/api/rank/session-meta`로 제한 시간 투표와 드롭인 보너스를 업서트한다.【F:components/rank/MatchReadyClient.js†L174-L308】【F:pages/api/rank/session-meta.js†L31-L155】
2. **StartClient 입장**: 엔진이 `loadGameBundle()`로 슬롯 템플릿·참가자 정보를 결합하고, `buildSessionMetaRequest()`로 Supabase 업서트 페이로드를 만든 뒤 저장한다.【F:components/rank/StartClient/useStartClientEngine.js†L283-L620】【F:lib/rank/sessionMetaClient.js†L213-L390】
3. **턴 진행 중 실시간 업데이트**: Realtime 채널이 `rank_turn_state_events` 이벤트를 푸시하면 StartClient가 `fetchTurnStateEvents`를 통해 누락분을 백필하고, `sessionMeta.turnState`와 `extras`를 재계산한다.【F:components/rank/StartClient/index.js†L129-L268】【F:lib/rank/sessionMetaClient.js†L286-L390】
4. **드롭인 도착**: 엔진이 `sessionMeta.dropIn`과 `turnState`를 동시에 갱신해 타임라인·요약 패널이 동일 데이터를 사용하도록 유지한다.【F:components/rank/StartClient/useStartClientEngine.js†L622-L1003】【F:lib/rank/dropInTimeline.js†L12-L137】

## 5. 서버와의 계약
- `/api/rank/session-meta`는 프런트에서 정규화한 `sessionMeta`를 `upsert_match_session_meta`, `enqueue_rank_turn_state_event` RPC에 전달한다.【F:pages/api/rank/session-meta.js†L73-L155】
- `/api/rank/turn-events`는 `fetch_rank_turn_state_events` RPC를 호출해 최근 턴 로그를 가져온다. StartClient는 재접속 시 이 엔드포인트로 누락 이벤트를 보충한다.【F:pages/api/rank/turn-events.js†L20-L112】
- `stage-room-match`는 `sync_rank_match_roster` RPC를 통해 슬롯 템플릿 버전을 검증하며, 성공 시 `matchDataStore`에 `slotTemplate`을 저장한다.【F:pages/api/rank/stage-room-match.js†L40-L137】【F:lib/rank/matchFlow.js†L248-L408】

## 6. 페이지별 참조 요약
| 위치 | 읽는 데이터 | 쓰는 데이터 |
| --- | --- | --- |
| `/rooms/index` | `participation`, `slotTemplate` | `participation`, `matchSnapshot`, `slotTemplate` |
| `MatchReadyClient` | `participation`, `slotTemplate`, `sessionMeta.vote` | `sessionMeta.vote`, `sessionMeta.turnTimer`, `sessionMeta.asyncFill` |
| `StartClient` | `slotTemplate`, `sessionMeta` 전체 | `sessionMeta.turnState`, `sessionMeta.dropIn`, `sessionMeta.asyncFill`, `sessionMeta.extras` |
| `GameRoomView` | `slotTemplate`, `sessionMeta`, `matchSnapshot` | (읽기 전용) |

## 7. 유지보수 체크리스트
- [ ] 새 필드를 추가할 때 `createEmptyState()`와 `safeClone()` 경로를 동시에 갱신했는가?
- [ ] `/api/rank/session-meta` 업서트 페이로드와 Supabase RPC 시그니처가 일치하는가?
- [ ] 리스너를 등록한 컴포넌트가 언마운트 시 `unsubscribe`를 호출하는가?
- [ ] 세션 복원 시 이전 버전 구조를 마이그레이션하는 `upgrade` 블록이 필요한가?

## 8. 참고 자료
- [세션 메타 업서트 SQL](./sql/upsert-match-session-meta.sql)
- [턴 상태 이벤트 브로드캐스트 SQL](./sql/rank-turn-realtime-sync.sql)
- [턴 이벤트 백필 SQL](./sql/fetch-rank-turn-state-events.sql)

---
느낀 점: GameSession Store를 문서화하면서 MatchReady와 StartClient가 공유하는 계약이 명확해져 신규 필드 도입 시 체크해야 할 포인트가 가시화됐다.
추가로 필요한 점: sessionStorage에 쌓인 이력을 주기적으로 청소하는 백그라운드 워커나 TTL 정책을 도입하면 장시간 플레이 세션에서도 스토리지 누적 문제를 줄일 수 있다.
진행사항: GameSession Store의 구조·구독 흐름·서버 계약을 정리한 참조 문서를 추가했다.
