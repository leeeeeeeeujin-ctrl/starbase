-- Supabase rank session ready-check bundle
-- Tracks participant ready signals during the 15-second match launch window
-- and stores an aggregated snapshot inside rank_session_meta.extras.readyCheck
-- so realtime subscribers receive the updates.

create table if not exists public.rank_session_ready_signals (
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  participant_id uuid references public.rank_participants(id) on delete set null,
  game_id uuid references public.rank_games(id) on delete set null,
  match_instance_id uuid,
  pressed_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  window_seconds integer not null default 15,
  metadata jsonb default '{}'::jsonb,
  constraint rank_session_ready_signals_pk primary key (session_id, owner_id)
);

alter table public.rank_session_ready_signals enable row level security;

create policy if not exists rank_session_ready_signals_service_role on public.rank_session_ready_signals
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists rank_session_ready_signals_session_idx
  on public.rank_session_ready_signals (session_id, expires_at desc);

alter publication supabase_realtime add table public.rank_session_ready_signals;

create or replace function public.register_match_ready_signal(
  p_session_id uuid,
  p_owner_id uuid,
  p_game_id uuid default null,
  p_match_instance_id uuid default null,
  p_participant_id uuid default null,
  p_window_seconds integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window integer := greatest(5, least(coalesce(p_window_seconds, 15), 90));
  v_session record;
  v_required_ids uuid[] := array[]::uuid[];
  v_ready_rows record;
  v_ready_ids uuid[] := array[]::uuid[];
  v_missing_ids uuid[] := array[]::uuid[];
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_result jsonb := '{}'::jsonb;
  v_session_meta record;
  v_extras jsonb := '{}'::jsonb;
  v_ready_snapshot jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_ready_count integer := 0;
  v_owner uuid := p_owner_id;
  v_game_id uuid := p_game_id;
begin
  if p_session_id is null then
    raise exception 'missing_session_id' using errcode = 'P0001';
  end if;

  if v_owner is null then
    v_owner := auth.uid();
  end if;

  if v_owner is null then
    raise exception 'missing_owner_id' using errcode = 'P0001';
  end if;

  select *
    into v_session
  from public.rank_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_game_id is null then
    v_game_id := v_session.game_id;
  end if;

  delete from public.rank_session_ready_signals
   where session_id = p_session_id
     and expires_at < v_now;

  insert into public.rank_session_ready_signals as s (
    session_id,
    owner_id,
    participant_id,
    game_id,
    match_instance_id,
    pressed_at,
    expires_at,
    window_seconds,
    metadata
  ) values (
    p_session_id,
    v_owner,
    p_participant_id,
    v_game_id,
    p_match_instance_id,
    v_now,
    v_now + make_interval(secs => v_window),
    v_window,
    jsonb_build_object('source', 'ready-check')
  )
  on conflict (session_id, owner_id)
  do update set
    participant_id = coalesce(p_participant_id, s.participant_id),
    game_id = coalesce(v_game_id, s.game_id),
    match_instance_id = coalesce(p_match_instance_id, s.match_instance_id),
    pressed_at = excluded.pressed_at,
    expires_at = excluded.expires_at,
    window_seconds = excluded.window_seconds,
    metadata = jsonb_build_object('source', 'ready-check');

  if p_match_instance_id is not null then
    select coalesce(array_agg(distinct owner_id) filter (where owner_id is not null), array[]::uuid[])
      into v_required_ids
    from public.rank_match_roster
    where match_instance_id = p_match_instance_id;
  end if;

  if (v_required_ids is null or array_length(v_required_ids, 1) = 0) and v_game_id is not null then
    select coalesce(array_agg(distinct owner_id) filter (where owner_id is not null), array[]::uuid[])
      into v_required_ids
    from public.rank_match_roster
    where game_id = v_game_id;
  end if;

  if (v_required_ids is null or array_length(v_required_ids, 1) = 0) and v_session.owner_id is not null then
    v_required_ids := array[v_session.owner_id];
  end if;

  if v_required_ids is null then
    v_required_ids := array[]::uuid[];
  end if;

  if not v_owner = any(v_required_ids) then
    v_required_ids := array_append(v_required_ids, v_owner);
  end if;

  select array_agg(distinct value) into v_required_ids from unnest(v_required_ids) as value;

  select min(pressed_at), min(expires_at)
    into v_started_at, v_expires_at
  from public.rank_session_ready_signals
  where session_id = p_session_id;

  if v_started_at is null then
    v_started_at := v_now;
    v_expires_at := v_now + make_interval(secs => v_window);
  end if;

  select coalesce(array_agg(owner_id), array[]::uuid[])
    into v_ready_ids
  from (
    select owner_id
    from public.rank_session_ready_signals
    where session_id = p_session_id
    order by pressed_at
  ) as ordered_ready;

  v_total := coalesce(array_length(v_required_ids, 1), 0);

  if v_total > 0 then
    select coalesce(array_agg(value), array[]::uuid[])
      into v_missing_ids
    from unnest(v_required_ids) as value
    where value is distinct from all (coalesce(v_ready_ids, array[]::uuid[]));
  else
    v_missing_ids := array[]::uuid[];
  end if;

  v_ready_count := coalesce(array_length(v_ready_ids, 1), 0);

  select coalesce(jsonb_agg(signal_row), '[]'::jsonb)
    into v_ready_snapshot
  from (
    select jsonb_build_object(
        'ownerId', owner_id,
        'participantId', participant_id,
        'matchInstanceId', match_instance_id,
        'pressedAt', to_char(pressed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'pressedAtMs', floor(extract(epoch from pressed_at) * 1000),
        'expiresAtMs', floor(extract(epoch from expires_at) * 1000)
      ) as signal_row
    from public.rank_session_ready_signals
    where session_id = p_session_id
    order by pressed_at
  ) as ordered_signals;

  v_result := jsonb_build_object(
    'status', case when coalesce(array_length(v_missing_ids, 1), 0) = 0 and v_total > 0 then 'ready' else 'pending' end,
    'windowSeconds', v_window,
    'startedAt', to_char(v_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'startedAtMs', floor(extract(epoch from v_started_at) * 1000),
    'expiresAt', to_char(v_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAtMs', floor(extract(epoch from v_expires_at) * 1000),
    'updatedAtMs', floor(extract(epoch from v_now) * 1000),
    'requiredOwnerIds', coalesce(to_jsonb(v_required_ids), '[]'::jsonb),
    'readyOwnerIds', coalesce(to_jsonb(v_ready_ids), '[]'::jsonb),
    'missingOwnerIds', coalesce(to_jsonb(v_missing_ids), '[]'::jsonb),
    'readyCount', v_ready_count,
    'totalCount', v_total,
    'signals', coalesce(v_ready_snapshot, '[]'::jsonb)
  );

  select *
    into v_session_meta
  from public.rank_session_meta
  where session_id = p_session_id
  for update;

  if not found then
    insert into public.rank_session_meta (session_id, extras, updated_at)
    values (p_session_id, jsonb_build_object('readyCheck', v_result), v_now)
    on conflict (session_id) do update set
      extras = jsonb_set(coalesce(public.rank_session_meta.extras, '{}'::jsonb), '{readyCheck}', v_result, true),
      updated_at = v_now;
  else
    v_extras := coalesce(v_session_meta.extras, '{}'::jsonb);
    v_extras := jsonb_set(v_extras, '{readyCheck}', v_result, true);

    update public.rank_session_meta
       set extras = v_extras,
           updated_at = v_now
     where session_id = p_session_id;
  end if;

  return v_result;
end;
$$;

grant execute on function public.register_match_ready_signal(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) to service_role;

grant execute on function public.register_match_ready_signal(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) to authenticated;
