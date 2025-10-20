# 방에서 본게임으로 넘어가지 못했던 주요 차단 요인 (2025-11-11)

## 1. 준비 투표 → 스테이징 구간의 서버 검증 부재
- 클라이언트는 `stageMatch` 호출 전에 모든 슬롯이 준비 상태인지 확인하지만, 서버의 `/api/rank/stage-room-match` 엔드포인트는 같은 검증을 수행하지 않아 직접 호출이나 지연된 이벤트가 끼어들면 준비 투표 조건을 우회할 수 있었습니다.
- 서버가 준비 여부를 전혀 보지 않으므로, 대기 중인 인원이 있어도 `sync_rank_match_roster` RPC는 그대로 실행되었고, 이 때문에 일부 참가자는 준비가 끝났다고 표시되지만 실제로는 슬록트 정리가 완료되지 않은 상태에서 매치가 스테이징되었습니다.【F:pages/rooms/[id].js†L2988-L3081】【F:pages/api/rank/stage-room-match.js†L370-L432】
- **대응**: `assert_room_ready` RPC를 호출해 서버에서도 준비 상태를 강제하고, 함수가 배포되어 있지 않으면 명시적인 오류를 반환하도록 했습니다.【F:pages/api/rank/stage-room-match.js†L337-L369】

## 2. 세션 ID 미생성으로 인한 Match Ready 차단
- 방에서 본게임으로 이동하면 `MatchReadyClient`가 세션 ID를 요구해 `ready-check`를 호출하는데, 기존 `/api/rank/stage-room-match`는 세션을 생성하거나 갱신하지 않았습니다.
- 결과적으로 Match Ready 화면은 항상 `missing_session_id` 상태에 머물러 참가자들이 아무리 준비를 눌러도 본게임으로 진입할 수 없었습니다.【F:components/rank/MatchReadyClient.js†L784-L837】【F:pages/api/rank/stage-room-match.js†L432-L492】
- **대응**: 스테이징 직후 `ensure_rank_session_for_room` RPC를 호출해 세션 ID를 만들고, 해당 ID가 없으면 에러로 돌려보내도록 했습니다. 또한 프런트엔드는 응답으로 받은 세션 ID를 `matchDataStore`에 저장해 Match Ready가 즉시 활용할 수 있게 했습니다.【F:pages/api/rank/stage-room-match.js†L432-L492】【F:pages/rooms/[id].js†L3048-L3073】【F:components/rank/MatchReadyClient.js†L140-L210】

## 3. 난입 메타/세션 맥락 손실
- 스테이징 중 자동으로 채운 난입 정보(`asyncFillMeta`)와 준비 투표 결과는 로컬 스토어에만 남고 Supabase에 저장되지 않아, Match Ready가 스냅샷을 다시 읽으면 해당 정보가 사라졌습니다.【F:pages/rooms/[id].js†L3009-L3073】【F:modules/rank/matchRealtimeSync.js†L1265-L1456】
- **대응**: 세션 ID를 확보한 뒤 `upsert_rank_session_async_fill` RPC를 호출하도록 하고, 프런트엔드는 응답 본문을 통해 얻은 세션 ID와 준비 투표 스냅샷을 매치 스토어에 캐싱합니다.【F:pages/api/rank/stage-room-match.js†L494-L523】【F:pages/rooms/[id].js†L3048-L3073】

## 4. Match Ready 초기화 단계의 세션 추적 누락
- `MatchReadyClient`는 저장소에 이미 세션 ID가 들어 있어도 초기화 시점에 값을 버려, 새로고침 직후 `allowStart`가 `false`로 남거나 준비 신호가 `missing sessionId` 오류로 막혔습니다.【F:components/rank/MatchReadyClient.js†L140-L210】【F:components/rank/MatchReadyClient.js†L660-L712】
- **대응**: 초기 스냅샷과 로컬 스토어에서 세션 ID를 회수하고, Match Ready의 시작 조건(`allowStart`)이 세션 ID를 요구하도록 조정했습니다.【F:components/rank/MatchReadyClient.js†L140-L210】【F:components/rank/MatchReadyClient.js†L500-L520】【F:components/rank/MatchReadyClient.js†L700-L712】

## 5. 결론
- 방에서 본게임으로 넘어가지 못한 직접 원인은 **세션 ID가 생성·전파되지 않은 상태에서 Match Ready가 열렸기 때문**이며, 그 배경에는 서버 검증/세션 생성/난입 메타 영속화가 모두 클라이언트 의존으로 남아 있었던 구조적 결함이 있었습니다.
- 이제 `/api/rank/stage-room-match`는 준비 상태를 확인하고, 세션을 강제 생성한 뒤 난입 메타까지 Supabase에 저장합니다. 클라이언트도 응답으로 받은 세션 ID를 즉시 보관해 Match Ready가 정상적으로 시작할 수 있습니다.
- 배포 환경에서는 `assert_room_ready`, `ensure_rank_session_for_room`, `upsert_rank_session_async_fill` 세 RPC와 실행 권한을 반드시 적용해야 합니다.
