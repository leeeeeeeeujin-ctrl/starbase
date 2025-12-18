# Rank Battles 400: `column rank_battles.session_id does not exist`

## 증상

- 랭크 로비나 캐릭터 페이지에서 최근 베틀로그를 불러올 때 콘솔/네트워크에 다음과 같이 표시됩니다.
  - Network:
    - `GET /rest/v1/rank_battles?select=...session_id...` → **400 Bad Request**
  - Console:
    - `[supabase] request failed { code: "42703", message: "column rank_battles.session_id does not exist", ... }`
- `/rank/[id]` 화면 진입 시 최근 전투 목록이 비거나, 클라이언트가 에러를 로그로 남깁니다.

## 원인

- 클라이언트는 `docs/capabilities/persistence.supabase.md`의 계약에 따라
  `rank_battles.session_id :: uuid` 컬럼이 존재한다고 가정하고 `select=id,...,session_id`로 요청합니다.
- 하지만 현재 Supabase DB에는 `session_id` 컬럼이 아직 추가되지 않아,
  Postgres가 `column rank_battles.session_id does not exist` 에러(코드 42703)를 반환합니다.

## 해결 방법

1. Supabase SQL Editor를 열고, 다음 스크립트를 그대로 실행합니다.  
   전체 버전은 `ai-roomchat/docs/sql/rank-battles-session-id.sql`에 있습니다.

   ```sql
   alter table public.rank_battles
     add column if not exists session_id uuid;

   -- 선택 사항: rank_sessions와 FK를 두고 싶다면 활성화
   -- alter table public.rank_battles
   --   add constraint rank_battles_session_fk
   --   foreign key (session_id) references public.rank_sessions(id);

   -- 선택 사항: 세션 단위 조회 최적화
   -- create index if not exists idx_rank_battles_session_id
   --   on public.rank_battles(session_id);
   ```

2. 적용 후 `/rest/v1/rank_battles?...session_id...` 요청이 200으로 내려오고,
   랭크 화면의 최근 베틀로그 리스트가 더 이상 400 에러를 발생시키지 않는지 확인합니다.

## 참고

- 이 컬럼은 "이 배틀이 어느 랭크 세션(battle-log / session-log)에 속하는지"를 연결하기 위한 키입니다.
- 아직 `/battle-log/[sessionId]` 딥링크까지 완전히 배선되지는 않았지만,
  추후 Rank 엔진/베틀로그 UI 리팩터링 시 이 컬럼을 기준으로 세션-배틀 간 연동을 강화할 예정입니다.

