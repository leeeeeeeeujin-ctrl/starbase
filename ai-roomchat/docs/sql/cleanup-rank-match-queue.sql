-- cleanup-rank-match-queue.sql
-- Rank 매칭 큐(ranked_match_queue) 정리용 헬퍼 함수
--
-- 목적:
--   - 오래된 대기열 엔트리(status='waiting')를 'expired' 로 전환
--   - 이미 소비된 매칭 엔트리(status in 'matched','consumed','abandoned')를
--     일정 시간이 지나면 실제로 삭제해 테이블이 비대해지는 것을 방지
--
-- 사용 예:
--   select * from public.cleanup_rank_match_queue();
--   select * from public.cleanup_rank_match_queue(60, 1000);
--
-- 주의:
--   - 이 함수는 "best-effort" 정리 도구다.
--   - 트랜잭션 안에서 대규모 delete 를 실행하므로,
--     운영 환경에서는 배치/관리용 채널에서만 실행하도록 권장한다.

create or replace function public.cleanup_rank_match_queue(
  p_stale_wait_minutes integer default 60,
  p_delete_cutoff_minutes integer default 1440,
  p_batch_limit integer default 1000
)
returns table (
  id uuid,
  old_status text,
  new_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_stale_wait_cutoff timestamptz :=
    v_now - make_interval(mins => greatest(0, coalesce(p_stale_wait_minutes, 0)));
  v_delete_cutoff timestamptz :=
    v_now - make_interval(mins => greatest(0, coalesce(p_delete_cutoff_minutes, 0)));
  v_limit integer := greatest(0, coalesce(p_batch_limit, 0));
begin
  if v_limit is null or v_limit = 0 then
    v_limit := 1000;
  end if;

  -- 1) 오래된 waiting 엔트리를 expired 로 전환
  with stale as (
    select id, status
    from public.rank_match_queue
    where status = 'waiting'
      and updated_at < v_stale_wait_cutoff
    order by updated_at asc
    limit v_limit
  ), updated_wait as (
    update public.rank_match_queue as q
       set status = 'expired',
           updated_at = v_now
      from stale
     where q.id = stale.id
    returning q.id, stale.status as old_status, q.status as new_status, q.updated_at
  )
  select id, old_status, new_status, updated_at
    from updated_wait
  union all
  -- 2) 이미 소비된/매칭된/이탈한 엔트리를 실제로 삭제
  select id, old_status, new_status, updated_at
    from (
      delete from public.rank_match_queue as q
      where q.status in ('matched', 'consumed', 'abandoned', 'expired')
        and q.updated_at < v_delete_cutoff
      returning q.id, q.status as old_status, 'deleted'::text as new_status, v_now as updated_at
    ) as deleted_rows;
end;
$$;

grant execute on function public.cleanup_rank_match_queue(
  integer,
  integer,
  integer
) to service_role;

