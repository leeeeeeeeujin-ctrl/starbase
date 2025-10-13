# Onboarding Reading Notes (2025-11-09)

본 문서는 프로젝트 문서들을 빠르게 훑으며 파악한 핵심 개념을 요약해 새 팀원이 동일한 맥락에서 일을 시작할 수 있도록 돕기 위해 작성되었습니다. 향후 추가 학습이 필요하면 각 항목의 링크를 따라가 세부 문서를 참고하세요.

## 1. 개발 환경 및 초기 부트스트랩
- `README.md`는 Pages Router 기반 Next.js 애플리케이션을 로컬에서 띄우는 과정을 안내하고, Google OAuth, Storage 버킷, Realtime 구독까지 한 번에 설정하도록 구성돼 있습니다. Supabase 스키마 초기화 시 `supabase.sql`, `supabase_chat.sql`을 그대로 실행해 테이블과 RLS 정책을 재생성합니다.
- 환경 변수 정리는 `docs/environment-variables.md`에서 공통/민감 항목을 구분하며, 배포 전 점검해야 할 키 값을 강조합니다.

## 2. Supabase 스키마 구조
- `docs/supabase-schema-digest.md`는 테이블·뷰·정책·인덱스를 모두 요약한 최신 다이제스트로, `pgcrypto` 확장 활성화부터 영웅 자산, 프롬프트 세트, 랭크 운영 테이블까지 폭넓게 다룹니다. 각 항목은 원본 SQL의 세부 라인과 매핑돼 있어 빠른 역추적이 가능합니다.
- 매칭 및 랭크 운영과 관련된 핵심 테이블(`rank_match_queue`, `rank_match_roster`, `rank_sessions`, `rank_turns`)은 실시간 드롭인 운영을 위해 상태·동시성 데이터를 DB에 고정하고, 서비스 롤 정책으로 자동화 백엔드만이 행을 갱신할 수 있도록 설계돼 있습니다.

## 3. 매칭 플로우 이해
- `docs/matchmaking_auto_flow_notes.md`는 `AutoMatchProgress`와 `useMatchQueue`가 뷰어/히어로/역할 준비 상태를 검증하고 자동 큐잉을 실행하는 과정을 설명합니다. 페이지 진입 즉시 블로커를 제거하고 조건이 맞으면 `join` 액션을 호출해 `/api/rank/match` RPC를 트리거합니다.
- 문제 해결 시에는 뷰어 토큰, 히어로 선택, 듀오 파티 진입 경로 등 필수 선행 조건을 확인하고, 콘솔 로그로 차단 상태를 추적하는 것이 권장됩니다.

## 4. 메인 엔진과 상태 동기화
- `docs/main-engine-overview.md`는 `StartClient`를 구동하는 상태 머신(`mainGameMachine.js`)과 `useStartClientEngine` 훅을 중심으로, Supabase 스냅샷과 Realtime 이벤트를 통합해 UI 상태를 유지하는 흐름을 정리합니다.
- 상태 리듀서는 `RESET`, `PATCH`, `REPLACE_LOGS`, `APPEND_LOGS` 네 가지 액션을 통해 전투 로그·참가자 리스트·타이머를 관리하며, 실시간 세션 관리자와 드롭인 큐 서비스가 세션 스토리지와 연동돼 재접속 시에도 턴 공유 정보가 유지되도록 합니다.

## 5. 운영 및 모니터링 포인트
- `docs/project-overview.md`는 전체 문서를 섹션별로 안내해 주며, 운영/관리 도구로는 `docs/admin-portal.md`, `docs/rank-api-key-cooldown-monitoring.md`, `docs/slot-sweeper-schedule.md` 등을 우선적으로 참고하도록 유도합니다.
- 랭크 블루프린트 진행 상황과 리스크는 `docs/rank-blueprint-overview.md`와 진행 리포트 시리즈(`docs/rank-blueprint-progress-*.md`)에서 최신 업데이트를 추적할 수 있습니다.

## 6. 메이커 JSON 번들 심화 이해
- `docs/maker-json-schema.md`는 Maker가 내보내는 JSON 번들을 `meta`·`set`·`slots`·`bridges` 네 구역으로 나누어 설명한다. `useMakerHome`은
  `meta.variableRulesVersion`을 검사해 구버전 번들에 재저장을 안내하며, 슬롯·브리지 식별자는 `normalizeSlotPayload()`와 `remapSlotIdFactory()`
  에 의해 새 ID로 정규화된다. Maker 서버 Edge Function을 도입할 때 이 스키마 정의를 그대로 재사용하면 클라이언트/서버 검증 메시지를 맞출 수 있다.
- 신규 슬롯 필드를 추가할 때는 JSON 스키마, `prompt_slots` DDL, Supabase RPC(`insertPromptSetBundle`)의 파라미터를 한 번에 갱신해야 한다. 누락되면
  브리지가 깨지거나 슬롯 정렬이 꼬이므로, SQL 마이그레이션에 `alter table public.prompt_slots add column ...`와 동시 반영이 필요하다.
- `readPromptSetBundle()`과 `insertPromptSetBundle()`이 모두 `sanitizeVariableRules()`와 `normalizeSlotPayload()` 경로를 공유하므로,
  Edge Function/서버리스 계층에서도 동일한 `zod` 스키마 팩토리를 npm 패키지로 분리해 재사용한다. 업로드 직후 `prompt_set_bundle_validate(json)`
  같은 RPC를 호출해 DB에서 2차 검증을 수행하면 Maker UI와 서버 측 검사가 동일한 오류 메시지·필드 포맷을 노출한다.
- 읽기는 `readPromptSetBundle()` RPC가 생성한 최신 번들을 곧바로 캐시에 저장하고, 쓰기는 `insertPromptSetBundle()` RPC의 트랜잭션에 맡겨
  `prompt_sets`/`prompt_slots`/`prompt_bridges`를 동시에 갱신한다. 클라이언트는 업로드/다운로드 스트림만 담당하고, 상태/동시성은 DB 락과
  Realtime 이벤트로 정합성을 유지하는 구성을 목표로 한다.

## 7. 실시간 드롭인 파이프라인 핵심
- `docs/rank-realtime-dropin-blueprint.md`는 `/api/rank/match`가 실시간 난입 대상 탐색 → 표본 축소 → 비실시간 보강 순으로 동작하도록
  `lib/rank/matchingPipeline.js`를 계층화한 과정을 다룬다. 빈 슬롯을 잡는 즉시 `rank_rooms.filled_count`와 큐 상태를 잠그며, 응답에는 `sampleMeta`
  를 포함해 실시간/비실시간 모두 동일한 구조를 유지한다.
- 스키마 필수 변경분: `rank_sessions.rating_hint integer`, `(status, game_id, updated_at desc)` 인덱스, `rank_room_slots`의 `(room_id, role,
  occupant_owner_id)` 인덱스, `rank_participants` 인덱스. 적용되지 않았다면 다음 SQL을 순서대로 실행한다.

```sql
alter table public.rank_sessions add column if not exists rating_hint integer;
create index if not exists rank_sessions_status_game_id_updated_at_idx
  on public.rank_sessions (status, game_id, updated_at desc);
create index if not exists rank_room_slots_room_role_occupant_idx
  on public.rank_room_slots (room_id, role, occupant_owner_id);
create index if not exists rank_participants_game_role_status_updated_idx
  on public.rank_participants (game_id, role, status, updated_at desc);
```

- 드롭인 로그 모니터링을 위해 `rank_matchmaking_logs` 테이블과 서비스 롤 RLS를 준비하고, 관리자 포털 `/api/admin/matchmaking-logs`
  연동 상태를 확인한다. 매치 운영자는 로그 카드에서 드롭인 성공률, 단계별 실패율을 즉시 파악할 수 있어야 한다.

## 8. Realtime 문제 해결 체크리스트
- `docs/realtime-troubleshooting-2025-11-08.md`의 첫 증상은 Supabase Realtime 게시에 전투 관련 테이블이 누락된 경우다. 아래 SQL을 실행해
  테이블을 게시에 추가한 뒤 대시보드에서 Realtime 스위치를 켠다.

```sql
alter publication supabase_realtime add table
  public.rank_match_roster,
  public.rank_sessions,
  public.rank_rooms,
  public.rank_session_meta;
```

- 이미 게시에 포함된 테이블이 있으면 PostgreSQL이 `42710: relation "..." is already member of publication` 오류를 반환한다. 이 경우는 정상
  상태이므로 아래처럼 존재 여부를 먼저 확인하거나, `alter publication` 문을 예외 처리 블록으로 감싼 스크립트를 사용하는 편이 안전하다.

```sql
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_rooms'
  ) then
    alter publication supabase_realtime add table public.rank_rooms;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_match_roster'
  ) then
    alter publication supabase_realtime add table public.rank_match_roster;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_sessions'
  ) then
    alter publication supabase_realtime add table public.rank_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_session_meta'
  ) then
    alter publication supabase_realtime add table public.rank_session_meta;
  end if;
end $$;
```

- 매치 준비 화면의 401 오류는 클라이언트가 Supabase 액세스 토큰 없이 `/api/rank/ready-check`를 호출한 탓이다. `requestMatchReadySignal`
  전에 `supabase.auth.getSession()`을 호출해 토큰을 확보하고 `Authorization` 헤더를 주입해야 한다.
- 실시간 채널/Ready-check가 정상화됐는지는 진단 패널의 구독 상태와 최신 이벤트 타임스탬프로 검증한다. 복구가 지연되면 RLS 정책에
  `enable_realtime` 규칙이 추가되었는지, 서비스 롤 토큰이 만료되지 않았는지 함께 점검한다.

## 9. 큐 자동화 & TTL 유지보수 핵심
- `docs/matchmaking-supabase-handbook.md`는 `rank_match_queue`·`rank_rooms`·`rank_room_slots`·`rank_participants`의 필드, 인덱스, RLS 정책을
  일괄 검토할 수 있게 정리되어 있다. 실시간 큐가 꼬이면 이 문서의 테이블/인덱스/정책 체크리스트를 따라가며 DB 스키마와 서비스 롤 권한을 빠르게 재검증한다.
- `docs/rank-session-ttl-cleanup-cron.md`는 `rank-session-ttl-cleanup` Edge Function을 배포하고 `--schedule` 또는 `supabase functions schedule create`
  명령으로 Cron을 고정하는 방법을 안내한다. 실행 결과는 `rank_game_logs`에서 `session_ttl_cleanup_*` 이벤트로 확인할 수 있으므로, TTL 정리 실패 시 Slack/Webhook 알림을 붙여 즉시 대응한다.
- 자동화 워크로드는 읽기/쓰기 RPC를 짧게 유지하고, 세션 만료·큐 잠금 등 상태 관리는 DB 락·TTL·Realtime 조합으로 수행한다. Edge Function은 `supabase.functions deploy ... --schedule` 구성으로 재배포해도 스케줄이 유지되도록 IaC 스크립트에 포함한다.

## 10. 다음 학습 제안
- Maker Edge Function 도입과 Supabase RPC를 조합해 읽기/쓰기 흐름을 짧고 결정적으로 만드는 방안을 모색할 때, 위 메이커 JSON 스키마와
  Supabase RPC 패턴(`insertPromptSetBundle`, `readPromptSetBundle`)을 참고하라.
- 실시간 큐 튜닝과 운영 자동화를 위해 `docs/matchmaking-supabase-handbook.md`, `docs/rank-session-ttl-cleanup-cron.md` 등 유지보수
  문서를 순차로 읽어 빠진 CRON/락 전략을 보완한다.

- `/rooms/[id]`는 정원이 채워지면 15초 준비 투표를 열고, 착석자 전원이 `occupant_ready`를 누르는 즉시 `stageMatch`가 호출된다. 제한 시간이 끝났는데도 준비하지 않은 슬롯이 있으면 호스트 클라이언트가 해당 자리를 비우고 다음 참가자를 기다리도록 자동화됐다.【F:pages/rooms/[id].js†L2000-L2069】【F:pages/rooms/[id].js†L2506-L2704】
- 매치가 `battle`/`in_progress`로 전환되면 참가자 정리 타이머를 비활성화하고, 비호스트도 방 상태 변화를 감지해 `match-ready` 화면으로 즉시 이동한다. 방과 본게임 간 세션 브리지가 끊기지 않도록 최신 수정 사항을 확인하자.【F:pages/rooms/[id].js†L2236-L2331】【F:pages/rooms/[id].js†L3201-L3336】
- 운영 관점에서는 준비 투표 흐름이 Supabase 테이블(RPC) 기반으로 동작하므로, `rank_room_slots`의 업데이트 이벤트와 `sync-room-counters` RPC가 정상 배포되어 있는지 반드시 점검해야 한다. 투표 타이머가 열리지 않거나 상태가 즉시 battle로 전환되지 않으면 관련 RPC 권한/퍼블리케이션을 재검증하자.【F:pages/rooms/[id].js†L1688-L1999】【F:pages/api/rank/sync-room-counters.js†L1-L176】
- 준비 투표 → 세션 생성 → 난입 메타 동기화를 서버에서도 동일하게 강제하려면 `docs/rank-room-rpc-hardening-plan-2025-11-10.md`를 따라 `assert_room_ready`·`ensure_rank_session_for_room`·`upsert_rank_session_async_fill` RPC를 배포하고 API/클라이언트를 재연동한다.

> 추가로 확인하면 좋을 주제나 최신화해야 할 문서가 생기면 이 노트를 업데이트하거나 `docs/` 디렉터리에 보완 자료를 추가해 주세요.

## 11. Rank Arcade 오버홀
- `/arena/*` 여섯 개 페이지가 방 중심 UI를 대체하며, 큐→준비→세션→정산을 Supabase RPC 기반으로 단순화한다. 새 흐름과 RPC 목록은 `docs/refactor-blueprint-2025-11-12.md`, `docs/arena-rpc-reference-2025-11-12.md`, `docs/arena-supabase-migration-2025-11-12.md`를 참고하라.
- 홈(`/`)은 Rank Arcade 허브로 변경되었고, 기존 방 상세 페이지는 단계적으로 제거 예정이다. 운영/개발자는 이제 큐 티켓과 세션 ID만으로 상태를 추적하면 된다.
