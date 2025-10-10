-- Supabase rank session meta bundle
-- rank_session_meta table, keep existing installations in sync, and set up the
-- upsert RPC plus the required grants so MatchReadyClient can persist
-- time_vote, selected_time_limit_seconds, and turn_state snapshots.

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

alter table public.rank_session_meta
  alter column updated_at set not null;

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
