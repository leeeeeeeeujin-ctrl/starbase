# Rank 게임 백엔드 구현 체크리스트

프론트엔드 리팩토링과 실시간 계획 확장에 맞춰, Supabase·Edge Functions·서버 유틸이 보강해야 할 항목을 모아둔 문서다. 우선순위는 "즉시 대응" → "매칭/방" → "본게임" 순으로 진행하며, 각 항목은 진행 상황에 따라 ✅(완료) / 🔄(진행 중) / ☐(미착수)로 업데이트한다.

> 📦 이번 회차에서는 `docs/supabase-rank-backend-upgrades.sql`에 공통 스키마·RPC·정책 초안을 추가했다. 아래 체크리스트의 🔄 항목은 SQL이 준비되었으며, Supabase에 적용하면 즉시 사용할 수 있다.

## 1. 즉시 대응이 필요한 공통 작업
- ✅ `verify_rank_roles_and_slots` RPC를 추가해 등록·매칭·룸 스테이징에서 동일한 역할/슬롯 검증 로직을 사용하도록 통합했다. 함수 정의는 `docs/sql/verify-rank-roles-and-slots.sql`과 번들 파일에 포함되어 있으며, `/api/rank/register-game`이 배포 여부에 따라 자동으로 호출한다.【F:docs/sql/verify-rank-roles-and-slots.sql†L1-L111】【F:docs/supabase-rank-backend-upgrades.sql†L968-L1059】【F:pages/api/rank/register-game.js†L36-L83】
- ✅ `RoomInitService`가 참조할 `rank_room_slot_cache` 테이블과 행 단위 잠금을 제공하는 RPC를 작성해, 실시간 입장 경쟁 시 슬롯 경합을 방지한다. 슬롯 캐시 테이블과 `claim_rank_room_slot` RPC SQL을 `supabase-rank-session-sync-guide.md`에 스니펫으로 정리했다.【F:docs/supabase-rank-session-sync-guide.md†L55-L111】
- ✅ `validate_session` RPC에 슬롯 버전(`slot_schema_version`)과 타임스탬프를 포함해 GameSession Store가 클라이언트-서버 간 버전 차이를 감지할 수 있게 한다. `rank_sessions` 컬럼 확장과 `validate_session`/`bump_rank_session_slot_version` RPC 교체 SQL을 같은 가이드에 담았다.【F:docs/supabase-rank-session-sync-guide.md†L16-L73】
- 🔄 이미지 업로드 Edge Function에 3MB 용량 제한과 MIME 화이트리스트를 적용해, 프론트의 사전 검증(`RankNewClient` 이미지 검사)과 백엔드 정책을 일치시킨다. `rank-game-covers` 버킷 전용 트리거와 정책을 SQL에 추가했다.
- 🔄 `rank_game_logs`(가칭) 감사 테이블을 확장해 등록/매칭/본게임에서 발생하는 주요 이벤트와 실패 케이스를 모두 기록한다. 감사 테이블과 인덱스, 서비스 롤 정책을 SQL로 마련했다.

## 2. 게임 등록 지원
- 🔄 `register-game` API에서 역할 점수 범위·난입 종료 조건 검증을 RPC에 위임하고, 실패 사유를 프론트에 전달할 수 있도록 오류 코드를 통일한다. 현재는 프론트·API가 `prepareRegistrationPayload` 유틸을 공유하도록 맞춰 1차 동기화를 끝냈으며, 다음 단계로 RPC로 분리하고 에러 코드를 정의해야 한다.【F:lib/rank/registrationValidation.js†L1-L87】【F:pages/api/rank/register-game.js†L1-L120】
- 🔄 프런트가 Supabase 테이블을 직접 호출하지 않도록 `/api/rank/register-game`이 역할·슬롯을 모두 저장하게 전환했으며, `register_rank_game` RPC SQL(`docs/sql/register-rank-game.sql`)을 배포하면 서버에서도 동일한 저장 경로를 사용할 수 있다. 최신 스니펫은 `roles` 컬럼을 `jsonb_agg`로 내보내고, 누락돼 있던 `rank_game_slots_game_id_slot_index_key` 유니크 제약을 자동 생성하므로 타입 불일치·제약 부재 에러 없이 그대로 실행해도 된다.【F:components/rank/RankNewClient.js†L24-L340】【F:pages/api/rank/register-game.js†L1-L120】【F:docs/sql/register-rank-game.sql†L1-L115】
- ☐ 이미지 업로드 재시도 로직과 업로드 실패 원인(용량 초과, 확장자 불일치 등)을 Supabase `storage` 에러 메시지로 구분해 로깅한다.
- ✅ 프롬프트 세트 ID가 삭제된 경우를 대비해 `prompt_set_id` 존재 여부를 등록 API에서 확인하고, 누락 시 `invalid_prompt_set` 오류를 반환하도록 보강했다.【F:pages/api/rank/register-game.js†L38-L64】

## 3. 매칭·방 단계
- ☐ 로비 자동 새로고침에 사용되는 `fetchRoomSummaries` RPC를 보강해, 새 GameSession Store 버전 필드를 반환하고 실시간 채널에서 동일 구조를 공유한다.
- ✅ 방 상세 페이지가 호출하는 `stage-room-match` RPC에 낙관적 락과 슬롯 버전 검증을 도입했다. `docs/sql/sync-rank-match-roster.sql`(또는 번들 파일)의 `sync_rank_match_roster` 함수가 슬롯 버전을 비교하고 충돌 시 `slot_version_conflict` 오류를 반환한다.
- 🔄 비실시간 모드에서 부족 인원을 자동 충원할 때 사용할 `async_fill_queue` 테이블과 관련 RPC를 설계해, 역할군별 좌석 제한과 중복 방지를 서버에서 강제한다. `refresh_match_session_async_fill` RPC가 `rank_room_slots`·`rank_match_queue` 데이터를 이용해 좌석 제한과 대기열을 계산하도록 SQL 스니펫으로 준비되어 있으며(`docs/sql/refresh-match-session-async-fill.sql`), 테이블 영속화 및 Edge Function 연동은 후속 작업으로 남아 있다.【F:docs/sql/refresh-match-session-async-fill.sql†L1-L220】

## 4. 본게임·세션 메타
- ✅ `upsert_match_session_meta`(가칭) RPC를 만들어 제한시간 투표 결과, 난입 보너스 로그, 턴 상태(`turn_state`), 비실시간 자동 충원 히스토리를 한 곳에 저장한다. `refresh_match_session_async_fill` RPC는 좌석 제한·대기열 스냅샷을 계산해 같은 테이블에 저장하도록 확장됐으며, 두 함수 모두 SQL 스니펫으로 제공된다. 빠르게 배포하려면 `docs/sql/upsert-match-session-meta.sql`과 `docs/sql/refresh-match-session-async-fill.sql` 파일을 그대로 붙여넣으면 된다.【F:docs/supabase-rank-session-sync-guide.md†L88-L216】【F:docs/sql/upsert-match-session-meta.sql†L1-L120】【F:docs/sql/refresh-match-session-async-fill.sql†L1-L220】
- ✅ `/api/rank/session-meta`가 `upsert_match_session_meta`와 `enqueue_rank_turn_state_event` RPC를 호출하도록 구성되어, StartClient가 세션 메타와 턴 상태를 서버와 동기화한다. 프런트는 `buildSessionMetaRequest` 유틸을 통해 제한시간·대기열 정보를 정규화하고 이 API를 호출해 즉시 반영한다.【F:pages/api/rank/session-meta.js†L1-L170】【F:components/rank/StartClient/index.js†L1-L260】【F:lib/rank/sessionMetaClient.js†L1-L240】
- 🔄 턴 상태를 실시간으로 브로드캐스트하기 위한 `rank_turn_state_events` 테이블과 `enqueue_rank_turn_state_event` RPC를 배포한다. Supabase Realtime이 테이블 변경을 방송하도록 `docs/sql/rank-turn-realtime-sync.sql`을 실행하면 되고, 세션 메타 upsert와 동일한 트랜잭션에서 턴 스냅샷을 기록한다.【F:docs/sql/rank-turn-realtime-sync.sql†L1-L101】【F:docs/supabase-rank-session-sync-guide.md†L220-L231】
- 🔄 실시간 누락분을 백필하는 `fetch_rank_turn_state_events` RPC를 추가 배포해 채널 복구 시 최대 200개의 이벤트를 시간 순으로 되돌릴 수 있다. SQL 스니펫은 `docs/sql/fetch-rank-turn-state-events.sql`에 정리되어 있으며, `/api/rank/turn-events`가 해당 RPC를 호출하도록 준비됐다.【F:docs/sql/fetch-rank-turn-state-events.sql†L1-L63】【F:docs/supabase-rank-session-sync-guide.md†L233-L249】
- ☐ `start_match` Edge Function에서 위 메타 정보를 불러 `turnTimerService`와 `dropInQueueService`가 동일한 타이머/보너스 값을 받도록 초기화한다.
- ☐ 새로 난입한 참가자에게 30초 보너스를 부여하는 규칙을 서버 타임라인에도 기록해, 클라이언트-서버 타이머 싱크를 검증할 수 있게 한다.

## 5. 관측성 및 후속 작업
- ☐ Supabase에서 테스트 전용 프로젝트/테이블을 분리해 CI 및 스테이징에서 안전하게 RPC와 함수 검증을 수행한다.
- ☐ 비실시간 자동 충원 통계 대시보드를 Supabase SQL View 혹은 Edge Function으로 설계해 운영팀이 활용할 수 있도록 한다.
- ☐ 다국어 전환을 대비해 Rank 등록/매칭과 관련된 시스템 메시지를 `rank_localized_messages` 테이블로 추출하고, 프론트는 키 기반 조회를 사용하도록 바꾼다.

## 6. 진행 메모
- 프론트에서는 등록 폼에 3MB 이미지 제한·미리보기, 난입 종료 조건 필수 검증이 반영되어 있으므로, 백엔드 검증 실패 시 동일한 메시지를 재사용할 수 있도록 오류 코드 매핑이 필요하다.
- GameSession Store 확장 작업(슬롯 버전, 세션 메타 투표)은 프론트 계획 문서(`game-implementation-plan.md`) 5단계와 연동되어 있어, 백엔드가 선행 준비를 마치면 프론트 릴리즈를 단계적으로 전환할 수 있다.
