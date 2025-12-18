-- Cleanup helper for stale rank sessions
-- Marks long-lived "active/preparing/ready" sessions as aborted so that
-- matching logic and start-session logic can safely ignore them.

create or replace function public.cleanup_expired_rank_sessions(
  p_cutoff_minutes integer default 1440,
  p_batch_limit integer default 500
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
  v_cutoff timestamptz :=
    now() - make_interval(mins => greatest(0, coalesce(p_cutoff_minutes, 0)));
  v_limit integer := greatest(0, coalesce(p_batch_limit, 0));
begin
  if v_limit is null or v_limit = 0 then
    v_limit := 500;
  end if;

  return query
  with stale as (
    select id, status, updated_at
    from public.rank_sessions
    where status in ('active', 'preparing', 'ready')
      and updated_at < v_cutoff
    order by updated_at asc
    limit v_limit
  ), updated as (
    update public.rank_sessions as s
    set status = 'aborted',
        updated_at = now()
    from stale
    where s.id = stale.id
    returning s.id, stale.status as old_status, s.status as new_status, s.updated_at
  )
  select id, old_status, new_status, updated_at
  from updated;
end;
$$;

grant execute on function public.cleanup_expired_rank_sessions(
  integer,
  integer
) to service_role;

