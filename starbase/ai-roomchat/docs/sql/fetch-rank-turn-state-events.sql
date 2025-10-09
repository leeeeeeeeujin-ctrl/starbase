-- Returns recent turn-state events for a session so clients can backfill
-- missed realtime updates. Deploy via Supabase SQL Editor alongside the
-- rank-turn-realtime-sync bundle.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rank_turn_state_events_turn_check'
      and conrelid = 'public.rank_turn_state_events'::regclass
  ) then
    alter table public.rank_turn_state_events
      add constraint rank_turn_state_events_turn_check
        check (turn_number is null or turn_number >= 0);
  end if;
end;
$$;

create or replace function public.fetch_rank_turn_state_events(
  p_session_id uuid,
  p_since timestamptz default null,
  p_limit integer default 20
)
returns table (
  id bigint,
  session_id uuid,
  turn_number integer,
  state jsonb,
  extras jsonb,
  emitter_id uuid,
  source text,
  emitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if p_session_id is null then
    raise exception 'missing_session_id' using errcode = 'P0001';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 200));

  return query
  select
    e.id,
    e.session_id,
    e.turn_number,
    e.state,
    e.extras,
    e.emitter_id,
    e.source,
    e.emitted_at
  from (
    select
      evt.id,
      evt.session_id,
      evt.turn_number,
      evt.state,
      evt.extras,
      evt.emitter_id,
      evt.source,
      evt.emitted_at
    from public.rank_turn_state_events as evt
    where evt.session_id = p_session_id
      and (p_since is null or evt.emitted_at > p_since)
    order by evt.emitted_at desc, evt.id desc
    limit v_limit
  ) as e
  order by e.emitted_at asc, e.id asc;
end;
$$;

grant execute on function public.fetch_rank_turn_state_events(
  uuid,
  timestamptz,
  integer
) to service_role;
