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
  p_async_fill_snapshot jsonb default null,
  p_realtime_mode text default null
)
returns table (
  session_id uuid,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  drop_in_bonus_seconds integer,
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
    async_fill_snapshot,
    realtime_mode,
    updated_at
  ) values (
    p_session_id,
    p_selected_time_limit,
    p_time_vote,
    p_drop_in_bonus_seconds,
    p_async_fill_snapshot,
    v_mode,
    v_now
  )
  on conflict (session_id)
  do update set
    selected_time_limit_seconds = excluded.selected_time_limit_seconds,
    time_vote = excluded.time_vote,
    drop_in_bonus_seconds = excluded.drop_in_bonus_seconds,
    async_fill_snapshot = excluded.async_fill_snapshot,
    realtime_mode = excluded.realtime_mode,
    updated_at = v_now
  returning * into v_row;

  return query select
    v_row.session_id,
    v_row.selected_time_limit_seconds,
    v_row.time_vote,
    v_row.drop_in_bonus_seconds,
    v_row.async_fill_snapshot,
    v_row.realtime_mode,
    v_row.updated_at;
end;
$$;

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

-- =========================================
--  Grants for RPC usage
-- =========================================
grant execute on function public.verify_rank_roles_and_slots(jsonb) to authenticated;
grant execute on function public.validate_session(uuid) to authenticated;
grant execute on function public.bump_rank_session_slot_version(uuid) to service_role;
grant execute on function public.claim_rank_room_slot(uuid, integer, text, uuid, integer) to service_role;
grant execute on function public.upsert_match_session_meta(uuid, integer, jsonb, integer, jsonb, text) to service_role;
