-- Supabase rank session snapshot cleanup bundle
-- Removes stale session metadata and historical turn events so the database stays
-- aligned with the client TTL worker. Execute this in the SQL editor or include
-- it in automated migrations.

create or replace function public.cleanup_expired_rank_session_snapshots(
  p_cutoff_minutes integer default 360,
  p_batch_limit integer default 500
)
returns table (
  session_id uuid,
  deleted_meta boolean,
  deleted_turn_events integer,
  last_event_at timestamptz
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

  return query with expired as (
    select m.session_id, m.updated_at
    from public.rank_session_meta as m
    where m.updated_at < v_cutoff
    order by m.updated_at asc
    limit v_limit
  ),
  removed_events as (
    delete from public.rank_turn_state_events as e
    using expired
    where e.session_id = expired.session_id
      and e.emitted_at < v_cutoff
    returning e.session_id, e.emitted_at
  ),
  aggregated_events as (
    select
      r.session_id,
      count(*)::integer as event_count,
      max(r.emitted_at) as last_event_at
    from removed_events as r
    group by r.session_id
  ),
  removed_meta as (
    delete from public.rank_session_meta as m
    using expired
    where m.session_id = expired.session_id
      and m.updated_at < v_cutoff
    returning m.session_id
  )
  select
    expired.session_id,
    removed_meta.session_id is not null as deleted_meta,
    coalesce(aggregated_events.event_count, 0) as deleted_turn_events,
    aggregated_events.last_event_at
  from expired
  left join aggregated_events
    on aggregated_events.session_id = expired.session_id
  left join removed_meta
    on removed_meta.session_id = expired.session_id;
end;
$$;

grant execute on function public.cleanup_expired_rank_session_snapshots(
  integer,
  integer
) to service_role;
