# Session meta upsert 400 troubleshooting

## 증상

* 메인 게임 진입 직후 `/api/rank/session-meta` 호출이 500으로 실패하고 클라이언트 콘솔에 `{"error":"upsert_failed","supabaseError":{...}}`가 반복적으로 남습니다.
* Supabase 로그에는 `POST /rest/v1/rpc/upsert_match_session_meta` 요청이 400으로 끝나며, 본문에는 `function upsert_match_session_meta(...) does not exist` 혹은 `column "async_fill_snapshot" does not exist`와 같은 메시지가 기록됩니다.

## 원인

* `upsert_match_session_meta` RPC 또는 `rank_session_meta` 테이블의 최신 컬럼(`async_fill_snapshot`, `realtime_mode`, `drop_in_bonus_seconds`, `updated_at`)이 배포되지 않은 상태에서 새 클라이언트가 최신 페이로드를 전송하면 Supabase가 400 에러를 반환합니다.
* 서비스 롤 키가 존재하더라도, 함수나 컬럼 자체가 없으면 RPC가 실패하고 클라이언트는 `upsert_failed`와 함께 Supabase 에러 본문을 수신합니다.

## 해결 방법

1. **필수 SQL 스니펫 적용** – 다음 스크립트를 Supabase SQL Editor에 그대로 붙여넣어 실행합니다. 전체 버전은 `ai-roomchat/docs/sql/upsert-match-session-meta.sql`과 `ai-roomchat/docs/sql/rank-turn-realtime-sync.sql`에 있습니다.

   ```sql
   -- session meta 테이블 및 RPC 최신화
   create table if not exists public.rank_session_meta (
     session_id uuid primary key references public.rank_sessions(id) on delete cascade,
     time_vote jsonb,
     selected_time_limit_seconds integer,
     realtime_mode text default 'off',
     drop_in_bonus_seconds integer default 0,
     turn_state jsonb,
     async_fill_snapshot jsonb,
     updated_at timestamptz not null default now()
   );

   alter table public.rank_session_meta
     add column if not exists time_vote jsonb,
     add column if not exists selected_time_limit_seconds integer,
     add column if not exists realtime_mode text,
     add column if not exists drop_in_bonus_seconds integer,
     add column if not exists turn_state jsonb,
     add column if not exists async_fill_snapshot jsonb,
     add column if not exists updated_at timestamptz;

   alter table public.rank_session_meta
     alter column realtime_mode set default 'off',
     alter column drop_in_bonus_seconds set default 0,
     alter column updated_at set default now();

   update public.rank_session_meta
      set updated_at = coalesce(updated_at, now()),
          realtime_mode = coalesce(realtime_mode, 'off'),
          drop_in_bonus_seconds = coalesce(drop_in_bonus_seconds, 0)
    where updated_at is null
       or realtime_mode is null
       or drop_in_bonus_seconds is null;

   create or replace function public.upsert_match_session_meta(
     p_session_id uuid,
     p_selected_time_limit integer default null,
     p_time_vote jsonb default null,
     p_drop_in_bonus_seconds integer default 0,
     p_turn_state jsonb default null,
     p_async_fill_snapshot jsonb default null,
     p_realtime_mode text default null
   )
   returns table (
     session_id uuid,
     selected_time_limit_seconds integer,
     time_vote jsonb,
     drop_in_bonus_seconds integer,
     turn_state jsonb,
     async_fill_snapshot jsonb,
     realtime_mode text,
     updated_at timestamptz
   )
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_now timestamptz := now();
     v_mode text;
     v_row record;
   begin
     v_mode := lower(coalesce(p_realtime_mode, 'off'));
     if v_mode not in ('off', 'standard', 'pulse') then
       v_mode := 'off';
     end if;

     insert into public.rank_session_meta as m (
       session_id,
       selected_time_limit_seconds,
       time_vote,
       drop_in_bonus_seconds,
       turn_state,
       async_fill_snapshot,
       realtime_mode,
       updated_at
     ) values (
       p_session_id,
       p_selected_time_limit,
       p_time_vote,
       p_drop_in_bonus_seconds,
       p_turn_state,
       p_async_fill_snapshot,
       v_mode,
       v_now
     )
     on conflict (session_id)
     do update set
       selected_time_limit_seconds = excluded.selected_time_limit_seconds,
       time_vote = excluded.time_vote,
       drop_in_bonus_seconds = excluded.drop_in_bonus_seconds,
       turn_state = excluded.turn_state,
       async_fill_snapshot = excluded.async_fill_snapshot,
       realtime_mode = excluded.realtime_mode,
       updated_at = v_now
     returning * into v_row;

     return query select
       v_row.session_id,
       v_row.selected_time_limit_seconds,
       v_row.time_vote,
       v_row.drop_in_bonus_seconds,
       v_row.turn_state,
       v_row.async_fill_snapshot,
       v_row.realtime_mode,
       v_row.updated_at;
   end;
   $$;

   grant execute on function public.upsert_match_session_meta(
     uuid,
     integer,
     jsonb,
     integer,
     jsonb,
     jsonb,
     text
   ) to service_role;

   grant execute on function public.upsert_match_session_meta(
     uuid,
     integer,
     jsonb,
     integer,
     jsonb,
     jsonb,
     text
   ) to authenticated;
   ```

2. **턴 상태 브로드캐스트 RPC 권한 확인** – 실시간 이벤트를 사용 중이라면 `ai-roomchat/docs/sql/rank-turn-realtime-sync.sql`에 있는 `enqueue_rank_turn_state_event` 함수 정의와 `grant execute ... to authenticated` 구문도 함께 실행합니다.

3. SQL 적용 후 `/api/rank/session-meta`를 다시 호출해 200 응답과 함께 `meta` 필드가 반환되는지 확인합니다.

## 참고 경로

* 전체 스키마/권한 스크립트: `ai-roomchat/docs/sql/upsert-match-session-meta.sql`
* 턴 상태 실시간 동기화 스크립트: `ai-roomchat/docs/sql/rank-turn-realtime-sync.sql`

최신 스크립트를 적용하면 클라이언트가 RPC를 직접 호출하거나 서버 API가 서비스 롤 키를 사용할 때 모두 동일한 스키마로 동작합니다.
