-- Supabase rank backend upgrade bundle
-- Paste sections into the Supabase SQL editor to provision the remaining tables,
-- policies, triggers, and RPCs that the frontend refactor expects.

-- =========================================
--  Extensions & helper enums
-- =========================================
create extension if not exists "pgcrypto";

-- =========================================
--  Rank session schema upgrades
-- =========================================
alter table public.rank_sessions
  add column if not exists slot_schema_version integer not null default 1,
  add column if not exists slot_schema_updated_at timestamptz not null default now();

create table if not exists public.rank_room_slot_cache (
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  slot_index integer not null,
  role text not null,
  occupant_id uuid references auth.users(id) on delete set null,
  status text not null default 'reserved', -- reserved | confirmed | released
  lock_token uuid not null default gen_random_uuid(),
  version integer not null default 1,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (session_id, slot_index)
);

alter table public.rank_room_slot_cache enable row level security;

create policy if not exists rank_room_slot_cache_service_all
on public.rank_room_slot_cache for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists rank_room_slot_cache_session_idx
  on public.rank_room_slot_cache (session_id);

create table if not exists public.rank_session_meta (
  session_id uuid primary key references public.rank_sessions(id) on delete cascade,
  time_vote jsonb,
  selected_time_limit_seconds integer,
  realtime_mode text default 'off',
  drop_in_bonus_seconds integer default 0,
  async_fill_snapshot jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rank_session_meta enable row level security;

create policy if not exists rank_session_meta_service_all
on public.rank_session_meta for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create table if not exists public.rank_async_fill_queue (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  role text not null,
  candidate_user_id uuid references auth.users(id) on delete set null,
  score_band_min integer,
  score_band_max integer,
  status text not null default 'pending', -- pending | reserved | consumed | cancelled
  inserted_at timestamptz not null default now(),
  reserved_at timestamptz,
  consumed_at timestamptz,
  unique (session_id, role, candidate_user_id)
);

alter table public.rank_async_fill_queue enable row level security;

create policy if not exists rank_async_fill_queue_service_all
on public.rank_async_fill_queue for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists rank_async_fill_queue_lookup_idx
  on public.rank_async_fill_queue (session_id, role, status);

-- =========================================
--  Game & session logging
-- =========================================
create table if not exists public.rank_game_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source text not null default 'system',
  event_type text not null,
  game_id uuid references public.rank_games(id) on delete cascade,
  session_id uuid references public.rank_sessions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  error_code text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.rank_game_logs enable row level security;

create policy if not exists rank_game_logs_service_all
on public.rank_game_logs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists rank_game_logs_session_idx
  on public.rank_game_logs (session_id, created_at desc);

create index if not exists rank_game_logs_event_idx
  on public.rank_game_logs (event_type);

-- =========================================
--  Registration payload validation RPC
-- =========================================
create or replace function public.verify_rank_roles_and_slots(
  p_payload jsonb
)
returns table (
  ok boolean,
  normalized_game jsonb,
  normalized_roles jsonb,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_prompt uuid;
  v_roles jsonb := '[]'::jsonb;
  v_rules jsonb := null;
  v_rules_prefix text := null;
  v_name text := null;
  v_description text := '';
  v_image text := null;
  v_realtime text := 'off';
  v_role jsonb;
  v_sanitized jsonb := '[]'::jsonb;
  v_role_names text[] := array[]::text[];
  v_role_name text;
  v_slot_count integer;
  v_score_min integer;
  v_score_max integer;
  v_rules_raw jsonb;
  v_brawl text;
  v_end_var text;
begin
  v_prompt := nullif(trim(v_payload->>'prompt_set_id'), '')::uuid;
  if v_prompt is null then
    return query select false, null, null, 'prompt_set_required', '프롬프트 세트를 선택하세요.';
    return;
  end if;

  v_name := nullif(trim(coalesce(v_payload->>'name', '')), '');
  v_description := coalesce(v_payload->>'description', '');
  v_image := nullif(trim(coalesce(v_payload->>'image_url', '')), '');
  v_realtime := lower(coalesce(v_payload->>'realtime_match', 'off'));
  if v_realtime not in ('off', 'standard', 'pulse') then
    v_realtime := 'off';
  end if;

  if jsonb_typeof(v_payload->'roles') = 'array' then
    v_roles := v_payload->'roles';
  end if;

  for v_role in select value from jsonb_array_elements(v_roles) as t(value) loop
    v_role_name := coalesce(nullif(trim(v_role->>'name'), ''), '역할');
    v_slot_count := greatest(0, coalesce((v_role->>'slot_count')::integer, 0));
    v_score_min := greatest(0, coalesce((v_role->>'score_delta_min')::integer, 20));
    v_score_max := greatest(v_score_min, coalesce((v_role->>'score_delta_max')::integer, 40));

    if coalesce(v_role_name = any(v_role_names), false) = false then
      v_role_names := array_append(v_role_names, v_role_name);
    end if;

    v_sanitized := v_sanitized || jsonb_build_array(jsonb_build_object(
      'name', v_role_name,
      'slot_count', v_slot_count,
      'score_delta_min', v_score_min,
      'score_delta_max', v_score_max
    ));
  end loop;

  v_rules_raw := v_payload->'rules';
  if jsonb_typeof(v_rules_raw) = 'object' then
    v_rules := v_rules_raw;
    v_brawl := lower(coalesce(v_rules->>'brawl_rule', ''));
    if v_brawl = 'allow-brawl' then
      v_end_var := nullif(trim(coalesce(v_rules->>'end_condition_variable', '')), '');
      if v_end_var is null then
        return query select false, null, null, 'brawl_end_condition_required', '난입 종료 조건을 입력하세요.';
        return;
      end if;
      v_rules := jsonb_set(v_rules, '{end_condition_variable}', to_jsonb(v_end_var));
    end if;
  end if;

  v_rules_prefix := nullif(trim(coalesce(v_payload->>'rules_prefix', '')), '');

  return query select
    true,
    jsonb_build_object(
      'name', coalesce(v_name, '새 게임'),
      'description', v_description,
      'image_url', v_image,
      'prompt_set_id', v_prompt,
      'realtime_match', v_realtime,
      'roles', case when array_length(v_role_names, 1) is null then '[]'::jsonb else to_jsonb(v_role_names)::jsonb end,
      'rules', coalesce(v_rules, to_jsonb(null::text)),
      'rules_prefix', case when v_rules_prefix is null then null else to_jsonb(v_rules_prefix) end
    ),
    v_sanitized,
    null,
    null;
end;
$$;

-- =========================================
--  Session helpers
-- =========================================
create or replace function public.validate_session(
  p_session_id uuid
)
returns table (
  ok boolean,
  session_id uuid,
  game_id uuid,
  status text,
  slot_schema_version integer,
  slot_schema_updated_at timestamptz,
  updated_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
begin
  select s.* into v_session
  from public.rank_sessions s
  where s.id = p_session_id;

  if not found then
    return query select false, null, null, null, null, null, null, 'session_not_found';
    return;
  end if;

  return query select
    true,
    v_session.id,
    v_session.game_id,
    v_session.status,
    v_session.slot_schema_version,
    v_session.slot_schema_updated_at,
    v_session.updated_at,
    null;
end;
$$;

create or replace function public.bump_rank_session_slot_version(
  p_session_id uuid
)
returns table (
  session_id uuid,
  slot_schema_version integer,
  slot_schema_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  update public.rank_sessions
  set
    slot_schema_version = slot_schema_version + 1,
    slot_schema_updated_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into v_row;

  if not found then
    return query select null::uuid, null::integer, null::timestamptz;
  else
    return query select v_row.id, v_row.slot_schema_version, v_row.slot_schema_updated_at;
  end if;
end;
$$;

create or replace function public.claim_rank_room_slot(
  p_session_id uuid,
  p_slot_index integer,
  p_role text,
  p_user_id uuid,
  p_ttl_seconds integer default 45
)
returns table (
  ok boolean,
  lock_token uuid,
  version integer,
  expires_at timestamptz,
  occupant_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expiry timestamptz := v_now + make_interval(secs => greatest(15, coalesce(p_ttl_seconds, 45)));
  v_row public.rank_room_slot_cache%rowtype;
begin
  if p_role is null or length(trim(p_role)) = 0 then
    return query select false, null, null, null, null, 'role_required';
    return;
  end if;

  loop
    begin
      insert into public.rank_room_slot_cache as c (
        session_id, slot_index, role, occupant_id, status, reserved_at, expires_at, lock_token, version
      ) values (
        p_session_id,
        p_slot_index,
        p_role,
        p_user_id,
        'reserved',
        v_now,
        v_expiry,
        gen_random_uuid(),
        1
      )
      on conflict (session_id, slot_index)
      do update set
        role = excluded.role,
        occupant_id = excluded.occupant_id,
        status = 'reserved',
        reserved_at = v_now,
        expires_at = v_expiry,
        lock_token = gen_random_uuid(),
        version = c.version + 1
      where c.expires_at is null or c.expires_at <= v_now or c.occupant_id = p_user_id
      returning * into v_row;

      exit;
    exception
      when unique_violation then
      -- retry if row changed mid-insert
      null;
      when no_data_found then
        return query select false, null, null, null, null, 'slot_locked';
        return;
    end;
  end loop;

  if v_row.session_id is null then
    return query select false, null, null, null, null, 'slot_locked';
  end if;

  return query select true, v_row.lock_token, v_row.version, v_row.expires_at, v_row.occupant_id, null;
end;
$$;

-- =========================================
--  Session meta upsert RPC
-- =========================================
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

create or replace function public.refresh_match_session_async_fill(
  p_session_id uuid,
  p_room_id uuid,
  p_host_role_limit integer default null,
  p_max_queue integer default 3
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
  v_room record;
  v_now timestamptz := now();
  v_epoch_ms bigint := floor(extract(epoch from v_now) * 1000);
  v_mode text;
  v_host_role text;
  v_host_role_key text;
  v_total integer := 0;
  v_allowed integer := 0;
  v_pending_count integer := 0;
  v_queue_limit integer := 0;
  v_assigned jsonb := '[]'::jsonb;
  v_overflow jsonb := '[]'::jsonb;
  v_seat_indexes jsonb := '[]'::jsonb;
  v_pending_indexes jsonb := '[]'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_pool_size integer := 0;
  v_assigned_owner_ids text[] := array[]::text[];
  v_snapshot jsonb := null;
  v_meta record;
begin
  select
    r.id,
    r.game_id,
    r.owner_id,
    coalesce(nullif(lower(trim(r.realtime_mode)), ''), 'off') as realtime_mode,
    coalesce(p_host_role_limit, r.host_role_limit) as host_role_limit
  into v_room
  from public.rank_rooms r
  where r.id = p_room_id
  limit 1;

  if v_room.id is null then
    raise exception 'rank_room_not_found';
  end if;

  v_mode := coalesce(v_room.realtime_mode, 'off');

  if v_mode <> 'off' then
    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', null,
      'seatLimit', jsonb_build_object('allowed', 0, 'total', 0),
      'seatIndexes', '[]'::jsonb,
      'pendingSeatIndexes', '[]'::jsonb,
      'assigned', '[]'::jsonb,
      'overflow', '[]'::jsonb,
      'fillQueue', '[]'::jsonb,
      'poolSize', 0,
      'generatedAt', v_epoch_ms
    );
  else
    select
      coalesce(trim(s.role), '')
    into v_host_role
    from public.rank_room_slots s
    where s.room_id = p_room_id
      and s.occupant_owner_id = v_room.owner_id
    order by s.slot_index
    limit 1;

    if v_host_role is null or v_host_role = '' then
      select coalesce(trim(s.role), '')
      into v_host_role
      from public.rank_room_slots s
      where s.room_id = p_room_id
      order by s.slot_index
      limit 1;
    end if;

    if v_host_role is null or v_host_role = '' then
      v_host_role := '역할 미지정';
    end if;

    v_host_role_key := lower(trim(v_host_role));

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position,
        count(*) over (partition by lower(trim(coalesce(s.role, '')))) as role_total
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select coalesce(max(role_total), 0)
    into v_total
    from host
    where role_key = v_host_role_key;

    if v_total is null then
      v_total := 0;
    end if;

    v_allowed := coalesce(v_room.host_role_limit, p_host_role_limit, 3);
    if v_allowed is null then
      v_allowed := 3;
    end if;
    if v_allowed < 1 then
      v_allowed := 1;
    end if;
    if v_total > 0 and v_allowed > v_total then
      v_allowed := v_total;
    end if;
    if v_total = 0 then
      v_allowed := 0;
    end if;

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position > v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null), '[]'::jsonb),
      coalesce(array_agg(distinct case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is not null then occupant_owner_id::text end), array[]::text[]),
      coalesce(sum(case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null then 1 else 0 end), 0)
    into
      v_assigned,
      v_overflow,
      v_seat_indexes,
      v_pending_indexes,
      v_assigned_owner_ids,
      v_pending_count
    from host;

    if v_assigned_owner_ids is null then
      v_assigned_owner_ids := array[]::text[];
    end if;

    if v_pending_count is null then
      v_pending_count := 0;
    end if;

    v_queue_limit := greatest(v_pending_count, coalesce(p_max_queue, 3));
    if v_queue_limit < 0 then
      v_queue_limit := 0;
    end if;

    select count(*)
    into v_pool_size
    from public.rank_match_queue q
    where q.game_id = v_room.game_id
      and lower(trim(coalesce(q.role, ''))) = v_host_role_key
      and q.status = 'waiting'
      and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
      and (q.owner_id is distinct from v_room.owner_id);

    with queued as (
      select
        q.owner_id,
        q.hero_id,
        h.name as hero_name,
        q.joined_at,
        q.score,
        p.rating,
        p.win_rate,
        p.battles,
        q.status,
        row_number() over (order by q.joined_at) as rn
      from public.rank_match_queue q
      left join public.rank_participants p
        on p.game_id = q.game_id
       and p.owner_id = q.owner_id
      left join public.heroes h
        on h.id = coalesce(q.hero_id, p.hero_id)
      where q.game_id = v_room.game_id
        and lower(trim(coalesce(q.role, ''))) = v_host_role_key
        and q.status = 'waiting'
        and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
        and (q.owner_id is distinct from v_room.owner_id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ownerId', case when owner_id is null then null else owner_id::text end,
      'heroId', case when hero_id is null then null else hero_id::text end,
      'heroName', hero_name,
      'role', v_host_role,
      'score', score,
      'rating', rating,
      'winRate', win_rate,
      'battles', battles,
      'status', status,
      'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
    ) order by rn) filter (where rn <= v_queue_limit), '[]'::jsonb)
    into v_queue
    from queued;

    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', v_host_role,
      'seatLimit', jsonb_build_object('allowed', v_allowed, 'total', v_total),
      'seatIndexes', v_seat_indexes,
      'pendingSeatIndexes', v_pending_indexes,
      'assigned', v_assigned,
      'overflow', v_overflow,
      'fillQueue', v_queue,
      'poolSize', v_pool_size,
      'generatedAt', v_epoch_ms
    );
  end if;

  insert into public.rank_session_meta as m (
    session_id,
    async_fill_snapshot,
    updated_at
  ) values (
    p_session_id,
    v_snapshot,
    v_now
  )
  on conflict (session_id)
  do update set
    async_fill_snapshot = excluded.async_fill_snapshot,
    updated_at = excluded.updated_at
  returning m.*
  into v_meta;

  return query select
    v_meta.session_id,
    v_meta.selected_time_limit_seconds,
    v_meta.time_vote,
    v_meta.drop_in_bonus_seconds,
    v_meta.turn_state,
    v_meta.async_fill_snapshot,
    v_meta.realtime_mode,
    v_meta.updated_at;
end;
$$;

grant execute on function public.refresh_match_session_async_fill(
  uuid,
  uuid,
  integer,
  integer
) to service_role;

-- =========================================
--  Match roster staging RPC
-- =========================================

alter table public.rank_match_roster
  add column if not exists slot_template_version bigint default 0,
  add column if not exists slot_template_source text default 'room-stage',
  add column if not exists slot_template_updated_at timestamptz default now();

update public.rank_match_roster
  set
    slot_template_version = coalesce(slot_template_version, 0),
    slot_template_source = coalesce(nullif(slot_template_source, ''), 'room-stage'),
    slot_template_updated_at = coalesce(slot_template_updated_at, updated_at, now())
where slot_template_version is null
   or slot_template_source is null
   or slot_template_source = ''
   or slot_template_updated_at is null;

alter table public.rank_match_roster
  alter column slot_template_version set default 0,
  alter column slot_template_source set default 'room-stage',
  alter column slot_template_updated_at set default now();

create or replace function public.sync_rank_match_roster(
  p_room_id uuid,
  p_game_id uuid,
  p_match_instance_id uuid,
  p_slot_template_version bigint,
  p_slot_template_source text default null,
  p_slot_template_updated_at timestamptz default null,
  p_roster jsonb
)
returns table (
  inserted_count integer,
  slot_template_version bigint,
  slot_template_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_version bigint := coalesce(p_slot_template_version, (extract(epoch from v_now) * 1000)::bigint);
  v_updated_at timestamptz := coalesce(p_slot_template_updated_at, v_now);
  v_current_version bigint;
begin
  if p_room_id is null or p_game_id is null or p_match_instance_id is null then
    raise exception 'missing_identifiers';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'empty_roster';
  end if;

  select max(slot_template_version)
  into v_current_version
  from public.rank_match_roster
  where room_id = p_room_id;

  if v_current_version is not null and v_version < v_current_version then
    raise exception 'slot_version_conflict';
  end if;

  delete from public.rank_match_roster
  where room_id = p_room_id;

  return query
  with payload as (
    select
      (entry->>'slot_id')::uuid as slot_id,
      coalesce((entry->>'slot_index')::integer, (ord::int - 1)) as slot_index,
      coalesce(nullif(entry->>'role', ''), '역할 미지정') as role,
      (entry->>'owner_id')::uuid as owner_id,
      (entry->>'hero_id')::uuid as hero_id,
      nullif(entry->>'hero_name', '') as hero_name,
      coalesce(entry->'hero_summary', '{}'::jsonb) as hero_summary,
      coalesce((entry->>'ready')::boolean, false) as ready,
      (entry->>'joined_at')::timestamptz as joined_at,
      (entry->>'score')::integer as score,
      (entry->>'rating')::integer as rating,
      (entry->>'battles')::integer as battles,
      (entry->>'win_rate')::numeric as win_rate,
      nullif(entry->>'status', '') as status,
      coalesce((entry->>'standin')::boolean, false) as standin,
      nullif(entry->>'match_source', '') as match_source
    from jsonb_array_elements(p_roster) with ordinality as entries(entry, ord)
  ), inserted as (
    insert into public.rank_match_roster (
      match_instance_id,
      room_id,
      game_id,
      slot_id,
      slot_index,
      role,
      owner_id,
      hero_id,
      hero_name,
      hero_summary,
      ready,
      joined_at,
      score,
      rating,
      battles,
      win_rate,
      status,
      standin,
      match_source,
      slot_template_version,
      slot_template_source,
      slot_template_updated_at,
      created_at,
      updated_at
    )
    select
      p_match_instance_id,
      p_room_id,
      p_game_id,
      payload.slot_id,
      payload.slot_index,
      payload.role,
      payload.owner_id,
      payload.hero_id,
      payload.hero_name,
      payload.hero_summary,
      payload.ready,
      payload.joined_at,
      payload.score,
      payload.rating,
      payload.battles,
      payload.win_rate,
      payload.status,
      payload.standin,
      payload.match_source,
      v_version,
      coalesce(nullif(p_slot_template_source, ''), 'room-stage'),
      v_updated_at,
      v_now,
      v_now
    from payload
    order by payload.slot_index
    returning 1
  )
  select
    (select count(*) from inserted) as inserted_count,
    v_version as slot_template_version,
    v_updated_at as slot_template_updated_at;
end;
$$;

grant execute on function public.sync_rank_match_roster(
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  timestamptz,
  jsonb
) to service_role;

-- =========================================
--  Storage guard rails for rank game covers
-- =========================================
create or replace function public.enforce_rank_game_cover_constraints()
returns trigger
language plpgsql
as $$
declare
  v_mime text := coalesce(new.metadata->>'mimetype', new.metadata->>'contentType', new.content_type);
  v_size bigint := 0;
  v_size_text text;
begin
  if new.bucket_id = 'rank-game-covers' then
    v_size_text := coalesce(new.metadata->>'size', new.metadata->>'size_bytes');
    if v_size_text ~ '^[0-9]+$' then
      v_size := v_size_text::bigint;
    end if;

    if v_size > 3145728 then
      raise exception 'rank_cover_too_large';
    end if;
    if v_mime is null or v_mime not in ('image/png', 'image/jpeg', 'image/webp') then
      raise exception 'rank_cover_invalid_type';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_rank_cover_constraints'
  ) then
    execute 'drop trigger trg_rank_cover_constraints on storage.objects';
  end if;
  execute 'create trigger trg_rank_cover_constraints before insert or update on storage.objects for each row execute function public.enforce_rank_game_cover_constraints()';
end;
$$;

create policy if not exists storage_rank_game_covers_select
on storage.objects for select
using (bucket_id = 'rank-game-covers');

create policy if not exists storage_rank_game_covers_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'rank-game-covers');

create policy if not exists storage_rank_game_covers_update
on storage.objects for update to authenticated
using (bucket_id = 'rank-game-covers')
with check (bucket_id = 'rank-game-covers');

-- Supabase rank game registration RPC
-- Creates register_rank_game so the frontend can submit game metadata,
-- role definitions, and slot templates in a single call. Run this in the
-- Supabase SQL editor (or via `supabase db execute`) to provision the RPC
-- before deploying the revamped registration flow.

create or replace function public.register_rank_game(
  p_owner_id uuid,
  p_game jsonb,
  p_roles jsonb default '[]'::jsonb,
  p_slots jsonb default '[]'::jsonb
)
returns table (
  game_id uuid,
  role_count integer,
  slot_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_role_count integer := 0;
  v_slot_count integer := 0;
  v_roles jsonb := coalesce(p_roles, '[]'::jsonb);
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_now timestamptz := now();
begin
  insert into public.rank_games (
    owner_id,
    name,
    description,
    image_url,
    prompt_set_id,
    realtime_match,
    roles,
    rules,
    rules_prefix,
    created_at,
    updated_at
  ) values (
    p_owner_id,
    nullif(trim(p_game->>'name'), ''),
    nullif(p_game->>'description', ''),
    nullif(p_game->>'image_url', ''),
    nullif(p_game->>'prompt_set_id', '')::uuid,
    nullif(lower(trim(p_game->>'realtime_match')), ''),
    (
      select case when count(*) > 0 then array_agg(role_name) else null end
      from (
        select distinct trim(value)::text as role_name
        from jsonb_array_elements_text(coalesce(p_game->'roles', '[]'::jsonb))
        where trim(value) <> ''
      ) as distinct_roles
    ),
    case when jsonb_typeof(p_game->'rules') in ('object', 'array') then p_game->'rules' else null end,
    nullif(p_game->>'rules_prefix', ''),
    v_now,
    v_now
  )
  returning * into v_game;

  if jsonb_array_length(v_roles) > 0 then
    insert into public.rank_game_roles (
      game_id,
      name,
      slot_count,
      active,
      score_delta_min,
      score_delta_max,
      created_at,
      updated_at
    )
    select
      v_game.id,
      coalesce(nullif(trim(r.name), ''), '역할') as name,
      greatest(coalesce(r.slot_count, 0), 0) as slot_count,
      coalesce(r.active, true) as active,
      greatest(coalesce(r.score_delta_min, 0), 0) as score_delta_min,
      greatest(
        coalesce(r.score_delta_max, coalesce(r.score_delta_min, 0)),
        coalesce(r.score_delta_min, 0)
      ) as score_delta_max,
      v_now,
      v_now
    from jsonb_to_recordset(v_roles) as r (
      name text,
      slot_count integer,
      score_delta_min integer,
      score_delta_max integer,
      active boolean
    );

    get diagnostics v_role_count = row_count;
  end if;

  if jsonb_array_length(v_slots) > 0 then
    insert into public.rank_game_slots as s (
      game_id,
      slot_index,
      role,
      active,
      created_at,
      updated_at
    )
    select
      v_game.id,
      coalesce(r.slot_index, row_number() over (order by r.slot_index nulls last)),
      coalesce(nullif(trim(r.role), ''), '역할'),
      coalesce(r.active, true),
      v_now,
      v_now
    from jsonb_to_recordset(v_slots) as r (
      slot_index integer,
      role text,
      active boolean
    )
    where coalesce(trim(r.role), '') <> ''
    on conflict (game_id, slot_index)
    do update set
      role = excluded.role,
      active = excluded.active,
      updated_at = v_now;

    get diagnostics v_slot_count = row_count;
  end if;

  return query
  select v_game.id, v_role_count, v_slot_count;
end;
$$;

grant execute on function public.register_rank_game(
  uuid,
  jsonb,
  jsonb,
  jsonb
) to service_role;

-- =========================================
--  Grants for RPC usage
-- =========================================
grant execute on function public.verify_rank_roles_and_slots(jsonb) to authenticated;
grant execute on function public.validate_session(uuid) to authenticated;
grant execute on function public.bump_rank_session_slot_version(uuid) to service_role;
grant execute on function public.claim_rank_room_slot(uuid, integer, text, uuid, integer) to service_role;
grant execute on function public.upsert_match_session_meta(uuid, integer, jsonb, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.refresh_match_session_async_fill(uuid, uuid, integer, integer) to service_role;
grant execute on function public.sync_rank_match_roster(uuid, uuid, uuid, bigint, text, timestamptz, jsonb) to service_role;
