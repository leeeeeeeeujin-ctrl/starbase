-- Supabase rank turn realtime sync bundle
-- Creates an events table that captures every turn state broadcast and wires it
-- into the existing session meta upsert so realtime clients can subscribe to
-- inserts via Supabase Realtime.

create table if not exists public.rank_turn_state_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  turn_number integer,
  state jsonb not null,
  extras jsonb,
  emitter_id uuid,
  source text default 'client',
  emitted_at timestamptz not null default now(),
  constraint rank_turn_state_events_turn_check check (turn_number is null or turn_number >= 0)
);

alter table public.rank_turn_state_events enable row level security;

create policy rank_turn_state_events_service_role on public.rank_turn_state_events
  for all
  using (true)
  with check (true)
  to service_role;

alter publication supabase_realtime add table public.rank_turn_state_events;

grant all on table public.rank_turn_state_events to service_role;
grant usage, select on sequence public.rank_turn_state_events_id_seq to service_role;

create or replace function public.enqueue_rank_turn_state_event(
  p_session_id uuid,
  p_turn_state jsonb,
  p_turn_number integer default null,
  p_source text default null,
  p_emitter uuid default null,
  p_extras jsonb default '{}'::jsonb
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
  v_source text := null;
  v_row public.rank_turn_state_events%rowtype;
begin
  if p_session_id is null then
    raise exception 'missing_session_id' using errcode = 'P0001';
  end if;

  if p_turn_state is null then
    raise exception 'missing_turn_state' using errcode = 'P0001';
  end if;

  v_source := coalesce(nullif(trim(p_source), ''), 'client');

  perform public.upsert_match_session_meta(
    p_session_id,
    null,
    null,
    null,
    p_turn_state,
    null,
    null
  );

  insert into public.rank_turn_state_events as e (
    session_id,
    turn_number,
    state,
    extras,
    emitter_id,
    source
  ) values (
    p_session_id,
    p_turn_number,
    p_turn_state,
    case when p_extras is null then '{}'::jsonb else p_extras end,
    p_emitter,
    v_source
  )
  returning * into v_row;

  return query select
    v_row.id,
    v_row.session_id,
    v_row.turn_number,
    v_row.state,
    v_row.extras,
    v_row.emitter_id,
    v_row.source,
    v_row.emitted_at;
end;
$$;

grant execute on function public.enqueue_rank_turn_state_event(
  uuid,
  jsonb,
  integer,
  text,
  uuid,
  jsonb
) to service_role;

grant execute on function public.enqueue_rank_turn_state_event(
  uuid,
  jsonb,
  integer,
  text,
  uuid,
  jsonb
) to authenticated;
