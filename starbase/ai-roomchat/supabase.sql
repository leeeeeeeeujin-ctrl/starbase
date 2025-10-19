-- 초기 확장 설정
create extension if not exists "pgcrypto";

create or replace function public.try_cast_uuid(input text)
returns uuid
language plpgsql
immutable
as $$
begin
  if input is null then
    return null;
  end if;

  begin
    return trim(input)::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.is_rank_session_owner_or_roster(
  p_session_id uuid,
  p_owner_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_match_instance uuid := null;
begin
  if p_session_id is null or p_owner_id is null then
    return false;
  end if;

  -- Host check
  if exists (
    select 1
    from public.rank_sessions rs
    where rs.id = p_session_id
      and (rs.owner_id is null or rs.owner_id = p_owner_id)
  ) then
    return true;
  end if;

  select public.try_cast_uuid(
           coalesce(
             rsm.extras->>'matchInstanceId',
             rsm.extras->>'match_instance_id',
             rsm.async_fill_snapshot->>'matchInstanceId',
             rsm.async_fill_snapshot->>'match_instance_id'
           )
         )
    into v_match_instance
  from public.rank_session_meta rsm
  where rsm.session_id = p_session_id
  order by rsm.updated_at desc
  limit 1;

  if v_match_instance is null then
    return false;
  end if;

  return exists (
    select 1
    from public.rank_match_roster rmr
    where rmr.match_instance_id = v_match_instance
      and rmr.owner_id = p_owner_id
  );
end;
$$;

-- =========================================
--  영웅 기본 테이블 및 스토리지 정책
-- =========================================
create table if not exists public.heroes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '' not null,
  ability1 text not null,
  ability2 text not null,
  ability3 text not null,
  ability4 text not null,
  image_url text,
  background_url text,
  bgm_url text,
  bgm_duration_seconds integer,
  bgm_mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.heroes enable row level security;

drop policy if exists heroes_select_owner on public.heroes;
create policy heroes_select_owner
on public.heroes for select using (auth.uid() = owner_id);

drop policy if exists heroes_insert_owner on public.heroes;
create policy heroes_insert_owner
on public.heroes for insert with check (auth.uid() = owner_id);

drop policy if exists heroes_update_owner on public.heroes;
create policy heroes_update_owner
on public.heroes for update using (auth.uid() = owner_id);

drop policy if exists heroes_delete_owner on public.heroes;
create policy heroes_delete_owner
on public.heroes for delete using (auth.uid() = owner_id);

drop view if exists public.rank_heroes;
create view public.rank_heroes as
select * from public.heroes;

grant select on public.rank_heroes to authenticated;
grant select on public.rank_heroes to anon;

-- 스토리지 버킷 'heroes' 접근 정책
drop policy if exists storage_heroes_select on storage.objects;
create policy storage_heroes_select
on storage.objects for select
using (bucket_id = 'heroes');

drop policy if exists storage_heroes_insert on storage.objects;
create policy storage_heroes_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'heroes');

drop policy if exists storage_heroes_update on storage.objects;
create policy storage_heroes_update
on storage.objects for update to authenticated
using (bucket_id = 'heroes')
with check (bucket_id = 'heroes');

drop policy if exists storage_title_backgrounds_select on storage.objects;
create policy storage_title_backgrounds_select
on storage.objects for select
using (bucket_id = 'title-backgrounds');

drop policy if exists storage_title_backgrounds_insert on storage.objects;
create policy storage_title_backgrounds_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'title-backgrounds' and auth.role() = 'service_role');

drop policy if exists storage_title_backgrounds_update on storage.objects;
create policy storage_title_backgrounds_update
on storage.objects for update to authenticated
using (bucket_id = 'title-backgrounds' and auth.role() = 'service_role')
with check (bucket_id = 'title-backgrounds' and auth.role() = 'service_role');

-- =========================================
--  프롬프트 제작 도구 (Maker)
-- =========================================
create table if not exists public.prompt_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '새 세트',
  description text default '' not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_sets enable row level security;

drop policy if exists prompt_sets_select on public.prompt_sets;
create policy prompt_sets_select
on public.prompt_sets for select using (auth.uid() = owner_id or is_public);

drop policy if exists prompt_sets_insert on public.prompt_sets;
create policy prompt_sets_insert
on public.prompt_sets for insert with check (auth.uid() = owner_id);

drop policy if exists prompt_sets_update on public.prompt_sets;
create policy prompt_sets_update
on public.prompt_sets for update using (auth.uid() = owner_id);

drop policy if exists prompt_sets_delete on public.prompt_sets;
create policy prompt_sets_delete
on public.prompt_sets for delete using (auth.uid() = owner_id);

create table if not exists public.prompt_slots (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.prompt_sets(id) on delete cascade,
  slot_no integer not null default 1,
  slot_type text not null default 'ai',
  slot_pick text not null default '1',
  template text not null default '',
  is_start boolean not null default false,
  invisible boolean not null default false,
  visible_slots integer[] not null default array[]::integer[],
  canvas_x double precision,
  canvas_y double precision,
  var_rules_global jsonb default '[]'::jsonb,
  var_rules_local jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_slots enable row level security;

drop policy if exists prompt_slots_select on public.prompt_slots;
create policy prompt_slots_select
on public.prompt_slots for select
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and (s.owner_id = auth.uid() or s.is_public)
));

drop policy if exists prompt_slots_insert on public.prompt_slots;
create policy prompt_slots_insert
on public.prompt_slots for insert
with check (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and s.owner_id = auth.uid()
));

drop policy if exists prompt_slots_update on public.prompt_slots;
create policy prompt_slots_update
on public.prompt_slots for update
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and s.owner_id = auth.uid()
));

drop policy if exists prompt_slots_delete on public.prompt_slots;
create policy prompt_slots_delete
on public.prompt_slots for delete
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and s.owner_id = auth.uid()
));

create table if not exists public.prompt_bridges (
  id uuid primary key default gen_random_uuid(),
  from_set uuid not null references public.prompt_sets(id) on delete cascade,
  from_slot_id uuid not null references public.prompt_slots(id) on delete cascade,
  to_slot_id uuid not null references public.prompt_slots(id) on delete cascade,
  trigger_words text[] not null default array[]::text[],
  conditions jsonb default '[]'::jsonb,
  priority integer not null default 0,
  probability numeric not null default 1,
  fallback boolean not null default false,
  action text not null default 'continue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_bridges enable row level security;

drop policy if exists prompt_bridges_select on public.prompt_bridges;
create policy prompt_bridges_select
on public.prompt_bridges for select
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and (s.owner_id = auth.uid() or s.is_public)
));

drop policy if exists prompt_bridges_insert on public.prompt_bridges;
create policy prompt_bridges_insert
on public.prompt_bridges for insert
with check (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and s.owner_id = auth.uid()
));

drop policy if exists prompt_bridges_update on public.prompt_bridges;
create policy prompt_bridges_update
on public.prompt_bridges for update
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and s.owner_id = auth.uid()
));

drop policy if exists prompt_bridges_delete on public.prompt_bridges;
create policy prompt_bridges_delete
on public.prompt_bridges for delete
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and s.owner_id = auth.uid()
));

create table if not exists public.prompt_library_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  set_id uuid unique references public.prompt_sets(id) on delete set null,
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_library_entries enable row level security;

drop policy if exists prompt_library_entries_select on public.prompt_library_entries;
create policy prompt_library_entries_select
on public.prompt_library_entries for select
using (true);

drop policy if exists prompt_library_entries_insert on public.prompt_library_entries;
create policy prompt_library_entries_insert
on public.prompt_library_entries for insert
with check (auth.uid() = owner_id);

-- =========================================
--  사용자 오류 리포트 수집
-- =========================================

create table if not exists public.rank_user_error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  path text,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  user_agent text,
  severity text not null default 'error',
  created_at timestamptz not null default now()
);

create index if not exists rank_user_error_reports_created_at_idx
  on public.rank_user_error_reports (created_at desc);

create index if not exists rank_user_error_reports_severity_idx
  on public.rank_user_error_reports (severity);

alter table public.rank_user_error_reports enable row level security;

drop policy if exists prompt_library_entries_update on public.prompt_library_entries;
create policy prompt_library_entries_update
on public.prompt_library_entries for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create or replace function public.increment_prompt_library_downloads(entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prompt_library_entries
  set download_count = download_count + 1,
      updated_at = now()
  where id = entry_id;
end;
$$;

grant execute on function public.increment_prompt_library_downloads to anon;
grant execute on function public.increment_prompt_library_downloads to authenticated;

create or replace function public.touch_prompt_library_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_prompt_library_entries_updated on public.prompt_library_entries;
create trigger trg_prompt_library_entries_updated
before update on public.prompt_library_entries
for each row
execute function public.touch_prompt_library_entries_updated_at();

-- =========================================
--  랭크 오디오 환경 설정
-- =========================================
create table if not exists public.rank_audio_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_key text not null,
  hero_id uuid,
  hero_name text not null default '',
  hero_source text not null default '',
  track_id text,
  preset_id text,
  manual_override boolean not null default false,
  eq_settings jsonb not null default '{"enabled": false, "low": 0, "mid": 0, "high": 0}'::jsonb,
  reverb_settings jsonb not null default '{"enabled": false, "mix": 0.3, "decay": 1.8}'::jsonb,
  compressor_settings jsonb not null default '{"enabled": false, "threshold": -28, "ratio": 2.5, "release": 0.25}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rank_audio_preferences_owner_profile
  on public.rank_audio_preferences (owner_id, profile_key);

create index if not exists rank_audio_preferences_owner_updated
  on public.rank_audio_preferences (owner_id, updated_at desc);

alter table public.rank_audio_preferences enable row level security;

drop policy if exists rank_audio_preferences_select_owner on public.rank_audio_preferences;
create policy rank_audio_preferences_select_owner
on public.rank_audio_preferences for select
using (auth.uid() = owner_id);

drop policy if exists rank_audio_preferences_insert_owner on public.rank_audio_preferences;
create policy rank_audio_preferences_insert_owner
on public.rank_audio_preferences for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists rank_audio_preferences_update_owner on public.rank_audio_preferences;
create policy rank_audio_preferences_update_owner
on public.rank_audio_preferences for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists rank_audio_preferences_delete_owner on public.rank_audio_preferences;
create policy rank_audio_preferences_delete_owner
on public.rank_audio_preferences for delete to authenticated
using (auth.uid() = owner_id);

create or replace function public.touch_rank_audio_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rank_audio_preferences_updated on public.rank_audio_preferences;
create trigger trg_rank_audio_preferences_updated
before update on public.rank_audio_preferences
for each row
execute function public.touch_rank_audio_preferences_updated_at();

create table if not exists public.rank_audio_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_key text not null,
  hero_id uuid,
  hero_name text not null default '',
  hero_source text not null default '',
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rank_audio_events_owner_created
  on public.rank_audio_events (owner_id, created_at desc);

create or replace function public.rank_audio_events_weekly_trend(
  start_timestamp timestamptz default null,
  end_timestamp timestamptz default null,
  owner_filter uuid default null,
  profile_filter text default null,
  hero_filter uuid default null,
  event_type_filter text[] default null
)
returns table (
  week_start timestamptz,
  event_count bigint,
  unique_owners bigint,
  unique_profiles bigint
)
language sql
stable
as $$
  with filtered as (
    select
      date_trunc('week', created_at) as bucket,
      owner_id,
      profile_key
    from public.rank_audio_events
    where (start_timestamp is null or created_at >= start_timestamp)
      and (end_timestamp is null or created_at < end_timestamp)
      and (owner_filter is null or owner_id = owner_filter)
      and (profile_filter is null or profile_key = profile_filter)
      and (hero_filter is null or hero_id = hero_filter)
      and (
        event_type_filter is null
        or coalesce(array_length(event_type_filter, 1), 0) = 0
        or event_type = any(event_type_filter)
      )
  )
  select
    bucket as week_start,
    count(*) as event_count,
    count(distinct owner_id) as unique_owners,
    count(distinct owner_id::text || '::' || profile_key) as unique_profiles
  from filtered
  group by bucket
  order by bucket asc;
$$;

create or replace function public.rank_audio_events_weekly_breakdown(
  mode text default 'hero',
  start_timestamp timestamptz default null,
  end_timestamp timestamptz default null,
  owner_filter uuid default null,
  profile_filter text default null,
  hero_filter uuid default null,
  event_type_filter text[] default null
)
returns table (
  week_start timestamptz,
  dimension_id text,
  dimension_label text,
  event_count bigint
)
language sql
stable
as $$
  with filtered as (
    select
      date_trunc('week', created_at) as bucket,
      owner_id,
      profile_key,
      hero_id,
      nullif(hero_name, '') as hero_name
    from public.rank_audio_events
    where (start_timestamp is null or created_at >= start_timestamp)
      and (end_timestamp is null or created_at < end_timestamp)
      and (owner_filter is null or owner_id = owner_filter)
      and (profile_filter is null or profile_key = profile_filter)
      and (hero_filter is null or hero_id = hero_filter)
      and (
        event_type_filter is null
        or coalesce(array_length(event_type_filter, 1), 0) = 0
        or event_type = any(event_type_filter)
      )
  ),
  prepared as (
    select
      bucket,
      case when lower(coalesce(mode, 'hero')) = 'owner'
        then coalesce(owner_id::text, 'unknown')
        else coalesce(hero_id::text, 'unknown')
      end as dimension_id,
      case when lower(coalesce(mode, 'hero')) = 'owner'
        then coalesce(owner_id::text, '운영자 미지정')
        else coalesce(hero_name, '히어로 미지정')
      end as dimension_label
    from filtered
  )
  select
    bucket as week_start,
    dimension_id,
    dimension_label,
    count(*) as event_count
  from prepared
  group by bucket, dimension_id, dimension_label
  order by bucket asc, event_count desc;
$$;

alter table public.rank_audio_events enable row level security;

drop policy if exists rank_audio_events_select_owner on public.rank_audio_events;
create policy rank_audio_events_select_owner
on public.rank_audio_events for select
using (auth.uid() = owner_id);

drop policy if exists rank_audio_events_insert_owner on public.rank_audio_events;
create policy rank_audio_events_insert_owner
on public.rank_audio_events for insert to authenticated
with check (auth.uid() = owner_id);

create table if not exists public.rank_audio_monitor_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('favorite', 'subscription')),
  label text not null,
  notes text not null default '',
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_rank_audio_monitor_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_audio_monitor_rules_updated on public.rank_audio_monitor_rules;
create trigger trg_rank_audio_monitor_rules_updated
before update on public.rank_audio_monitor_rules
for each row
execute function public.touch_rank_audio_monitor_rules_updated_at();

create index if not exists rank_audio_monitor_rules_type_sort
  on public.rank_audio_monitor_rules (rule_type, sort_order, updated_at desc);

alter table public.rank_audio_monitor_rules enable row level security;

drop policy if exists rank_audio_monitor_rules_service_only on public.rank_audio_monitor_rules;
create policy rank_audio_monitor_rules_service_only
on public.rank_audio_monitor_rules for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- =========================================
--  타이틀 화면 & 공지 CMS
-- =========================================
create table if not exists public.rank_title_settings (
  slug text primary key,
  background_url text not null,
  update_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_rank_title_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_title_settings_updated on public.rank_title_settings;
create trigger trg_rank_title_settings_updated
before update on public.rank_title_settings
for each row
execute function public.touch_rank_title_settings_updated_at();

alter table public.rank_title_settings enable row level security;

drop policy if exists rank_title_settings_select_public on public.rank_title_settings;
create policy rank_title_settings_select_public
on public.rank_title_settings for select
using (true);

drop policy if exists rank_title_settings_insert_service_role on public.rank_title_settings;
create policy rank_title_settings_insert_service_role
on public.rank_title_settings for insert
with check (auth.role() = 'service_role');

drop policy if exists rank_title_settings_update_service_role on public.rank_title_settings;
create policy rank_title_settings_update_service_role
on public.rank_title_settings for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists rank_title_settings_delete_service_role on public.rank_title_settings;
create policy rank_title_settings_delete_service_role
on public.rank_title_settings for delete
using (auth.role() = 'service_role');

create table if not exists public.rank_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rank_announcements_published_desc
  on public.rank_announcements (published_at desc);

create or replace function public.touch_rank_announcements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_announcements_updated on public.rank_announcements;
create trigger trg_rank_announcements_updated
before update on public.rank_announcements
for each row
execute function public.touch_rank_announcements_updated_at();

alter table public.rank_announcements enable row level security;

drop policy if exists rank_announcements_select_public on public.rank_announcements;
create policy rank_announcements_select_public
on public.rank_announcements for select
using (true);

drop policy if exists rank_announcements_insert_service_role on public.rank_announcements;
create policy rank_announcements_insert_service_role
on public.rank_announcements for insert
with check (auth.role() = 'service_role');

drop policy if exists rank_announcements_update_service_role on public.rank_announcements;
create policy rank_announcements_update_service_role
on public.rank_announcements for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists rank_announcements_delete_service_role on public.rank_announcements;
create policy rank_announcements_delete_service_role
on public.rank_announcements for delete
using (auth.role() = 'service_role');

-- =========================================
--  API 키 쿨다운 모니터링
-- =========================================
create table if not exists public.rank_api_key_cooldowns (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  key_sample text,
  reason text not null,
  provider text not null,
  viewer_id uuid references auth.users(id) on delete set null,
  game_id uuid,
  session_id uuid,
  recorded_at timestamptz not null,
  expires_at timestamptz,
  reported_at timestamptz not null,
  notified_at timestamptz,
  source text not null default 'client_local',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rank_api_key_cooldowns_key_hash_idx
  on public.rank_api_key_cooldowns (key_hash);

create index if not exists rank_api_key_cooldowns_notified_idx
  on public.rank_api_key_cooldowns (notified_at, recorded_at desc);

create index if not exists rank_api_key_cooldowns_reported_idx
  on public.rank_api_key_cooldowns (reported_at desc);

create or replace function public.touch_rank_api_key_cooldowns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_api_key_cooldowns_updated on public.rank_api_key_cooldowns;
create trigger trg_rank_api_key_cooldowns_updated
before update on public.rank_api_key_cooldowns
for each row
execute function public.touch_rank_api_key_cooldowns_updated_at();

alter table public.rank_api_key_cooldowns enable row level security;

drop policy if exists rank_api_key_cooldowns_service_select on public.rank_api_key_cooldowns;
create policy rank_api_key_cooldowns_service_select
on public.rank_api_key_cooldowns for select
using (auth.role() = 'service_role');

drop policy if exists rank_api_key_cooldowns_service_insert on public.rank_api_key_cooldowns;
create policy rank_api_key_cooldowns_service_insert
on public.rank_api_key_cooldowns for insert
with check (auth.role() = 'service_role');

drop policy if exists rank_api_key_cooldowns_service_update on public.rank_api_key_cooldowns;
create policy rank_api_key_cooldowns_service_update
on public.rank_api_key_cooldowns for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists rank_api_key_cooldowns_service_delete on public.rank_api_key_cooldowns;
create policy rank_api_key_cooldowns_service_delete
on public.rank_api_key_cooldowns for delete
using (auth.role() = 'service_role');

create table if not exists public.rank_api_key_audit (
  id uuid primary key default gen_random_uuid(),
  cooldown_id uuid not null references public.rank_api_key_cooldowns(id) on delete cascade,
  status text not null,
  retry_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_eta timestamptz,
  doc_link_attached boolean not null default false,
  automation_payload jsonb not null default '{}'::jsonb,
  digest_payload jsonb not null default '{}'::jsonb,
  notes text,
  inserted_at timestamptz not null default now()
);

create index if not exists rank_api_key_audit_cooldown_inserted_idx
  on public.rank_api_key_audit (cooldown_id, inserted_at desc);

alter table public.rank_api_key_audit enable row level security;

drop policy if exists rank_api_key_audit_service_all on public.rank_api_key_audit;
create policy rank_api_key_audit_service_all
on public.rank_api_key_audit for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create table if not exists public.rank_user_api_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_ciphertext text not null,
  key_iv text not null,
  key_tag text not null,
  key_version smallint not null default 1,
  api_version text,
  gemini_mode text,
  gemini_model text,
  key_sample text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rank_user_api_keys_updated_idx
  on public.rank_user_api_keys (updated_at desc);

create table if not exists public.rank_user_api_keyring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model_label text,
  api_version text,
  gemini_mode text,
  gemini_model text,
  key_ciphertext text not null,
  key_iv text not null,
  key_tag text not null,
  key_version smallint not null default 1,
  key_sample text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_user_api_keyring
  add column if not exists model_label text;

create index if not exists rank_user_api_keyring_user_idx
  on public.rank_user_api_keyring (user_id, created_at);

create index if not exists rank_user_api_keyring_updated_idx
  on public.rank_user_api_keyring (updated_at desc);

create or replace function public.touch_rank_user_api_keys_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_user_api_keys_updated on public.rank_user_api_keys;
create trigger trg_rank_user_api_keys_updated
before update on public.rank_user_api_keys
for each row
execute function public.touch_rank_user_api_keys_updated_at();

alter table public.rank_user_api_keys enable row level security;

drop policy if exists rank_user_api_keys_service_all on public.rank_user_api_keys;
create policy rank_user_api_keys_service_all
on public.rank_user_api_keys for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.touch_rank_user_api_keyring_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rank_user_api_keyring_updated on public.rank_user_api_keyring;
create trigger trg_rank_user_api_keyring_updated
before update on public.rank_user_api_keyring
for each row
execute function public.touch_rank_user_api_keyring_updated_at();

alter table public.rank_user_api_keyring enable row level security;

drop policy if exists rank_user_api_keyring_service_all on public.rank_user_api_keyring;
create policy rank_user_api_keyring_service_all
on public.rank_user_api_keyring for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create table if not exists public.rank_cooldown_timeline_uploads (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  mode text not null,
  format text not null,
  status text not null,
  strategy text,
  filename text,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  inserted_at timestamptz not null default now()
);

create index if not exists rank_cooldown_timeline_uploads_section_status_idx
  on public.rank_cooldown_timeline_uploads (section, status);

create index if not exists rank_cooldown_timeline_uploads_uploaded_idx
  on public.rank_cooldown_timeline_uploads (uploaded_at desc);

alter table public.rank_cooldown_timeline_uploads enable row level security;

drop policy if exists rank_cooldown_timeline_uploads_service_all on public.rank_cooldown_timeline_uploads;
create policy rank_cooldown_timeline_uploads_service_all
on public.rank_cooldown_timeline_uploads for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- =========================================
--  랭킹 게임 핵심 테이블
-- =========================================
create table if not exists public.rank_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text default '' not null,
  image_url text,
  prompt_set_id uuid,
  roles jsonb default '[]'::jsonb,
  rules jsonb default '{}'::jsonb,
  rules_prefix text,
  realtime_match text not null default 'off',
  likes_count integer not null default 0,
  play_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_games enable row level security;

drop policy if exists rank_games_select_public on public.rank_games;
create policy rank_games_select_public
on public.rank_games for select using (true);

drop policy if exists rank_games_insert_owner on public.rank_games;
create policy rank_games_insert_owner
on public.rank_games for insert with check (auth.uid() = owner_id);

drop policy if exists rank_games_update_owner on public.rank_games;
create policy rank_games_update_owner
on public.rank_games for update using (auth.uid() = owner_id);

drop policy if exists rank_games_delete_owner on public.rank_games;
create policy rank_games_delete_owner
on public.rank_games for delete using (auth.uid() = owner_id);

create table if not exists public.rank_game_roles (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  name text not null,
  slot_count integer not null default 1,
  active boolean not null default true,
  score_delta_min integer not null default 20,
  score_delta_max integer not null default 40,
  created_at timestamptz not null default now()
);

alter table public.rank_game_roles enable row level security;

drop policy if exists rank_game_roles_select on public.rank_game_roles;
create policy rank_game_roles_select
on public.rank_game_roles for select using (true);

drop policy if exists rank_game_roles_mutate on public.rank_game_roles;
create policy rank_game_roles_mutate
on public.rank_game_roles for all
using (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_roles.game_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_roles.game_id and g.owner_id = auth.uid()
));

create table if not exists public.rank_game_tags (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (game_id, tag)
);

alter table public.rank_game_tags enable row level security;

drop policy if exists rank_game_tags_select on public.rank_game_tags;
create policy rank_game_tags_select
on public.rank_game_tags for select using (true);

drop policy if exists rank_game_tags_mutate on public.rank_game_tags;
create policy rank_game_tags_mutate
on public.rank_game_tags for all
using (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_tags.game_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_tags.game_id and g.owner_id = auth.uid()
));

create table if not exists public.rank_game_seasons (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  leaderboard jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_game_seasons enable row level security;

drop policy if exists rank_game_seasons_select on public.rank_game_seasons;
create policy rank_game_seasons_select
on public.rank_game_seasons for select using (true);

drop policy if exists rank_game_seasons_mutate on public.rank_game_seasons;
create policy rank_game_seasons_mutate
on public.rank_game_seasons for all
using (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_seasons.game_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_seasons.game_id and g.owner_id = auth.uid()
));

create table if not exists public.rank_game_slots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  slot_index integer not null,
  role text not null,
  active boolean not null default true,
  hero_id uuid references public.heroes(id) on delete set null,
  hero_owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, slot_index)
);

alter table public.rank_game_slots enable row level security;

drop policy if exists rank_game_slots_select on public.rank_game_slots;
create policy rank_game_slots_select
on public.rank_game_slots for select using (true);

drop policy if exists rank_game_slots_mutate on public.rank_game_slots;
create policy rank_game_slots_mutate
on public.rank_game_slots for all
using (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_slots.game_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.rank_games g
  where g.id = rank_game_slots.game_id and g.owner_id = auth.uid()
));

create table if not exists public.rank_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  heroes_id uuid references public.heroes(id) on delete set null,
  hero_ids uuid[] not null default array[]::uuid[],
  slot_no integer,
  role text,
  rating integer not null default 1000,
  score integer,
  battles integer not null default 0,
  likes integer not null default 0,
  win_rate numeric,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, owner_id)
);

alter table public.rank_participants
  add column if not exists slot_no integer;

create unique index if not exists rank_participants_slot_unique
  on public.rank_participants (game_id, slot_no)
  where slot_no is not null;

alter table public.rank_participants enable row level security;

drop policy if exists rank_participants_select on public.rank_participants;
create policy rank_participants_select
on public.rank_participants for select using (true);

drop policy if exists rank_participants_insert on public.rank_participants;
create policy rank_participants_insert
on public.rank_participants for insert
with check (auth.uid() = owner_id);

drop policy if exists rank_participants_update on public.rank_participants;
create policy rank_participants_update
on public.rank_participants for update using (auth.uid() = owner_id);

drop policy if exists rank_participants_delete on public.rank_participants;
create policy rank_participants_delete
on public.rank_participants for delete using (auth.uid() = owner_id);

create index if not exists rank_participants_active_by_role
on public.rank_participants (game_id, role, status, updated_at desc);

create table if not exists public.rank_battles (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  attacker_owner_id uuid references auth.users(id) on delete set null,
  attacker_hero_ids uuid[] not null default array[]::uuid[],
  defender_owner_id uuid references auth.users(id) on delete set null,
  defender_hero_ids uuid[] not null default array[]::uuid[],
  result text not null,
  score_delta integer,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rank_battles enable row level security;

drop policy if exists rank_battles_select on public.rank_battles;
create policy rank_battles_select
on public.rank_battles for select using (true);

drop policy if exists rank_battles_insert on public.rank_battles;
create policy rank_battles_insert
on public.rank_battles for insert to authenticated with check (true);

create table if not exists public.rank_battle_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  battle_id uuid not null references public.rank_battles(id) on delete cascade,
  turn_no integer not null default 1,
  prompt text,
  ai_response text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rank_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  mode text not null default 'casual',
  realtime_mode text not null default 'standard',
  status text not null default 'open',
  slot_count integer not null default 0,
  filled_count integer not null default 0,
  ready_count integer not null default 0,
  host_role_limit integer,
  brawl_rule text,
  blind_mode boolean not null default false,
  host_last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_rooms
  add column if not exists realtime_mode text not null default 'standard';

alter table public.rank_rooms
  add column if not exists host_role_limit integer;

alter table public.rank_rooms
  add column if not exists brawl_rule text;

alter table public.rank_rooms
  add column if not exists blind_mode boolean not null default false;

alter table public.rank_rooms
  add column if not exists host_last_active_at timestamptz;

alter table public.rank_rooms
  alter column host_last_active_at set default now();

update public.rank_rooms
   set host_last_active_at = coalesce(host_last_active_at, updated_at, created_at, now())
 where host_last_active_at is null;

alter table public.rank_rooms
  alter column host_last_active_at set not null;

create table if not exists public.rank_room_slots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rank_rooms(id) on delete cascade,
  slot_index integer not null,
  role text not null,
  occupant_owner_id uuid references auth.users(id) on delete set null,
  occupant_hero_id uuid references public.heroes(id) on delete set null,
  occupant_ready boolean not null default false,
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(room_id, slot_index)
);

create index if not exists rank_room_slots_role_vacancy_idx
on public.rank_room_slots (room_id, role, occupant_owner_id);

create index if not exists idx_rank_room_slots_room_occupant
on public.rank_room_slots (room_id, occupant_owner_id);

create table if not exists public.rank_queue_tickets (
  id uuid primary key default gen_random_uuid(),
  queue_id text not null,
  game_id uuid references public.rank_games(id) on delete cascade,
  room_id uuid references public.rank_rooms(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  mode text,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  ready_vote jsonb,
  async_fill_meta jsonb,
  seat_map jsonb not null default '[]'::jsonb,
  ready_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rank_queue_tickets_queue_idx
on public.rank_queue_tickets (queue_id, created_at desc);

create index if not exists rank_queue_tickets_room_idx
on public.rank_queue_tickets (room_id, created_at desc);

alter table public.rank_queue_tickets enable row level security;

drop policy if exists rank_queue_tickets_select on public.rank_queue_tickets;
create policy rank_queue_tickets_select
on public.rank_queue_tickets for select
using (auth.uid() = owner_id or auth.role() = 'service_role');

drop policy if exists rank_queue_tickets_insert on public.rank_queue_tickets;
create policy rank_queue_tickets_insert
on public.rank_queue_tickets for insert to authenticated
with check (auth.uid() = owner_id or owner_id is null or auth.role() = 'service_role');

drop policy if exists rank_queue_tickets_update on public.rank_queue_tickets;
create policy rank_queue_tickets_update
on public.rank_queue_tickets for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists rank_queue_tickets_delete on public.rank_queue_tickets;
create policy rank_queue_tickets_delete
on public.rank_queue_tickets for delete
using (auth.role() = 'service_role');

create table if not exists public.rank_match_queue (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  mode text not null default 'solo',
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  role text not null,
  score integer not null default 1000,
  simulated boolean not null default false,
  party_key text,
  status text not null default 'waiting',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_code text
);

create index if not exists rank_match_queue_lookup
on public.rank_match_queue (game_id, mode, role, status, joined_at);

create index if not exists rank_match_queue_owner_lookup
on public.rank_match_queue (game_id, mode, owner_id, status);

alter table public.rank_rooms enable row level security;

drop policy if exists rank_rooms_select on public.rank_rooms;
create policy rank_rooms_select
on public.rank_rooms for select using (true);

drop policy if exists rank_rooms_insert on public.rank_rooms;
create policy rank_rooms_insert
on public.rank_rooms for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists rank_rooms_update on public.rank_rooms;
create policy rank_rooms_update
on public.rank_rooms for update
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.rank_room_slots
    where public.rank_room_slots.room_id = id
      and public.rank_room_slots.occupant_owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  or exists (
    select 1 from public.rank_room_slots
    where public.rank_room_slots.room_id = id
      and public.rank_room_slots.occupant_owner_id = auth.uid()
  )
);

alter table public.rank_room_slots enable row level security;

drop policy if exists rank_room_slots_select on public.rank_room_slots;
create policy rank_room_slots_select
on public.rank_room_slots for select using (true);

drop policy if exists rank_room_slots_insert on public.rank_room_slots;
create policy rank_room_slots_insert
on public.rank_room_slots for insert to authenticated
with check (
  exists (
    select 1 from public.rank_rooms
    where public.rank_rooms.id = room_id
      and public.rank_rooms.owner_id = auth.uid()
  )
);

drop policy if exists rank_room_slots_update on public.rank_room_slots;
create policy rank_room_slots_update
on public.rank_room_slots for update
using (
  occupant_owner_id is null
  or occupant_owner_id = auth.uid()
  or exists (
    select 1 from public.rank_rooms
    where public.rank_rooms.id = room_id
      and public.rank_rooms.owner_id = auth.uid()
  )
)
with check (
  occupant_owner_id is null
  or occupant_owner_id = auth.uid()
  or exists (
    select 1 from public.rank_rooms
    where public.rank_rooms.id = room_id
      and public.rank_rooms.owner_id = auth.uid()
  )
);

create table if not exists public.rank_match_roster (
  id uuid primary key default gen_random_uuid(),
  match_instance_id uuid not null,
  room_id uuid not null references public.rank_rooms(id) on delete cascade,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  slot_id uuid,
  slot_index integer not null,
  role text not null,
  owner_id uuid references auth.users(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete set null,
  hero_name text,
  hero_summary jsonb default '{}'::jsonb,
  ready boolean default false,
  joined_at timestamptz,
  score integer,
  rating integer,
  battles integer,
  win_rate numeric,
  status text,
  standin boolean default false,
  match_source text,
  slot_template_version bigint,
  slot_template_source text,
  slot_template_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists rank_match_roster_instance_slot_unique
on public.rank_match_roster (match_instance_id, slot_index);

create index if not exists rank_match_roster_room_idx
on public.rank_match_roster (room_id);

create index if not exists rank_match_roster_game_idx
on public.rank_match_roster (game_id);

create index if not exists idx_rank_match_roster_match_owner
on public.rank_match_roster (match_instance_id, owner_id);

alter table public.rank_match_roster enable row level security;

drop policy if exists rank_match_roster_select on public.rank_match_roster;
create policy rank_match_roster_select
on public.rank_match_roster for select using (true);

drop policy if exists rank_match_roster_service_write on public.rank_match_roster;
create policy rank_match_roster_service_write
on public.rank_match_roster for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table public.rank_match_queue enable row level security;

drop policy if exists rank_match_queue_select on public.rank_match_queue;
create policy rank_match_queue_select
on public.rank_match_queue for select
using (
  status = 'waiting'
  or owner_id = auth.uid()
);

drop policy if exists rank_match_queue_insert on public.rank_match_queue;
create policy rank_match_queue_insert
on public.rank_match_queue for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists rank_match_queue_update on public.rank_match_queue;
create policy rank_match_queue_update
on public.rank_match_queue for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists rank_match_queue_delete on public.rank_match_queue;
create policy rank_match_queue_delete
on public.rank_match_queue for delete to authenticated
using (auth.uid() = owner_id);

create table if not exists public.rank_matchmaking_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid,
  room_id uuid,
  session_id uuid,
  mode text,
  stage text,
  status text,
  reason text,
  match_code text,
  score_window integer,
  drop_in boolean default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rank_matchmaking_logs_created_idx
on public.rank_matchmaking_logs (created_at desc);

create index if not exists rank_matchmaking_logs_stage_idx
on public.rank_matchmaking_logs (stage);

alter table public.rank_matchmaking_logs enable row level security;

drop policy if exists rank_matchmaking_logs_service_insert on public.rank_matchmaking_logs;
create policy rank_matchmaking_logs_service_insert
on public.rank_matchmaking_logs for insert
with check (auth.role() = 'service_role');

drop policy if exists rank_matchmaking_logs_service_select on public.rank_matchmaking_logs;
create policy rank_matchmaking_logs_service_select
on public.rank_matchmaking_logs for select
using (auth.role() = 'service_role');

alter table public.rank_battle_logs enable row level security;

drop policy if exists rank_battle_logs_select on public.rank_battle_logs;
create policy rank_battle_logs_select
on public.rank_battle_logs for select using (true);

drop policy if exists rank_battle_logs_insert on public.rank_battle_logs;
create policy rank_battle_logs_insert
on public.rank_battle_logs for insert to authenticated with check (true);

create table if not exists public.rank_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.rank_games(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  turn integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_sessions
  add column if not exists room_id uuid references public.rank_rooms(id) on delete set null;

alter table public.rank_sessions
  add column if not exists rating_hint integer;

alter table public.rank_sessions
  add column if not exists mode text,
  add column if not exists vote_snapshot jsonb default '{}'::jsonb;

create index if not exists rank_sessions_status_recent_idx
on public.rank_sessions (status, game_id, updated_at desc);

create index if not exists idx_rank_sessions_id_owner
on public.rank_sessions (id, owner_id);

alter table public.rank_sessions enable row level security;

drop policy if exists rank_sessions_select on public.rank_sessions;
create policy rank_sessions_select
on public.rank_sessions for select using (auth.uid() = owner_id or owner_id is null);

drop policy if exists rank_sessions_insert on public.rank_sessions;
create policy rank_sessions_insert
on public.rank_sessions for insert to authenticated with check (auth.uid() = owner_id or owner_id is null);

drop policy if exists rank_sessions_update on public.rank_sessions;
create policy rank_sessions_update
on public.rank_sessions for update using (auth.uid() = owner_id or owner_id is null);

create table if not exists public.rank_session_meta (
  session_id uuid primary key references public.rank_sessions(id) on delete cascade,
  turn_limit integer,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  realtime_mode text default 'off',
  drop_in_bonus_seconds integer default 0,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  occupant_owner_id uuid,
  occupant_hero_name text,
  score_delta integer,
  final_score integer,
  extras jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rank_session_meta
  add column if not exists turn_limit integer;

alter table public.rank_session_meta
  add column if not exists selected_time_limit_seconds integer;

alter table public.rank_session_meta
  add column if not exists time_vote jsonb;

alter table public.rank_session_meta
  add column if not exists realtime_mode text;

alter table public.rank_session_meta
  alter column realtime_mode set default 'off';

alter table public.rank_session_meta
  add column if not exists drop_in_bonus_seconds integer;

alter table public.rank_session_meta
  alter column drop_in_bonus_seconds set default 0;

alter table public.rank_session_meta
  add column if not exists turn_state jsonb;

alter table public.rank_session_meta
  add column if not exists async_fill_snapshot jsonb;

alter table public.rank_session_meta
  add column if not exists occupant_owner_id uuid;

alter table public.rank_session_meta
  add column if not exists occupant_hero_name text;

alter table public.rank_session_meta
  add column if not exists score_delta integer;

alter table public.rank_session_meta
  add column if not exists final_score integer;

alter table public.rank_session_meta
  add column if not exists extras jsonb;

alter table public.rank_session_meta
  add column if not exists updated_at timestamptz;

alter table public.rank_session_meta
  alter column updated_at set default now();

alter table public.rank_session_meta enable row level security;

drop policy if exists rank_session_meta_select on public.rank_session_meta;
create policy rank_session_meta_select
on public.rank_session_meta for select
to authenticated
using (
  occupant_owner_id = auth.uid()
  or exists (
    select 1 from public.rank_sessions s
    where s.id = session_id
      and (s.owner_id is null or s.owner_id = auth.uid())
  )
  or exists (
    select 1
    from public.rank_match_roster r
    where r.match_instance_id = public.try_cast_uuid(
      coalesce(
        extras->>'matchInstanceId',
        extras->>'match_instance_id',
        async_fill_snapshot->>'matchInstanceId',
        async_fill_snapshot->>'match_instance_id'
      )
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.rank_sessions s
    join public.rank_room_slots rs on rs.room_id = s.room_id
    where s.id = session_id
      and rs.occupant_owner_id = auth.uid()
  )
);

drop policy if exists rank_session_meta_service_all on public.rank_session_meta;

create table if not exists public.rank_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  idx integer not null,
  role text not null,
  public boolean not null default true,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.rank_turns enable row level security;

drop policy if exists rank_turns_select on public.rank_turns;
create policy rank_turns_select
on public.rank_turns for select using (true);

drop policy if exists rank_turns_insert on public.rank_turns;
create policy rank_turns_insert
on public.rank_turns for insert to authenticated with check (true);

create table if not exists public.rank_session_timeline_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  game_id uuid references public.rank_games(id) on delete set null,
  event_id text not null,
  event_type text not null,
  owner_id text,
  reason text,
  strike integer,
  remaining integer,
  limit_remaining integer,
  status text,
  turn integer,
  event_timestamp timestamptz not null default now(),
  context jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists rank_session_timeline_events_event_id_key
on public.rank_session_timeline_events (event_id);

create index if not exists rank_session_timeline_events_session_idx
on public.rank_session_timeline_events (session_id, event_timestamp desc);

alter table public.rank_session_timeline_events enable row level security;

drop policy if exists rank_session_timeline_events_select on public.rank_session_timeline_events;
create policy rank_session_timeline_events_select
on public.rank_session_timeline_events for select using (true);

drop policy if exists rank_session_timeline_events_insert on public.rank_session_timeline_events;
create policy rank_session_timeline_events_insert
on public.rank_session_timeline_events for insert
with check (auth.role() = 'service_role');

create table if not exists public.rank_session_battle_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  game_id uuid references public.rank_games(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  result text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rank_session_battle_logs_session_key
on public.rank_session_battle_logs (session_id);

create index if not exists rank_session_battle_logs_game_idx
on public.rank_session_battle_logs (game_id, created_at desc);

create index if not exists rank_session_battle_logs_owner_idx
on public.rank_session_battle_logs (owner_id, created_at desc);

alter table public.rank_session_battle_logs enable row level security;

drop policy if exists rank_session_battle_logs_select on public.rank_session_battle_logs;
create policy rank_session_battle_logs_select
on public.rank_session_battle_logs for select using (true);

drop policy if exists rank_session_battle_logs_insert on public.rank_session_battle_logs;
create policy rank_session_battle_logs_insert
on public.rank_session_battle_logs for insert
with check (auth.role() = 'service_role');

drop policy if exists rank_session_battle_logs_update on public.rank_session_battle_logs;
create policy rank_session_battle_logs_update
on public.rank_session_battle_logs for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- =========================================
--  Edge Function 배포 감사 로그
-- =========================================
create table if not exists public.rank_edge_function_deployments (
  id uuid primary key default uuid_generate_v4(),
  function_name text not null,
  status text not null check (status in ('succeeded', 'retrying', 'failed')),
  attempt smallint not null check (attempt > 0),
  max_attempts smallint not null check (max_attempts >= attempt),
  exit_code smallint,
  duration_ms integer,
  logs text,
  next_retry_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rank_edge_function_deployments
add column if not exists environment text not null default 'unknown';

create index if not exists rank_edge_function_deployments_function_idx
on public.rank_edge_function_deployments (function_name, created_at desc);

create index if not exists rank_edge_function_deployments_status_idx
on public.rank_edge_function_deployments (status, created_at desc);

-- =========================================
--  Arena queue & session RPCs
-- =========================================

create or replace function public.verify_rank_roles_and_slots(
  p_roles jsonb default '[]'::jsonb,
  p_slots jsonb default '[]'::jsonb
)
returns table (
  role_name text,
  declared_slot_count integer,
  active_slot_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles jsonb := coalesce(p_roles, '[]'::jsonb);
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_role_names text[] := array[]::text[];
  v_slot_indices integer[] := array[]::integer[];
  v_slot_counts jsonb := '{}'::jsonb;
  v_active_slots integer := 0;
  v_role record;
  v_slot record;
  v_slot_role record;
  v_active_for_role integer;
begin
  if jsonb_typeof(v_slots) is distinct from 'array' then
    raise exception 'invalid_slots' using detail = 'slots_must_be_array';
  end if;

  for v_slot in
    select
      coalesce(nullif(value->>'slot_index', '')::integer, ordinality - 1) as slot_index,
      coalesce(nullif(trim(value->>'role'), ''), '') as role,
      coalesce((value->>'active')::boolean, true) as active
    from jsonb_array_elements(v_slots) with ordinality as slot(value, ordinality)
  loop
    if v_slot.slot_index < 0 then
      raise exception 'invalid_slots' using detail = 'slot_index_negative';
    end if;

    if v_slot.slot_index = any(v_slot_indices) then
      raise exception 'invalid_slots' using detail = 'duplicate_slot_index';
    end if;

    v_slot_indices := array_append(v_slot_indices, v_slot.slot_index);

    if v_slot.active then
      if v_slot.role = '' then
        raise exception 'invalid_slots' using detail = 'active_slot_missing_role';
      end if;

      v_active_slots := v_active_slots + 1;
      v_slot_counts :=
        v_slot_counts || jsonb_build_object(
          v_slot.role,
          coalesce((v_slot_counts ->> v_slot.role)::integer, 0) + 1
        );
    end if;
  end loop;

  if v_active_slots = 0 then
    raise exception 'invalid_slots' using detail = 'no_active_slots';
  end if;

  if jsonb_typeof(v_roles) is distinct from 'array' then
    raise exception 'invalid_roles' using detail = 'roles_must_be_array';
  end if;

  if jsonb_array_length(v_roles) = 0 then
    raise exception 'invalid_roles' using detail = 'no_roles_defined';
  end if;

  for v_role in
    select
      coalesce(nullif(trim(r.name), ''), '') as role_name,
      greatest(coalesce(r.slot_count, 0), 0) as declared_slot_count
    from jsonb_to_recordset(v_roles) as r(
      name text,
      slot_count integer,
      score_delta_min integer,
      score_delta_max integer,
      active boolean
    )
  loop
    if v_role.role_name = '' then
      raise exception 'invalid_roles' using detail = 'role_name_required';
    end if;

    if v_role.role_name = any(v_role_names) then
      raise exception 'invalid_roles' using detail = 'duplicate_role_name';
    end if;

    v_role_names := array_append(v_role_names, v_role.role_name);
    v_active_for_role := coalesce((v_slot_counts ->> v_role.role_name)::integer, 0);

    if v_active_for_role <> v_role.declared_slot_count then
      raise exception 'invalid_roles'
        using detail = format('slot_count_mismatch:%s', v_role.role_name);
    end if;

    role_name := v_role.role_name;
    declared_slot_count := v_role.declared_slot_count;
    active_slot_count := v_active_for_role;
    return next;
  end loop;

  for v_slot_role in select key, value from jsonb_each(v_slot_counts) loop
    if coalesce(v_slot_role.key, '') <> '' and not (v_slot_role.key = any(v_role_names)) then
      raise exception 'invalid_roles'
        using detail = format('slot_role_missing_declaration:%s', v_slot_role.key);
    end if;
  end loop;
end;
$$;

grant execute on function public.verify_rank_roles_and_slots(jsonb, jsonb) to service_role;

create or replace function public.join_rank_queue(
  queue_id text,
  payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_now timestamptz := now();
  v_room_id uuid;
  v_game_id uuid;
  v_owner_id uuid;
  v_mode text;
  v_status text;
  v_ready_vote jsonb;
  v_async_fill jsonb;
  v_seat_map jsonb := '[]'::jsonb;
begin
  if queue_id is null then
    raise exception 'missing_queue_id';
  end if;

  begin
    v_room_id := nullif(trim(coalesce(v_payload->>'room_id', v_payload->>'roomId')), '')::uuid;
  exception when others then
    v_room_id := null;
  end;

  begin
    v_game_id := nullif(trim(coalesce(v_payload->>'game_id', v_payload->>'gameId')), '')::uuid;
  exception when others then
    v_game_id := null;
  end;

  begin
    v_owner_id := nullif(trim(coalesce(v_payload->>'owner_id', v_payload->>'ownerId')), '')::uuid;
  exception when others then
    v_owner_id := null;
  end;

  v_mode := lower(trim(coalesce(
    v_payload->>'mode',
    v_payload->>'queue_mode',
    v_payload->>'match_mode',
    ''
  )));
  if v_mode = '' then
    v_mode := null;
  end if;

  v_status := lower(trim(coalesce(v_payload->>'status', 'queued')));
  if v_status = '' then
    v_status := 'queued';
  end if;

  if jsonb_typeof(v_payload->'ready_vote') = 'object' then
    v_ready_vote := v_payload->'ready_vote';
  elsif jsonb_typeof(v_payload->'readyVote') = 'object' then
    v_ready_vote := v_payload->'readyVote';
  else
    v_ready_vote := null;
  end if;

  if jsonb_typeof(v_payload->'async_fill_meta') = 'object' then
    v_async_fill := v_payload->'async_fill_meta';
  elsif jsonb_typeof(v_payload->'asyncFillMeta') = 'object' then
    v_async_fill := v_payload->'asyncFillMeta';
  else
    v_async_fill := null;
  end if;

  if jsonb_typeof(v_payload->'seat_map') = 'array' then
    v_seat_map := v_payload->'seat_map';
  elsif jsonb_typeof(v_payload->'seatMap') = 'array' then
    v_seat_map := v_payload->'seatMap';
  end if;

  insert into public.rank_queue_tickets (
    queue_id,
    game_id,
    room_id,
    owner_id,
    mode,
    status,
    payload,
    ready_vote,
    async_fill_meta,
    seat_map,
    created_at,
    updated_at
  ) values (
    queue_id,
    v_game_id,
    v_room_id,
    coalesce(v_owner_id, auth.uid()),
    v_mode,
    v_status,
    v_payload,
    v_ready_vote,
    v_async_fill,
    coalesce(v_seat_map, '[]'::jsonb),
    v_now,
    v_now
  )
  returning * into v_ticket;

  return row_to_json(v_ticket)::jsonb;
end;
$$;

grant execute on function public.join_rank_queue(text, jsonb)
  to authenticated, service_role;

create or replace function public.fetch_rank_queue_ticket(
  queue_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select *
    into v_ticket
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if not found then
    raise exception 'queue_ticket_not_found';
  end if;

  return row_to_json(v_ticket)::jsonb;
end;
$$;

grant execute on function public.fetch_rank_queue_ticket(uuid)
  to authenticated, service_role;

create or replace function public.fetch_rank_lobby_snapshot(
  p_queue_id text default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_rooms jsonb := '[]'::jsonb;
  v_limit integer := greatest(coalesce(p_limit, 12), 1);
begin
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_queue
  from (
    select
      t.id,
      t.queue_id,
      t.status,
      t.mode,
      t.owner_id,
      t.game_id,
      t.room_id,
      t.ready_expires_at,
      t.created_at,
      t.updated_at,
      t.ready_vote,
      t.async_fill_meta,
      t.seat_map,
      t.payload,
      coalesce((
        select count(*)
        from public.rank_room_slots slots
        where slots.room_id = t.room_id
          and slots.occupant_owner_id is not null
      ), 0) as occupied_slots,
      coalesce((
        select count(*)
        from public.rank_room_slots slots
        where slots.room_id = t.room_id
      ), 0) as total_slots
    from public.rank_queue_tickets t
    where (p_queue_id is null or t.queue_id = p_queue_id)
      and (
        t.owner_id is null
        or t.owner_id = auth.uid()
        or auth.role() = 'service_role'
      )
    order by t.updated_at desc
    limit v_limit
  ) as row;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_rooms
  from (
    select
      r.id,
      r.game_id,
      r.owner_id,
      r.code,
      r.mode,
      r.realtime_mode,
      r.status,
      r.slot_count,
      r.filled_count,
      r.ready_count,
      r.host_role_limit,
      r.host_last_active_at,
      r.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'slot_index', slots.slot_index,
            'role', slots.role,
            'occupant_owner_id', slots.occupant_owner_id,
            'occupant_ready', slots.occupant_ready,
            'updated_at', slots.updated_at
          )
          order by slots.slot_index
        )
        from public.rank_room_slots slots
        where slots.room_id = r.id
      ), '[]'::jsonb) as slots
    from public.rank_rooms r
    where r.status not in ('closed', 'archived')
    order by r.updated_at desc
    limit v_limit
  ) as row;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_sessions
  from (
    select
      s.id,
      s.game_id,
      s.room_id,
      s.owner_id,
      s.status,
      s.mode,
      s.turn,
      s.rating_hint,
      s.vote_snapshot,
      s.created_at,
      s.updated_at,
      sm.realtime_mode,
      sm.turn_state,
      sm.async_fill_snapshot,
      sm.extras,
      sm.turn_limit,
      sm.selected_time_limit_seconds,
      sm.drop_in_bonus_seconds,
      derived.match_instance_id,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'slot_index', roster.slot_index,
            'role', roster.role,
            'owner_id', roster.owner_id,
            'hero_id', roster.hero_id,
            'hero_name', roster.hero_name,
            'hero_summary', roster.hero_summary,
            'ready', roster.ready,
            'standin', roster.standin,
            'match_source', roster.match_source,
            'score', roster.score,
            'rating', roster.rating
          )
          order by roster.slot_index
        )
        from public.rank_match_roster roster
        where roster.match_instance_id = derived.match_instance_id
      ), '[]'::jsonb) as roster
    from public.rank_sessions s
    left join public.rank_session_meta sm on sm.session_id = s.id
    left join lateral (
      select public.try_cast_uuid(
        coalesce(
          sm.extras->>'matchInstanceId',
          sm.extras->>'match_instance_id',
          sm.async_fill_snapshot->>'matchInstanceId',
          sm.async_fill_snapshot->>'match_instance_id'
        )
      ) as match_instance_id
    ) as derived on true
    where coalesce(s.status, '') not in ('complete', 'archived')
      and (
        s.owner_id is null
        or s.owner_id = auth.uid()
        or auth.role() = 'service_role'
      )
    order by s.updated_at desc
    limit v_limit
  ) as row;

  return jsonb_build_object(
    'queue', v_queue,
    'rooms', v_rooms,
    'sessions', v_sessions
  );
end;
$$;

grant execute on function public.fetch_rank_lobby_snapshot(text, integer)
  to authenticated, service_role;

create or replace function public.fetch_rank_lobby_games(
  p_hero_id uuid,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 24), 1);
  v_games jsonb := '[]'::jsonb;
begin
  if p_hero_id is null then
    return jsonb_build_object('games', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_games
  from (
    select
      g.id,
      g.name,
      g.description,
      g.image_url,
      g.realtime_match as realtime_mode,
      g.prompt_set_id,
      g.play_count,
      g.likes_count,
      g.updated_at,
      coalesce((
        select bool_or(flag)
        from jsonb_each(coalesce(g.rules, '{}'::jsonb)) as rule(key, value)
        cross join lateral (
          select case
            when jsonb_typeof(value) = 'boolean' then value::boolean
            when jsonb_typeof(value) = 'number' then (value::numeric) <> 0
            when jsonb_typeof(value) = 'string' then lower(trim(both '"' from value::text)) in (
              'true', '1', 'yes', 'on', 'allow', 'allow-drop-in', 'enable', 'enabled', 'realtime', 'live'
            )
            when jsonb_typeof(value) = 'object' and value ? 'value' and jsonb_typeof(value->'value') = 'boolean'
              then (value->>'value')::boolean
            when jsonb_typeof(value) = 'object' and value ? 'value' and jsonb_typeof(value->'value') = 'number'
              then (value->>'value')::numeric <> 0
            when jsonb_typeof(value) = 'object' and value ? 'value' and jsonb_typeof(value->'value') = 'string'
              then lower(trim(both '"' from (value->>'value'))) in (
                'true', '1', 'yes', 'on', 'allow', 'allow-drop-in', 'enable', 'enabled', 'realtime', 'live'
              )
            else null
          end as flag
        ) as parsed
        where lower(rule.key) in ('drop_in', 'allow_drop_in', 'dropin', 'allowdropin', 'enable_drop_in', 'drop_in_enabled')
      ), false) as drop_in_enabled,
      case when ps.id is not null then jsonb_build_object(
        'id', ps.id,
        'name', ps.name,
        'description', ps.description
      ) else null end as prompt_set,
      coalesce(slot_metrics.active_slot_count, 0) as slot_count,
      coalesce(slot_metrics.slots, '[]'::jsonb) as slots,
      coalesce(prompt_metrics.slots, '[]'::jsonb) as prompt_slots,
      coalesce(participant_samples.samples, '[]'::jsonb) as participants,
      part.role as hero_role,
      part.slot_no as hero_slot_no,
      part.rating as hero_rating,
      part.score as hero_score,
      hero_role_meta.score_delta_min as hero_role_delta_min,
      hero_role_meta.score_delta_max as hero_role_delta_max,
      case
        when part.score is not null and hero_role_meta.score_delta_max is not null then
          part.score - hero_role_meta.score_delta_max
        else null
      end as hero_score_min,
      case
        when part.score is not null and hero_role_meta.score_delta_max is not null then
          part.score + hero_role_meta.score_delta_max
        else null
      end as hero_score_max,
      coalesce(role_catalog.roles, '[]'::jsonb) as role_catalog
    from public.rank_games g
    join public.rank_participants part
      on part.game_id = g.id
     and part.hero_id = p_hero_id
    left join public.prompt_sets ps on ps.id = g.prompt_set_id
    left join lateral (
      select
        count(*) filter (where coalesce(s.active, true)) as active_slot_count,
        coalesce(jsonb_agg(
          jsonb_build_object(
            'slot_index', s.slot_index,
            'role', s.role,
            'active', coalesce(s.active, true),
            'hero_id', s.hero_id,
            'hero_owner_id', s.hero_owner_id,
            'updated_at', s.updated_at
          )
          order by s.slot_index
        ), '[]'::jsonb) as slots
      from public.rank_game_slots s
      where s.game_id = g.id
    ) as slot_metrics on true
    left join lateral (
      select coalesce(jsonb_agg(
          jsonb_build_object(
            'slot_no', p.slot_no,
            'slot_type', p.slot_type,
            'is_start', p.is_start,
            'invisible', p.invisible
          )
          order by p.slot_no
        ), '[]'::jsonb) as slots
      from public.prompt_slots p
      where p.set_id = g.prompt_set_id
    ) as prompt_metrics on true
    left join public.rank_game_roles hero_role_meta
      on hero_role_meta.game_id = g.id
     and part.role is not null
     and lower(hero_role_meta.name) = lower(part.role)
    left join lateral (
      select coalesce(jsonb_agg(
          jsonb_build_object(
            'owner_id', rp.owner_id,
            'hero_id', rp.hero_id,
            'role', rp.role,
            'rating', rp.rating,
            'score', rp.score,
            'status', rp.status,
            'updated_at', rp.updated_at
          )
          order by rp.updated_at desc
        ), '[]'::jsonb) as samples
      from (
        select *
        from public.rank_participants
        where game_id = g.id
        order by updated_at desc
        limit 6
      ) rp
    ) as participant_samples on true
    left join lateral (
      select coalesce(jsonb_agg(
          jsonb_build_object(
            'name', rgr.name,
            'slot_count', rgr.slot_count,
            'active', rgr.active,
            'score_delta_min', rgr.score_delta_min,
            'score_delta_max', rgr.score_delta_max
          )
          order by rgr.name
        ), '[]'::jsonb) as roles
      from public.rank_game_roles rgr
      where rgr.game_id = g.id
    ) as role_catalog on true
    order by g.updated_at desc
    limit v_limit
  ) as row;

  return jsonb_build_object('games', v_games);
end;
$$;

grant execute on function public.fetch_rank_lobby_games(uuid, integer)
  to authenticated, service_role;

create or replace function public.cancel_rank_queue_ticket(
  queue_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select * into v_ticket
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if not found then
    return jsonb_build_object('removed', false, 'reason', 'not_found');
  end if;

  if v_ticket.owner_id is not null
     and v_ticket.owner_id <> auth.uid()
     and auth.role() <> 'service_role' then
    raise exception 'forbidden_queue_ticket';
  end if;

  delete from public.rank_queue_tickets
   where id = queue_ticket_id;

  return jsonb_build_object('removed', true);
end;
$$;

grant execute on function public.cancel_rank_queue_ticket(uuid)
  to authenticated, service_role;

create or replace function public.assert_room_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required integer;
  v_ready integer;
  v_locked integer;
begin
  if p_room_id is null then
    raise exception 'missing_room_id';
  end if;

  select count(*),
         count(*) filter (where occupant_ready),
         count(*) filter (where seat_locked)
    into v_required, v_ready, v_locked
  from public.rank_room_slots
  where room_id = p_room_id;

  if v_required = 0 then
    raise exception 'room_empty';
  end if;

  if v_locked > 0 then
    raise exception 'room_locked';
  end if;

  if v_ready < v_required then
    raise exception 'ready_check_incomplete';
  end if;
end;
$$;

grant execute on function public.assert_room_ready(uuid)
  to authenticated, service_role;

create or replace function public.ensure_rank_session_for_room(
  p_room_id uuid,
  p_game_id uuid,
  p_owner_id uuid,
  p_mode text,
  p_vote jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_turn_limit integer;
  v_vote_payload jsonb;
  v_room_owner uuid;
  v_room_mode text;
begin
  if p_room_id is null then
    raise exception 'missing_room_id';
  end if;

  select owner_id, mode
    into v_room_owner, v_room_mode
  from public.rank_rooms
  where id = p_room_id;

  if v_room_owner is null then
    raise exception 'room_not_found';
  end if;

  if p_owner_id is null then
    raise exception 'missing_owner_id';
  end if;

  if v_room_owner <> p_owner_id then
    raise exception 'room_owner_mismatch';
  end if;

  v_turn_limit := coalesce((p_vote->>'turn_limit')::integer, 0);
  v_vote_payload := coalesce(p_vote, '{}'::jsonb);

  select id
    into v_session_id
  from public.rank_sessions
  where room_id = p_room_id
    and status = 'active'
  order by updated_at desc
  limit 1;

  if v_session_id is null then
    insert into public.rank_sessions (
      room_id,
      game_id,
      owner_id,
      status,
      turn,
      mode,
      vote_snapshot
    )
    values (
      p_room_id,
      p_game_id,
      v_room_owner,
      'active',
      0,
      coalesce(p_mode, v_room_mode),
      v_vote_payload
    )
    returning id into v_session_id;
  else
    update public.rank_sessions
       set updated_at = now(),
           mode = coalesce(p_mode, v_room_mode, mode),
           vote_snapshot = v_vote_payload
     where id = v_session_id;
  end if;

  if v_turn_limit > 0 then
    update public.rank_session_meta
       set turn_limit = v_turn_limit,
           selected_time_limit_seconds = v_turn_limit,
           updated_at = now()
     where session_id = v_session_id;

    if not found then
      insert into public.rank_session_meta (session_id, turn_limit, selected_time_limit_seconds)
      values (v_session_id, v_turn_limit, v_turn_limit);
    end if;
  end if;

  return v_session_id;
end;
$$;

grant execute on function public.ensure_rank_session_for_room(uuid, uuid, uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.upsert_rank_session_async_fill(
  p_session_id uuid,
  p_async_fill jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rank_session_meta
     set async_fill_snapshot = p_async_fill,
         updated_at = now()
   where session_id = p_session_id;

  if not found then
    insert into public.rank_session_meta (
      session_id,
      async_fill_snapshot
    )
    values (
      p_session_id,
      p_async_fill
    );
  end if;
end;
$$;

grant execute on function public.upsert_rank_session_async_fill(uuid, jsonb)
  to authenticated, service_role;

create or replace function public.stage_rank_match(
  queue_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
  v_session_id uuid;
  v_ready_expires_at timestamptz;
  v_seats jsonb;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select * into v_ticket
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if not found then
    raise exception 'queue_ticket_not_found';
  end if;

  perform public.assert_room_ready(v_ticket.room_id);

  v_session_id := public.ensure_rank_session_for_room(
    v_ticket.room_id,
    v_ticket.game_id,
    v_ticket.owner_id,
    v_ticket.mode,
    v_ticket.ready_vote
  );

  perform public.upsert_rank_session_async_fill(v_session_id, v_ticket.async_fill_meta);

  v_ready_expires_at := now() + interval '15 seconds';

  v_seats := (
    select jsonb_agg(
      jsonb_build_object(
        'index', slot.slot_index,
        'owner_id', slot.occupant_owner_id,
        'hero_name', slot.occupant_hero_name,
        'ready', slot.occupant_ready
      )
      order by slot.slot_index
    )
    from public.rank_room_slots slot
    where slot.room_id = v_ticket.room_id
  );

  update public.rank_queue_tickets
     set seat_map = coalesce(v_seats, '[]'::jsonb),
         ready_expires_at = v_ready_expires_at,
         status = 'staging',
         updated_at = now()
   where id = queue_ticket_id;

  return jsonb_build_object(
    'session_id', v_session_id,
    'ready_expires_at', v_ready_expires_at,
    'seats', coalesce(v_seats, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.stage_rank_match(uuid)
  to authenticated, service_role;

create or replace function public.evict_unready_participant(
  queue_ticket_id uuid,
  seat_index integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_seats jsonb;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select room_id into v_room_id
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if v_room_id is null then
    raise exception 'queue_ticket_not_found';
  end if;

  update public.rank_room_slots
     set occupant_owner_id = null,
         occupant_ready = false,
         occupant_hero_id = null,
         joined_at = null
   where room_id = v_room_id
     and slot_index = seat_index;

  v_seats := (
    select jsonb_agg(
      jsonb_build_object(
        'index', slot.slot_index,
        'owner_id', slot.occupant_owner_id,
        'hero_name', slot.occupant_hero_name,
        'ready', slot.occupant_ready
      )
      order by slot.slot_index
    )
    from public.rank_room_slots slot
    where slot.room_id = v_room_id
  );

  update public.rank_queue_tickets
     set seat_map = coalesce(v_seats, '[]'::jsonb),
         status = 'evicted',
         updated_at = now()
   where id = queue_ticket_id;
end;
$$;

grant execute on function public.evict_unready_participant(uuid, integer)
  to authenticated, service_role;

create or replace function public.fetch_rank_session_turns(
  p_session_id uuid,
  p_limit integer default 120
)
returns table (
  id bigint,
  session_id uuid,
  idx integer,
  role text,
  content text,
  public boolean,
  is_visible boolean,
  summary_payload jsonb,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then
    raise exception 'missing_session_id';
  end if;

  return query
  select
    t.id,
    t.session_id,
    t.idx,
    t.role,
    t.content,
    t.public,
    coalesce(t.is_visible, true) as is_visible,
    t.summary_payload,
    t.metadata,
    t.created_at
  from public.rank_turns t
  where t.session_id = p_session_id
  order by t.idx asc, t.created_at asc
  limit coalesce(p_limit, 120);
end;
$$;

grant execute on function public.fetch_rank_session_turns(uuid, integer)
  to authenticated, service_role;

create or replace function public.finalize_rank_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.rank_sessions;
  v_participants jsonb;
begin
  select * into v_session from public.rank_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  v_participants := (
    select jsonb_agg(
      jsonb_build_object(
        'owner_id', slot.occupant_owner_id,
        'hero_name', slot.occupant_hero_name,
        'score_delta', slot.score_delta,
        'final_score', slot.final_score
      )
    )
    from public.rank_session_meta slot
    where slot.session_id = p_session_id
  );

  return jsonb_build_object(
    'session_id', p_session_id,
    'status', v_session.status,
    'completed_at', v_session.completed_at,
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.finalize_rank_session(uuid)
  to authenticated, service_role;

create or replace function public.upsert_match_session_meta(
  p_session_id uuid,
  p_selected_time_limit integer default null,
  p_time_vote jsonb default null,
  p_drop_in_bonus_seconds integer default 0,
  p_turn_state jsonb default null,
  p_async_fill_snapshot jsonb default null,
  p_realtime_mode text default null,
  p_extras jsonb default null
)
returns table (
  session_id uuid,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  drop_in_bonus_seconds integer,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  realtime_mode text,
  extras jsonb,
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
    extras,
    updated_at
  ) values (
    p_session_id,
    p_selected_time_limit,
    p_time_vote,
    p_drop_in_bonus_seconds,
    p_turn_state,
    p_async_fill_snapshot,
    v_mode,
    case when p_extras is null then null else p_extras end,
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
    extras = case when p_extras is null then m.extras else p_extras end,
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
    v_row.extras,
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
  text,
  jsonb
) to service_role;

create or replace function public.sync_rank_match_roster(
  p_room_id uuid,
  p_game_id uuid,
  p_match_instance_id uuid,
  p_request_owner_id uuid,
  p_roster jsonb,
  p_slot_template_version bigint default null,
  p_slot_template_source text default null,
  p_slot_template_updated_at timestamptz default null
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
  v_room_owner uuid;
begin
  if p_room_id is null or p_game_id is null or p_match_instance_id is null then
    raise exception 'missing_identifiers';
  end if;

  if p_request_owner_id is null then
    raise exception 'missing_request_owner_id';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'empty_roster';
  end if;

  select owner_id
    into v_room_owner
  from public.rank_rooms
  where id = p_room_id;

  if v_room_owner is null then
    raise exception 'room_not_found';
  end if;

  if v_room_owner <> p_request_owner_id then
    raise exception 'room_owner_mismatch';
  end if;

  select max(r.slot_template_version)
  into v_current_version
  from public.rank_match_roster as r
  where r.room_id = p_room_id;

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
    (select count(*)::integer from inserted) as inserted_count,
    v_version as slot_template_version,
    v_updated_at as slot_template_updated_at;
end;
$$;

grant execute on function public.sync_rank_match_roster(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  bigint,
  text,
  timestamptz
) to service_role;

drop function if exists public.reconcile_rank_queue_for_roster(uuid, text, jsonb);

create or replace function public.reconcile_rank_queue_for_roster(
  p_game_id uuid,
  p_mode text,
  p_roster jsonb
)
returns table (
  reconciled integer,
  inserted integer,
  removed integer,
  sanitized jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_mode text := coalesce(nullif(trim(p_mode), ''), 'solo');
  v_payload jsonb := '[]'::jsonb;
  v_removed integer := 0;
  v_inserted integer := 0;
  v_has_duplicate boolean := false;
  v_has_mismatch boolean := false;
begin
  if p_game_id is null then
    raise exception 'missing_game_id';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' then
    raise exception 'invalid_roster';
  end if;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'owner_id', owner_id::text,
          'hero_id', hero_id::text,
          'role', role,
          'slot_index', slot_index
        )
      ),
      '[]'::jsonb
    )
    into v_payload
  from (
    select owner_id, hero_id, role, slot_index
    from (
      select
        nullif(trim(entry->>'owner_id'), '')::uuid as owner_id,
        nullif(trim(entry->>'hero_id'), '')::uuid as hero_id,
        coalesce(nullif(entry->>'role', ''), '역할 미지정') as role,
        coalesce((entry->>'slot_index')::integer, ord - 1) as slot_index,
        row_number() over (
          partition by nullif(trim(entry->>'owner_id'), '')::uuid
          order by coalesce((entry->>'slot_index')::integer, ord - 1),
            nullif(trim(entry->>'hero_id'), ''),
            coalesce(nullif(entry->>'role', ''), '역할 미지정'),
            ord
        ) as owner_rank
      from (
        select jsonb_array_elements(p_roster) as entry, row_number() over () as ord
      ) indexed
    ) ranked
    where owner_id is not null
      and owner_rank = 1
  ) deduped;

  if jsonb_typeof(v_payload) <> 'array' or jsonb_array_length(v_payload) = 0 then
    return query
      select 0::integer as reconciled, 0::integer as inserted, 0::integer as removed, '[]'::jsonb as sanitized;
  end if;

  delete from public.rank_match_queue q
  where q.game_id = p_game_id
    and q.mode = v_mode
    and q.owner_id in (
      select (value->>'owner_id')::uuid
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  with payload as (
    select
      (value->>'owner_id')::uuid as owner_id,
      nullif(value->>'hero_id', '')::uuid as hero_id,
      coalesce(nullif(value->>'role', ''), '역할 미지정') as role,
      coalesce((value->>'slot_index')::integer, ord::integer - 1) as slot_index,
      ord
    from jsonb_array_elements(v_payload) with ordinality as payload(value, ord)
  ), inserted_rows as (
    insert into public.rank_match_queue (
      game_id,
      mode,
      owner_id,
      hero_id,
      role,
      score,
      simulated,
      party_key,
      status,
      joined_at,
      updated_at,
      match_code
    )
    select
      p_game_id,
      v_mode,
      payload.owner_id,
      payload.hero_id,
      payload.role,
      coalesce(participants.score, 1000),
      false,
      null,
      'matched',
      v_now,
      v_now,
      null
    from payload
    left join public.rank_participants participants
      on participants.game_id = p_game_id
     and participants.owner_id = payload.owner_id
    returning owner_id
  )
  select count(*)
    into v_inserted
  from inserted_rows;

  select exists (
    with payload as (
      select
        (value->>'owner_id')::uuid as owner_id,
        nullif(value->>'hero_id', '')::uuid as hero_id,
        coalesce(nullif(value->>'role', ''), '역할 미지정') as role
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    )
    select 1
    from public.rank_match_queue q
    join payload on payload.owner_id = q.owner_id
    where q.game_id = p_game_id
      and q.mode = v_mode
    group by q.owner_id
    having count(*) <> 1
  )
  into v_has_duplicate;

  if v_has_duplicate then
    raise exception 'queue_reconcile_failed';
  end if;

  select exists (
    with payload as (
      select
        (value->>'owner_id')::uuid as owner_id,
        nullif(value->>'hero_id', '')::uuid as hero_id,
        coalesce(nullif(value->>'role', ''), '역할 미지정') as role
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    )
    select 1
    from public.rank_match_queue q
    join payload on payload.owner_id = q.owner_id
    where q.game_id = p_game_id
      and q.mode = v_mode
      and (
        coalesce(q.role, '') <> coalesce(payload.role, '')
        or coalesce(q.hero_id::text, '') <> coalesce(payload.hero_id::text, '')
        or lower(coalesce(q.status, '')) <> 'matched'
      )
  )
  into v_has_mismatch;

  if v_has_mismatch then
    raise exception 'queue_reconcile_failed';
  end if;

    return query
      select
        jsonb_array_length(v_payload)::integer as reconciled,
        v_inserted::integer as inserted,
        v_removed::integer as removed,
        v_payload as sanitized;
  end;
$$;

grant execute on function public.reconcile_rank_queue_for_roster(
  uuid,
  text,
  jsonb
) to authenticated, service_role;

drop function if exists public.prepare_rank_match_session(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb
);

create or replace function public.prepare_rank_match_session(
  p_room_id uuid,
  p_game_id uuid,
  p_match_instance_id uuid,
  p_request_owner_id uuid,
  p_mode text,
  p_vote jsonb,
  p_async_fill jsonb,
  p_roster jsonb,
  p_slot_template jsonb
)
returns table (
  session_id uuid,
  slot_template_version bigint,
  slot_template_updated_at timestamptz,
  queue_reconciled integer,
  queue_inserted integer,
  queue_removed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_owner uuid;
  v_room_mode text;
  v_slot_version bigint;
  v_slot_source text;
  v_slot_updated_at timestamptz;
  v_vote jsonb := coalesce(p_vote, '{}'::jsonb);
  v_async jsonb := p_async_fill;
  v_reconciled integer := 0;
  v_inserted integer := 0;
  v_removed integer := 0;
  v_session uuid;
  v_now timestamptz := now();
begin
  if p_room_id is null or p_game_id is null or p_match_instance_id is null then
    raise exception 'missing_identifiers';
  end if;

  if p_request_owner_id is null then
    raise exception 'missing_request_owner_id';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'empty_roster';
  end if;

  select owner_id, mode
    into v_room_owner, v_room_mode
  from public.rank_rooms
  where id = p_room_id;

  if v_room_owner is null then
    raise exception 'room_not_found';
  end if;

  if v_room_owner <> p_request_owner_id then
    raise exception 'room_owner_mismatch';
  end if;

  perform public.assert_room_ready(p_room_id);

  select
    coalesce((p_slot_template->>'version')::bigint, r.slot_template_version, (extract(epoch from v_now) * 1000)::bigint),
    coalesce(nullif(p_slot_template->>'source', ''), r.slot_template_source, 'room-stage'),
    coalesce((p_slot_template->>'updated_at')::timestamptz, r.slot_template_updated_at, v_now)
  into v_slot_version, v_slot_source, v_slot_updated_at
  from public.rank_rooms as r
  where r.id = p_room_id;

  select
    r.reconciled,
    r.inserted,
    r.removed
  into v_reconciled, v_inserted, v_removed
  from public.reconcile_rank_queue_for_roster(
    p_game_id,
    coalesce(p_mode, v_room_mode, 'solo'),
    p_roster
  ) as r;

  select
    result.slot_template_version,
    result.slot_template_updated_at
  into v_slot_version, v_slot_updated_at
  from public.sync_rank_match_roster(
    p_room_id,
    p_game_id,
    p_match_instance_id,
    p_request_owner_id,
    p_roster,
    v_slot_version,
    v_slot_source,
    v_slot_updated_at
  ) as result;

  select public.ensure_rank_session_for_room(
    p_room_id,
    p_game_id,
    p_request_owner_id,
    coalesce(p_mode, v_room_mode),
    v_vote
  ) into v_session;

  if v_async is not null and jsonb_typeof(v_async) = 'object' then
    perform public.upsert_rank_session_async_fill(v_session, v_async);
  end if;

  return query
    select
      v_session,
      v_slot_version,
      v_slot_updated_at,
      v_reconciled,
      v_inserted,
      v_removed;
end;
$$;

grant execute on function public.prepare_rank_match_session(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to authenticated, service_role;

create index if not exists rank_edge_function_deployments_env_idx
on public.rank_edge_function_deployments (environment, created_at desc);

alter table public.rank_edge_function_deployments enable row level security;

drop policy if exists rank_edge_function_deployments_select on public.rank_edge_function_deployments;
create policy rank_edge_function_deployments_select
on public.rank_edge_function_deployments for select using (true);

drop policy if exists rank_edge_function_deployments_insert on public.rank_edge_function_deployments;
create policy rank_edge_function_deployments_insert
on public.rank_edge_function_deployments for insert
with check (auth.role() = 'service_role');

-- =========================================
--  공용 채팅 테이블
-- =========================================
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete set null,
  name text not null,
  description text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  capacity integer not null default 50 check (capacity between 2 and 500),
  default_background_url text,
  default_ban_minutes integer not null default 0,
  default_theme jsonb,
  allow_ai boolean not null default true,
  require_approval boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.chat_rooms
  add column if not exists default_background_url text;

alter table public.chat_rooms
  add column if not exists default_ban_minutes integer not null default 0;

alter table public.chat_rooms
  add column if not exists default_theme jsonb;

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  role text,
  status text not null default 'active',
  is_moderator boolean not null default false,
  room_owner_id uuid,
  room_visibility text,
  joined_at timestamptz not null default timezone('utc', now()),
  last_active_at timestamptz not null default timezone('utc', now()),
  last_read_message_at timestamptz,
  last_read_message_id uuid,
  primary key (room_id, owner_id)
);

alter table public.chat_room_members
  add column if not exists room_owner_id uuid;

alter table public.chat_room_members
  add column if not exists room_visibility text;

alter table public.chat_room_members
  add column if not exists last_read_message_at timestamptz;

alter table public.chat_room_members
  add column if not exists last_read_message_id uuid;

alter table public.chat_room_members
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.chat_room_members
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.chat_room_moderators (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  primary key (room_id, owner_id)
);

create table if not exists public.chat_room_bans (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id) on delete set null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, owner_id)
);

create table if not exists public.chat_room_announcements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text not null,
  image_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.chat_room_announcements
  add column if not exists title text;

alter table public.chat_room_announcements
  add column if not exists image_url text;

alter table public.chat_room_announcements
  add column if not exists pinned boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_room_announcements'
      and column_name = 'pinned'
  ) then
    alter table public.chat_room_announcements
      alter column pinned set default false;
    update public.chat_room_announcements
      set pinned = false
      where pinned is null;
    alter table public.chat_room_announcements
      alter column pinned set not null;
  end if;
end $$;

create table if not exists public.chat_room_announcement_polls (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.chat_room_announcements(id) on delete cascade,
  question text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_room_announcement_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_room_announcement_polls(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_room_announcement_poll_votes (
  poll_id uuid not null references public.chat_room_announcement_polls(id) on delete cascade,
  option_id uuid not null references public.chat_room_announcement_poll_options(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (poll_id, owner_id)
);

alter table public.chat_room_announcement_polls enable row level security;
alter table public.chat_room_announcement_poll_options enable row level security;
alter table public.chat_room_announcement_poll_votes enable row level security;

create table if not exists public.chat_room_announcement_reactions (
  announcement_id uuid not null references public.chat_room_announcements(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'heart',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (announcement_id, owner_id)
);

create table if not exists public.chat_room_announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.chat_room_announcements(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_room_member_preferences (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  bubble_color text,
  text_color text,
  background_url text,
  use_room_background boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, owner_id)
);

create table if not exists public.chat_room_search_terms (
  query text primary key,
  search_count bigint not null default 0,
  last_searched_at timestamptz not null default timezone('utc', now()),
  last_owner_id uuid
);

create index if not exists chat_room_search_terms_count_idx
  on public.chat_room_search_terms (search_count desc, last_searched_at desc);

create index if not exists chat_room_search_terms_last_idx
  on public.chat_room_search_terms (last_searched_at desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_bans enable row level security;
alter table public.chat_room_announcements enable row level security;
alter table public.chat_room_announcement_reactions enable row level security;
alter table public.chat_room_announcement_comments enable row level security;
alter table public.chat_room_member_preferences enable row level security;

drop policy if exists chat_rooms_select on public.chat_rooms;
create policy chat_rooms_select
on public.chat_rooms for select
using (
  visibility = 'public'
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_rooms.id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_rooms_insert on public.chat_rooms;
create policy chat_rooms_insert
on public.chat_rooms for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists chat_rooms_update on public.chat_rooms;
create policy chat_rooms_update
on public.chat_rooms for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists chat_rooms_delete on public.chat_rooms;
create policy chat_rooms_delete
on public.chat_rooms for delete
using (auth.uid() = owner_id);

drop policy if exists chat_room_members_select on public.chat_room_members;
create policy chat_room_members_select
on public.chat_room_members for select
using (
  owner_id = auth.uid()
  or room_owner_id = auth.uid()
  or room_visibility = 'public'
  or exists (
    select 1
    from public.chat_room_moderators m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_members_insert on public.chat_room_members;
create policy chat_room_members_insert
on public.chat_room_members for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists chat_room_members_update on public.chat_room_members;
drop policy if exists chat_room_members_delete on public.chat_room_members;

drop function if exists public.is_chat_room_moderator(uuid, uuid);

create policy chat_room_members_update
on public.chat_room_members for update
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_moderators m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
  )
  or room_owner_id = auth.uid()
)
with check (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_moderators m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
  )
  or room_owner_id = auth.uid()
);

create policy chat_room_members_delete
on public.chat_room_members for delete
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_moderators m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
  )
  or room_owner_id = auth.uid()
);

drop policy if exists chat_room_bans_select on public.chat_room_bans;
create policy chat_room_bans_select
on public.chat_room_bans for select
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_bans.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_bans.room_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_bans_mutate on public.chat_room_bans;
create policy chat_room_bans_mutate
on public.chat_room_bans for all
using (
  exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_bans.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_bans.room_id
      and m.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_bans.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_bans.room_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcements_select on public.chat_room_announcements;
create policy chat_room_announcements_select
on public.chat_room_announcements for select
using (
  exists (
    select 1
    from public.chat_room_members mem
    where mem.room_id = chat_room_announcements.room_id
      and mem.owner_id = auth.uid()
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_announcements.room_id
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcements_mutate on public.chat_room_announcements;
create policy chat_room_announcements_mutate
on public.chat_room_announcements for all
using (
  exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_announcements.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_announcements.room_id
      and m.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_announcements.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_announcements.room_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_reactions_select on public.chat_room_announcement_reactions;
create policy chat_room_announcement_reactions_select
on public.chat_room_announcement_reactions for select
using (
  exists (
    select 1
    from public.chat_room_announcements a
    join public.chat_room_members mem
      on mem.room_id = a.room_id
     and mem.owner_id = auth.uid()
    where a.id = chat_room_announcement_reactions.announcement_id
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_reactions.announcement_id
    )
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_reactions_mutate on public.chat_room_announcement_reactions;
create policy chat_room_announcement_reactions_mutate
on public.chat_room_announcement_reactions for all
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_reactions.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_reactions.announcement_id
    )
      and m.owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_reactions.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_reactions.announcement_id
    )
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_comments_select on public.chat_room_announcement_comments;
create policy chat_room_announcement_comments_select
on public.chat_room_announcement_comments for select
using (
  exists (
    select 1
    from public.chat_room_announcements a
    join public.chat_room_members mem
      on mem.room_id = a.room_id
     and mem.owner_id = auth.uid()
    where a.id = chat_room_announcement_comments.announcement_id
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_comments.announcement_id
    )
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_comments_mutate on public.chat_room_announcement_comments;
create policy chat_room_announcement_comments_mutate
on public.chat_room_announcement_comments for all
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_comments.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_comments.announcement_id
    )
      and m.owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_comments.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_comments.announcement_id
    )
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_polls_select on public.chat_room_announcement_polls;
create policy chat_room_announcement_polls_select
on public.chat_room_announcement_polls for select
using (
  exists (
    select 1
    from public.chat_room_announcements a
    join public.chat_room_members mem
      on mem.room_id = a.room_id
     and mem.owner_id = auth.uid()
    where a.id = chat_room_announcement_polls.announcement_id
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_polls.announcement_id
    )
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_polls_mutate on public.chat_room_announcement_polls;
create policy chat_room_announcement_polls_mutate
on public.chat_room_announcement_polls for all
using (
  exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_polls.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_polls.announcement_id
    )
      and m.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_polls.announcement_id
    )
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = (
      select a.room_id from public.chat_room_announcements a
      where a.id = chat_room_announcement_polls.announcement_id
    )
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_poll_options_select on public.chat_room_announcement_poll_options;
create policy chat_room_announcement_poll_options_select
on public.chat_room_announcement_poll_options for select
using (
  exists (
    select 1
    from public.chat_room_announcement_polls p
    join public.chat_room_announcements a on a.id = p.announcement_id
    join public.chat_room_members mem
      on mem.room_id = a.room_id
     and mem.owner_id = auth.uid()
    where p.id = chat_room_announcement_poll_options.poll_id
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id
      from public.chat_room_announcement_polls p
      join public.chat_room_announcements a on a.id = p.announcement_id
      where p.id = chat_room_announcement_poll_options.poll_id
    )
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_announcement_poll_votes_select on public.chat_room_announcement_poll_votes;
create policy chat_room_announcement_poll_votes_select
on public.chat_room_announcement_poll_votes for select
using (
  exists (
    select 1
    from public.chat_room_announcement_polls p
    join public.chat_room_announcements a on a.id = p.announcement_id
    join public.chat_room_members mem
      on mem.room_id = a.room_id
     and mem.owner_id = auth.uid()
    where p.id = chat_room_announcement_poll_votes.poll_id
      and coalesce(mem.status, 'active') = 'active'
  )
  or exists (
    select 1 from public.chat_rooms r
    where r.id = (
      select a.room_id
      from public.chat_room_announcement_polls p
      join public.chat_room_announcements a on a.id = p.announcement_id
      where p.id = chat_room_announcement_poll_votes.poll_id
    )
      and r.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_member_preferences_select on public.chat_room_member_preferences;
create policy chat_room_member_preferences_select
on public.chat_room_member_preferences for select
using (
  auth.uid() = owner_id
  or exists (
    select 1 from public.chat_rooms r
    where r.id = chat_room_member_preferences.room_id
      and r.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.chat_room_moderators m
    where m.room_id = chat_room_member_preferences.room_id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_room_member_preferences_mutate on public.chat_room_member_preferences;
create policy chat_room_member_preferences_mutate
on public.chat_room_member_preferences for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists chat_rooms_visibility_idx
  on public.chat_rooms (visibility, updated_at desc);

create index if not exists chat_room_members_owner_idx
  on public.chat_room_members (owner_id, room_id);

create index if not exists chat_room_members_room_idx
  on public.chat_room_members (room_id, last_active_at desc);

create index if not exists chat_room_moderators_owner_idx
  on public.chat_room_moderators (owner_id, room_id);

create index if not exists chat_room_members_last_read_idx
  on public.chat_room_members (room_id, last_read_message_at desc);

create index if not exists chat_room_moderators_room_idx
  on public.chat_room_moderators (room_id, owner_id);

create index if not exists chat_room_bans_room_idx
  on public.chat_room_bans (room_id, expires_at desc);

create index if not exists chat_room_bans_owner_idx
  on public.chat_room_bans (owner_id, room_id);

create index if not exists chat_room_announcements_room_idx
  on public.chat_room_announcements (room_id, created_at desc);

create index if not exists chat_room_announcement_comments_ann_idx
  on public.chat_room_announcement_comments (announcement_id, created_at desc);

create index if not exists chat_room_announcement_reactions_ann_idx
  on public.chat_room_announcement_reactions (announcement_id, owner_id);

create index if not exists chat_room_member_preferences_owner_idx
  on public.chat_room_member_preferences (owner_id, room_id);

create or replace function public.populate_chat_room_member_room_metadata()
returns trigger
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_visibility text;
begin
  if new.room_id is null then
    new.room_owner_id := null;
    new.room_visibility := null;
    return new;
  end if;

  select r.owner_id, r.visibility
    into v_owner_id, v_visibility
  from public.chat_rooms r
  where r.id = new.room_id;

  new.room_owner_id := v_owner_id;
  new.room_visibility := v_visibility;
  if new.last_read_message_at is null then
    new.last_read_message_at := new.joined_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chat_room_members_room_metadata on public.chat_room_members;
create trigger trg_chat_room_members_room_metadata
before insert or update on public.chat_room_members
for each row execute function public.populate_chat_room_member_room_metadata();

create or replace function public.refresh_chat_room_members_room_metadata()
returns trigger
language plpgsql
as $$
begin
  if (old.owner_id is not distinct from new.owner_id)
     and (old.visibility is not distinct from new.visibility) then
    return new;
  end if;

  update public.chat_room_members m
  set room_owner_id = new.owner_id,
      room_visibility = new.visibility
  where m.room_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_chat_rooms_refresh_member_metadata on public.chat_rooms;
create trigger trg_chat_rooms_refresh_member_metadata
after update on public.chat_rooms
for each row execute function public.refresh_chat_room_members_room_metadata();

create or replace function public.touch_chat_room_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_chat_rooms_set_updated_at on public.chat_rooms;
create trigger trg_chat_rooms_set_updated_at
before update on public.chat_rooms
for each row
execute function public.touch_chat_room_updated_at();

create or replace function public.touch_chat_room_member_activity()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  if new.status = 'active' then
    new.last_active_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_room_members_touch on public.chat_room_members;
create trigger trg_chat_room_members_touch
before update on public.chat_room_members
for each row
execute function public.touch_chat_room_member_activity();

create or replace function public.touch_chat_room_ban()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_chat_room_bans_touch on public.chat_room_bans;
create trigger trg_chat_room_bans_touch
before update on public.chat_room_bans
for each row
execute function public.touch_chat_room_ban();

create or replace function public.touch_chat_room_announcement()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_chat_room_announcements_touch on public.chat_room_announcements;
create trigger trg_chat_room_announcements_touch
before update on public.chat_room_announcements
for each row
execute function public.touch_chat_room_announcement();

create or replace function public.touch_chat_room_member_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_chat_room_member_preferences_touch on public.chat_room_member_preferences;
create trigger trg_chat_room_member_preferences_touch
before update on public.chat_room_member_preferences
for each row
execute function public.touch_chat_room_member_preferences();

create or replace function public.sync_chat_room_moderators()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.chat_room_moderators
    where room_id = old.room_id
      and owner_id = old.owner_id;
    return null;
  end if;

  if TG_OP = 'UPDATE' then
    if (old.room_id, old.owner_id) is distinct from (new.room_id, new.owner_id)
       or not coalesce(new.is_moderator, false)
       or coalesce(new.status, 'active') <> 'active' then
      delete from public.chat_room_moderators
      where room_id = old.room_id
        and owner_id = old.owner_id;
    end if;
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    if coalesce(new.is_moderator, false)
       and coalesce(new.status, 'active') = 'active' then
      insert into public.chat_room_moderators (room_id, owner_id)
      values (new.room_id, new.owner_id)
      on conflict (room_id, owner_id) do nothing;
    else
      delete from public.chat_room_moderators
      where room_id = new.room_id
        and owner_id = new.owner_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_chat_room_members_sync_moderators on public.chat_room_members;
create trigger trg_chat_room_members_sync_moderators
after insert or update or delete on public.chat_room_members
for each row execute function public.sync_chat_room_moderators();

insert into public.chat_room_moderators (room_id, owner_id)
select m.room_id, m.owner_id
from public.chat_room_members m
where coalesce(m.is_moderator, false)
  and coalesce(m.status, 'active') = 'active'
on conflict (room_id, owner_id) do nothing;

update public.chat_room_members m
set room_owner_id = r.owner_id,
    room_visibility = r.visibility,
    last_read_message_at = coalesce(m.last_read_message_at, m.joined_at)
from public.chat_rooms r
where r.id = m.room_id;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  scope text not null default 'global',
  channel_type text not null default 'lobby',
  session_id uuid references public.rank_sessions(id) on delete set null,
  match_instance_id uuid,
  game_id uuid references public.rank_games(id) on delete set null,
  room_id uuid references public.rank_rooms(id) on delete set null,
  chat_room_id uuid references public.chat_rooms(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete set null,
  username text not null,
  avatar_url text,
  role text,
  target_hero_id uuid references public.heroes(id) on delete set null,
  target_owner_id uuid references auth.users(id) on delete set null,
  target_role text,
  text text not null check (length(text) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  visible_owner_ids uuid[] default null,
  thread_hint text
);

alter table public.messages enable row level security;

alter table public.messages
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.messages
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.messages
  add column if not exists scope text not null default 'global';

alter table public.messages
  add column if not exists channel_type text not null default 'lobby';

alter table public.messages
  add column if not exists session_id uuid references public.rank_sessions(id) on delete set null;

alter table public.messages
  add column if not exists match_instance_id uuid;

alter table public.messages
  add column if not exists game_id uuid references public.rank_games(id) on delete set null;

alter table public.messages
  add column if not exists room_id uuid references public.rank_rooms(id) on delete set null;

alter table public.messages
  add column if not exists chat_room_id uuid references public.chat_rooms(id) on delete set null;

alter table public.messages
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.messages
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.messages
  add column if not exists hero_id uuid references public.heroes(id) on delete set null;

alter table public.messages
  add column if not exists role text;

alter table public.messages
  add column if not exists target_hero_id uuid references public.heroes(id) on delete set null;

alter table public.messages
  add column if not exists target_owner_id uuid references auth.users(id) on delete set null;

alter table public.messages
  add column if not exists target_role text;

alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.messages
  add column if not exists visible_owner_ids uuid[] default null;

alter table public.messages
  add column if not exists thread_hint text;

alter table public.messages
  alter column created_at set default timezone('utc', now());

alter table public.messages
  alter column updated_at set default timezone('utc', now());

alter table public.messages
  alter column scope set default 'global';

alter table public.messages
  alter column channel_type set default 'lobby';

alter table public.messages
  alter column metadata set default '{}'::jsonb;

alter table public.messages
  drop constraint if exists messages_channel_type_check;

alter table public.messages
  add constraint messages_channel_type_check
  check (channel_type in ('lobby', 'main', 'role', 'whisper', 'system', 'room'));

alter table public.messages
  drop constraint if exists messages_scope_check;

alter table public.messages
  add constraint messages_scope_check
  check (scope in ('global', 'main', 'role', 'whisper', 'system', 'room'));

create index if not exists messages_created_at_idx
  on public.messages (created_at desc);

create index if not exists messages_scope_created_at_idx
  on public.messages (scope, created_at desc);

create index if not exists messages_session_scope_idx
  on public.messages (session_id, scope, created_at desc);

create index if not exists messages_match_instance_idx
  on public.messages (match_instance_id, created_at desc);

create index if not exists messages_owner_scope_idx
  on public.messages (owner_id, scope, created_at desc);

create index if not exists messages_room_idx
  on public.messages (room_id, created_at desc);

create index if not exists messages_chat_room_idx
  on public.messages (chat_room_id, created_at desc);

create or replace function public.touch_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_messages_set_updated_at on public.messages;
create trigger trg_messages_set_updated_at
before update on public.messages
for each row
execute function public.touch_messages_updated_at();

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.messages', policy_record.policyname);
  end loop;
end;
$$;

drop policy if exists messages_select_public on public.messages;
create policy messages_select_public
on public.messages for select
to authenticated
using (
  scope = 'global'
  or visible_owner_ids is null
  or auth.uid() = owner_id
  or auth.uid() = user_id
  or (visible_owner_ids is not null and auth.uid() = any(visible_owner_ids))
  or (
    chat_room_id is not null
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.room_id = messages.chat_room_id
        and crm.owner_id = auth.uid()
        and coalesce(crm.status, 'active') = 'active'
    )
  )
  or (
    room_id is not null
    and (
      exists (
        select 1
        from public.rank_room_slots rrs
        where rrs.room_id = messages.room_id
          and rrs.occupant_owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.rank_rooms rr
        where rr.id = messages.room_id
          and rr.owner_id = auth.uid()
      )
    )
  )
  or (
    match_instance_id is not null
    and exists (
      select 1
      from public.rank_match_roster rmr
      where rmr.match_instance_id = messages.match_instance_id
        and rmr.owner_id = auth.uid()
    )
  )
  or (
    session_id is not null
    and public.is_rank_session_owner_or_roster(messages.session_id, auth.uid())
  )
);

drop policy if exists messages_insert_service_role on public.messages;
drop policy if exists messages_insert_auth on public.messages;
create policy messages_insert_service_role
on public.messages for insert
with check (auth.role() = 'service_role');

drop policy if exists messages_update_service_role on public.messages;
create policy messages_update_service_role
on public.messages for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists messages_delete_service_role on public.messages;
create policy messages_delete_service_role
on public.messages for delete
using (auth.role() = 'service_role');

-- =========================================
--  Realtime broadcast helpers
-- =========================================
drop policy if exists realtime_messages_select_authenticated on realtime.messages;
create policy realtime_messages_select_authenticated
on realtime.messages for select
to authenticated
using (true);

create or replace function public.emit_realtime_payload(
  p_topics text[],
  p_event text,
  p_table text,
  p_schema text,
  p_new jsonb,
  p_old jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  topic text;
  v_topic text;
  v_final_topic text;
begin
  if p_topics is null then
    return;
  end if;

  for topic in
    select distinct trim(both from value)
    from unnest(p_topics) as entries(value)
    where trim(both from value) <> ''
  loop
    v_topic := trim(both from topic);
    if v_topic is null or v_topic = '' then
      continue;
    end if;

    if left(v_topic, 6) = 'topic:' or left(v_topic, 10) = 'broadcast:' or left(v_topic, 9) = 'realtime:' then
      v_final_topic := v_topic;
    else
      v_final_topic := 'topic:' || v_topic;
    end if;

    begin
      perform realtime.broadcast_changes(
        v_final_topic,
        coalesce(p_event, 'UPDATE'),
        coalesce(p_event, 'UPDATE'),
        coalesce(p_table, 'unknown'),
        coalesce(p_schema, 'public'),
        p_new,
        p_old
      );
    exception
      when others then
        raise notice '[emit_realtime_payload] failed for topic %: %', topic, SQLERRM;
    end;
  end loop;
end;
$$;

create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_scope text := null;
  v_channel text := null;
  v_session uuid := null;
  v_match uuid := null;
  v_game uuid := null;
  v_room uuid := null;
  v_chat_room uuid := null;
  v_owner uuid := null;
  v_user uuid := null;
  v_hero uuid := null;
  v_target_owner uuid := null;
  v_target_hero uuid := null;
  v_thread text := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_scope := OLD.scope;
    v_channel := OLD.channel_type;
    v_session := OLD.session_id;
    v_match := OLD.match_instance_id;
    v_game := OLD.game_id;
    v_room := OLD.room_id;
    v_chat_room := OLD.chat_room_id;
    v_owner := OLD.owner_id;
    v_user := OLD.user_id;
    v_hero := OLD.hero_id;
    v_target_owner := OLD.target_owner_id;
    v_target_hero := OLD.target_hero_id;
    v_thread := OLD.thread_hint;
  elsif TG_OP = 'INSERT' then
    v_scope := NEW.scope;
    v_channel := NEW.channel_type;
    v_session := NEW.session_id;
    v_match := NEW.match_instance_id;
    v_game := NEW.game_id;
    v_room := NEW.room_id;
    v_chat_room := NEW.chat_room_id;
    v_owner := NEW.owner_id;
    v_user := NEW.user_id;
    v_hero := NEW.hero_id;
    v_target_owner := NEW.target_owner_id;
    v_target_hero := NEW.target_hero_id;
    v_thread := NEW.thread_hint;
  else
    v_scope := coalesce(NEW.scope, OLD.scope);
    v_channel := coalesce(NEW.channel_type, OLD.channel_type);
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_chat_room := coalesce(NEW.chat_room_id, OLD.chat_room_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
    v_user := coalesce(NEW.user_id, OLD.user_id);
    v_hero := coalesce(NEW.hero_id, OLD.hero_id);
    v_target_owner := coalesce(NEW.target_owner_id, OLD.target_owner_id);
    v_target_hero := coalesce(NEW.target_hero_id, OLD.target_hero_id);
    v_thread := coalesce(NEW.thread_hint, OLD.thread_hint);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    'broadcast_messages_changes',
    'messages:global',
    case when v_scope is not null and trim(both from v_scope) <> '' then 'messages:scope:' || lower(trim(both from v_scope)) end,
    case when v_channel is not null and trim(both from v_channel) <> '' then 'messages:channel:' || lower(trim(both from v_channel)) end,
    case when v_session is not null then 'messages:session:' || v_session::text end,
    case when v_match is not null then 'messages:match:' || v_match::text end,
    case when v_game is not null then 'messages:game:' || v_game::text end,
    case when v_room is not null then 'messages:room:' || v_room::text end,
    case when v_chat_room is not null then 'messages:chat-room:' || v_chat_room::text end,
    case when v_owner is not null then 'messages:owner:' || v_owner::text end,
    case when v_user is not null then 'messages:user:' || v_user::text end,
    case when v_hero is not null then 'messages:hero:' || v_hero::text end,
    case when v_target_owner is not null then 'messages:target-owner:' || v_target_owner::text end,
    case when v_target_hero is not null then 'messages:target-hero:' || v_target_hero::text end,
    case when v_thread is not null and trim(both from v_thread) <> '' then 'messages:thread:' || trim(both from v_thread) end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_messages_broadcast on public.messages;
create trigger trg_messages_broadcast
after insert or update or delete on public.messages
for each row execute function public.broadcast_messages_changes();

create or replace function public.broadcast_rank_queue_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_id uuid := null;
  v_queue text := null;
  v_game uuid := null;
  v_room uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_id := OLD.id;
    v_queue := OLD.queue_id;
    v_game := OLD.game_id;
    v_room := OLD.room_id;
    v_owner := OLD.owner_id;
  elsif TG_OP = 'INSERT' then
    v_id := NEW.id;
    v_queue := NEW.queue_id;
    v_game := NEW.game_id;
    v_room := NEW.room_id;
    v_owner := NEW.owner_id;
  else
    v_id := coalesce(NEW.id, OLD.id);
    v_queue := coalesce(NEW.queue_id, OLD.queue_id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_queue is not null and trim(both from v_queue) <> '' then 'rank_queue_tickets:queue:' || trim(both from v_queue) end,
    case when v_id is not null then 'rank_queue_tickets:ticket:' || v_id::text end,
    case when v_owner is not null then 'rank_queue_tickets:owner:' || v_owner::text end,
    case when v_game is not null then 'rank_queue_tickets:game:' || v_game::text end,
    case when v_room is not null then 'rank_queue_tickets:room:' || v_room::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_queue_tickets_broadcast on public.rank_queue_tickets;
create trigger trg_rank_queue_tickets_broadcast
after insert or update or delete on public.rank_queue_tickets
for each row execute function public.broadcast_rank_queue_tickets();

create or replace function public.broadcast_rank_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_id uuid := null;
  v_game uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_id := OLD.id;
    v_game := OLD.game_id;
    v_owner := OLD.owner_id;
  elsif TG_OP = 'INSERT' then
    v_id := NEW.id;
    v_game := NEW.game_id;
    v_owner := NEW.owner_id;
  else
    v_id := coalesce(NEW.id, OLD.id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_id is not null then 'rank_rooms:room:' || v_id::text end,
    case when v_game is not null then 'rank_rooms:game:' || v_game::text end,
    case when v_owner is not null then 'rank_rooms:owner:' || v_owner::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_rooms_broadcast on public.rank_rooms;
create trigger trg_rank_rooms_broadcast
after insert or update or delete on public.rank_rooms
for each row execute function public.broadcast_rank_rooms();

create or replace function public.broadcast_rank_room_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_room uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_room := OLD.room_id;
    v_owner := OLD.occupant_owner_id;
  elsif TG_OP = 'INSERT' then
    v_room := NEW.room_id;
    v_owner := NEW.occupant_owner_id;
  else
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_owner := coalesce(NEW.occupant_owner_id, OLD.occupant_owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_room is not null then 'rank_room_slots:room:' || v_room::text end,
    case when v_owner is not null then 'rank_room_slots:occupant:' || v_owner::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_room_slots_broadcast on public.rank_room_slots;
create trigger trg_rank_room_slots_broadcast
after insert or update or delete on public.rank_room_slots
for each row execute function public.broadcast_rank_room_slots();

create or replace function public.broadcast_rank_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_id uuid := null;
  v_game uuid := null;
  v_owner uuid := null;
  v_room uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_id := OLD.id;
    v_game := OLD.game_id;
    v_owner := OLD.owner_id;
    v_room := OLD.room_id;
  elsif TG_OP = 'INSERT' then
    v_id := NEW.id;
    v_game := NEW.game_id;
    v_owner := NEW.owner_id;
    v_room := NEW.room_id;
  else
    v_id := coalesce(NEW.id, OLD.id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_id is not null then 'rank_sessions:session:' || v_id::text end,
    case when v_game is not null then 'rank_sessions:game:' || v_game::text end,
    case when v_owner is not null then 'rank_sessions:owner:' || v_owner::text end,
    case when v_room is not null then 'rank_sessions:room:' || v_room::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_sessions_broadcast on public.rank_sessions;
create trigger trg_rank_sessions_broadcast
after insert or update or delete on public.rank_sessions
for each row execute function public.broadcast_rank_sessions();

create or replace function public.broadcast_rank_session_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_game uuid := null;
  v_room uuid := null;
  v_match uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
  v_match_hint text := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
    v_owner := OLD.occupant_owner_id;
    v_match_hint := coalesce(
      OLD.extras->>'matchInstanceId',
      OLD.extras->>'match_instance_id',
      OLD.async_fill_snapshot->>'matchInstanceId',
      OLD.async_fill_snapshot->>'match_instance_id'
    );
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
    v_owner := NEW.occupant_owner_id;
    v_match_hint := coalesce(
      NEW.extras->>'matchInstanceId',
      NEW.extras->>'match_instance_id',
      NEW.async_fill_snapshot->>'matchInstanceId',
      NEW.async_fill_snapshot->>'match_instance_id'
    );
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_owner := coalesce(NEW.occupant_owner_id, OLD.occupant_owner_id);
    v_match_hint := coalesce(
      NEW.extras->>'matchInstanceId',
      NEW.extras->>'match_instance_id',
      NEW.async_fill_snapshot->>'matchInstanceId',
      NEW.async_fill_snapshot->>'match_instance_id',
      OLD.extras->>'matchInstanceId',
      OLD.extras->>'match_instance_id',
      OLD.async_fill_snapshot->>'matchInstanceId',
      OLD.async_fill_snapshot->>'match_instance_id'
    );
  end if;

  if v_session is not null then
    select s.game_id, s.room_id
      into v_game, v_room
    from public.rank_sessions s
    where s.id = v_session
    limit 1;
  end if;

  v_match := public.try_cast_uuid(v_match_hint);

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_session_meta:session:' || v_session::text end,
    case when v_game is not null then 'rank_session_meta:game:' || v_game::text end,
    case when v_room is not null then 'rank_session_meta:room:' || v_room::text end,
    case when v_match is not null then 'rank_session_meta:match:' || v_match::text end,
    case when v_owner is not null then 'rank_session_meta:owner:' || v_owner::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_session_meta_broadcast on public.rank_session_meta;
create trigger trg_rank_session_meta_broadcast
after insert or update or delete on public.rank_session_meta
for each row execute function public.broadcast_rank_session_meta();

create or replace function public.broadcast_rank_match_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_match uuid := null;
  v_room uuid := null;
  v_game uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_match := OLD.match_instance_id;
    v_room := OLD.room_id;
    v_game := OLD.game_id;
    v_owner := OLD.owner_id;
  elsif TG_OP = 'INSERT' then
    v_match := NEW.match_instance_id;
    v_room := NEW.room_id;
    v_game := NEW.game_id;
    v_owner := NEW.owner_id;
  else
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_match is not null then 'rank_match_roster:match:' || v_match::text end,
    case when v_game is not null then 'rank_match_roster:game:' || v_game::text end,
    case when v_room is not null then 'rank_match_roster:room:' || v_room::text end,
    case when v_owner is not null then 'rank_match_roster:owner:' || v_owner::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_match_roster_broadcast on public.rank_match_roster;
create trigger trg_rank_match_roster_broadcast
after insert or update or delete on public.rank_match_roster
for each row execute function public.broadcast_rank_match_roster();

create or replace function public.broadcast_rank_turns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_turns:session:' || v_session::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_turns_broadcast on public.rank_turns;
create trigger trg_rank_turns_broadcast
after insert or update or delete on public.rank_turns
for each row execute function public.broadcast_rank_turns();

create or replace function public.broadcast_rank_turn_state_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_turn_state_events:session:' || v_session::text end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_rank_turn_state_events_broadcast on public.rank_turn_state_events;
create trigger trg_rank_turn_state_events_broadcast
after insert or update or delete on public.rank_turn_state_events
for each row execute function public.broadcast_rank_turn_state_events();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_queue_tickets'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_queue_tickets'
  ) then
    alter publication supabase_realtime add table public.rank_queue_tickets;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_rooms'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_rooms'
  ) then
    alter publication supabase_realtime add table public.rank_rooms;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_room_slots'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_room_slots'
  ) then
    alter publication supabase_realtime add table public.rank_room_slots;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_sessions'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_sessions'
  ) then
    alter publication supabase_realtime add table public.rank_sessions;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'chat_rooms'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_rooms'
  ) then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'chat_room_members'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_members'
  ) then
    alter publication supabase_realtime add table public.chat_room_members;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_session_meta'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_session_meta'
  ) then
    alter publication supabase_realtime add table public.rank_session_meta;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_match_roster'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_match_roster'
  ) then
    alter publication supabase_realtime add table public.rank_match_roster;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_turns'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_turns'
  ) then
    alter publication supabase_realtime add table public.rank_turns;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'rank_turn_state_events'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_turn_state_events'
  ) then
    alter publication supabase_realtime add table public.rank_turn_state_events;
  end if;
end;
$$;

create or replace function public.send_rank_chat_message(
  p_scope text default 'global',
  p_text text default null,
  p_session_id uuid default null,
  p_match_instance_id uuid default null,
  p_game_id uuid default null,
  p_room_id uuid default null,
  p_chat_room_id uuid default null,
  p_hero_id uuid default null,
  p_target_hero_id uuid default null,
  p_target_role text default null,
  p_metadata jsonb default null,
  p_user_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid := null;
  v_scope text := lower(coalesce(p_scope, 'global'));
  v_channel text := 'lobby';
  v_text text := coalesce(trim(p_text), '');
  v_session_id uuid := p_session_id;
  v_match_instance_id uuid := p_match_instance_id;
  v_game_id uuid := p_game_id;
  v_room_id uuid := p_room_id;
  v_chat_room_id uuid := p_chat_room_id;
  v_chat_member_ids uuid[] := null;
  v_has_chat_access boolean := false;
  v_hero_id uuid := p_hero_id;
  v_username text := null;
  v_avatar text := null;
  v_role text := null;
  v_target_hero uuid := p_target_hero_id;
  v_target_owner uuid := null;
  v_target_role text := case when p_target_role is not null then trim(p_target_role) else null end;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_visible uuid[] := null;
  v_roster_owner_ids uuid[] := null;
  v_thread_hint text := null;
  v_message public.messages%rowtype;
  v_attachments jsonb := null;
  v_has_attachments boolean := false;
begin
  if v_user_id is null and p_user_id is not null then
    v_user_id := p_user_id;
  end if;

  if v_user_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if v_metadata ? 'attachments' then
    v_attachments := v_metadata -> 'attachments';
    if jsonb_typeof(v_attachments) = 'array' then
      v_has_attachments := coalesce(jsonb_array_length(v_attachments), 0) > 0;
    end if;
  end if;

  if v_text = '' and not coalesce(v_has_attachments, false) then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;

  if v_scope not in ('global', 'main', 'role', 'whisper', 'system', 'room') then
    v_scope := 'global';
  end if;

  v_channel := case v_scope
    when 'main' then 'main'
    when 'role' then 'role'
    when 'whisper' then 'whisper'
    when 'system' then 'system'
    when 'room' then 'room'
    else 'lobby'
  end;

  if v_hero_id is not null then
    select h.owner_id, h.name, h.image_url
      into v_owner_id, v_username, v_avatar
    from public.heroes as h
    where h.id = v_hero_id
    limit 1;
  end if;

  if v_owner_id is null then
    v_owner_id := v_user_id;
  end if;

  if v_username is null then
    v_username := '익명';
  end if;

  if v_scope = 'room' then
    if v_chat_room_id is null then
      v_chat_room_id := p_chat_room_id;
    end if;

    if v_chat_room_id is null then
      raise exception 'missing_chat_room_id' using errcode = 'P0001';
    end if;

    select
      array_agg(owner_id) filter (where status = 'active'),
      bool_or(owner_id = v_user_id)
      into v_chat_member_ids, v_has_chat_access
    from public.chat_room_members
    where room_id = v_chat_room_id;

    if not coalesce(v_has_chat_access, false) then
      raise exception 'chat_room_forbidden' using errcode = 'P0001';
    end if;

    if v_chat_member_ids is null or array_length(v_chat_member_ids, 1) = 0 then
      v_chat_member_ids := array[v_user_id];
    end if;

    v_visible := v_chat_member_ids;
    v_thread_hint := 'chat-room:' || v_chat_room_id::text;
    v_session_id := null;
    v_match_instance_id := null;
    v_game_id := null;
    v_room_id := null;

  elsif v_scope in ('main', 'role', 'whisper') then
    if v_match_instance_id is null and v_session_id is not null then
      select public.try_cast_uuid(
          coalesce(
            sm.extras->>'matchInstanceId',
            sm.extras->>'match_instance_id',
            sm.async_fill_snapshot->>'matchInstanceId',
            sm.async_fill_snapshot->>'match_instance_id'
          )
        ),
        s.game_id,
        s.room_id
        into v_match_instance_id, v_game_id, v_room_id
      from public.rank_sessions as s
      left join public.rank_session_meta as sm on sm.session_id = s.id
      where s.id = v_session_id
      limit 1;
    end if;
  end if;

  if v_scope in ('main', 'role') and v_match_instance_id is null then
    raise exception 'missing_match_instance' using errcode = 'P0001';
  end if;

  if v_scope in ('main', 'role') then
    select array_agg(distinct owner_id) filter (where owner_id is not null),
           max(game_id),
           max(room_id)
      into v_roster_owner_ids, v_game_id, v_room_id
    from public.rank_match_roster
    where match_instance_id = v_match_instance_id;

    if v_roster_owner_ids is null or array_length(v_roster_owner_ids, 1) = 0 then
      raise exception 'missing_roster' using errcode = 'P0001';
    end if;

    select r.role
      into v_role
    from public.rank_match_roster as r
    where r.match_instance_id = v_match_instance_id
      and r.owner_id = v_owner_id
    order by r.updated_at desc
    limit 1;
  end if;

  if v_scope = 'role' then
    v_role := coalesce(v_target_role, v_role);
    if v_role is null then
      raise exception 'missing_role_for_channel' using errcode = 'P0001';
    end if;
    v_target_role := v_role;
    select array_agg(distinct owner_id) filter (where owner_id is not null)
      into v_visible
    from public.rank_match_roster
    where match_instance_id = v_match_instance_id
      and lower(coalesce(role, '')) = lower(v_role);
    if v_visible is null or array_length(v_visible, 1) = 0 then
      v_visible := v_roster_owner_ids;
    end if;
    v_thread_hint := 'role:' || lower(v_role);
  elsif v_scope = 'main' then
    v_visible := v_roster_owner_ids;
    v_thread_hint := 'main';
  elsif v_scope = 'whisper' then
    if v_target_hero is null then
      raise exception 'missing_target_hero' using errcode = 'P0001';
    end if;
    select h.owner_id
      into v_target_owner
    from public.heroes as h
    where h.id = v_target_hero
    limit 1;
    if v_target_owner is null then
      raise exception 'missing_target_owner' using errcode = 'P0001';
    end if;
    v_visible := array_remove(array[coalesce(v_owner_id, v_user_id), v_target_owner], null);
    v_thread_hint := 'whisper:' || coalesce(v_target_hero::text, v_target_owner::text);
  elsif v_scope = 'system' then
    v_thread_hint := 'system';
  else
    v_thread_hint := 'global';
  end if;

  if v_visible is not null then
    select array_agg(distinct elem)
      into v_visible
    from unnest(v_visible) as elem;
    if v_visible is not null and array_length(v_visible, 1) = 0 then
      v_visible := null;
    end if;
  end if;

  insert into public.messages (
    scope,
    channel_type,
    session_id,
    match_instance_id,
    game_id,
    room_id,
    chat_room_id,
    user_id,
    owner_id,
    hero_id,
    username,
    avatar_url,
    role,
    target_hero_id,
    target_owner_id,
    target_role,
    text,
    metadata,
    visible_owner_ids,
    thread_hint
  )
  values (
    v_scope,
    v_channel,
    v_session_id,
    v_match_instance_id,
    v_game_id,
    v_room_id,
    v_chat_room_id,
    v_user_id,
    v_owner_id,
    v_hero_id,
    v_username,
    v_avatar,
    v_role,
    v_target_hero,
    v_target_owner,
    v_target_role,
    v_text,
    v_metadata,
    v_visible,
    v_thread_hint
  )
  returning * into v_message;

  return v_message;
end;
$$;

grant execute on function public.send_rank_chat_message(
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  uuid
)
to authenticated,
   service_role;

drop function if exists public.fetch_rank_chat_threads(
  uuid,
  uuid,
  integer,
  uuid,
  text
);

create or replace function public.fetch_rank_chat_threads(
  p_session_id uuid default null,
  p_match_instance_id uuid default null,
  p_limit integer default 120,
  p_chat_room_id uuid default null,
  p_scope text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session_id uuid := p_session_id;
  v_match_instance_id uuid := p_match_instance_id;
  v_limit integer := greatest(coalesce(p_limit, 120), 10);
  v_game_id uuid := null;
  v_role text := null;
  v_chat_room_id uuid := p_chat_room_id;
  v_requested_scope text := lower(coalesce(p_scope, ''));
  v_chat_room_label text := null;
  v_chat_room_member boolean := false;
  v_messages jsonb := '[]'::jsonb;
begin
  if v_match_instance_id is null and v_session_id is not null then
    select public.try_cast_uuid(
        coalesce(
          sm.extras->>'matchInstanceId',
          sm.extras->>'match_instance_id',
          sm.async_fill_snapshot->>'matchInstanceId',
          sm.async_fill_snapshot->>'match_instance_id'
        )
      ),
      s.game_id
      into v_match_instance_id, v_game_id
    from public.rank_sessions as s
    left join public.rank_session_meta as sm on sm.session_id = s.id
    where s.id = v_session_id
    limit 1;
  end if;

  if v_chat_room_id is not null then
    select
      coalesce(r.name, ''),
      bool_or(m.owner_id = v_owner_id)
      into v_chat_room_label, v_chat_room_member
    from public.chat_rooms r
    left join public.chat_room_members m
      on m.room_id = r.id
     and coalesce(m.status, 'active') = 'active'
    where r.id = v_chat_room_id
    group by r.id, r.name;

    if not coalesce(v_chat_room_member, false) then
      v_chat_room_id := null;
      v_chat_room_label := null;
    end if;
  end if;

  if v_match_instance_id is not null then
    select max(game_id)
      into v_game_id
    from public.rank_match_roster
    where match_instance_id = v_match_instance_id;
  end if;

  if v_owner_id is not null and v_match_instance_id is not null then
    select r.role
      into v_role
    from public.rank_match_roster as r
    where r.match_instance_id = v_match_instance_id
      and r.owner_id = v_owner_id
    order by r.updated_at desc
    limit 1;
  end if;

  with global_messages as (
    select m.*, 'global'::text as thread_scope, 'global'::text as thread_id, '전체'::text as thread_label
    from public.messages as m
    where m.scope = 'global'
      and v_requested_scope = 'global'
    order by m.created_at desc
    limit v_limit
  ),
  chat_room_messages as (
    select
      m.*, 'room'::text as thread_scope,
      coalesce('chat-room:' || m.chat_room_id::text, 'room')::text as thread_id,
      coalesce(v_chat_room_label, '대화방')::text as thread_label
    from public.messages as m
    where v_chat_room_id is not null
      and m.chat_room_id = v_chat_room_id
    order by m.created_at desc
    limit v_limit
  ),
  main_messages as (
    select m.*, 'main'::text as thread_scope, 'main'::text as thread_id, '메인 게임'::text as thread_label
    from public.messages as m
    where m.scope in ('main', 'system')
      and (
        (v_match_instance_id is not null and m.match_instance_id = v_match_instance_id)
        or (v_session_id is not null and m.session_id = v_session_id)
      )
    order by m.created_at desc
    limit v_limit
  ),
  role_messages as (
    select
      m.*,
      'role'::text as thread_scope,
      'role'::text as thread_id,
      coalesce(
        case
          when m.target_role is not null then format('역할 (%s)', m.target_role)
          when v_role is not null then format('역할 (%s)', v_role)
          else '역할 채팅'
        end,
        '역할 채팅'
      )::text as thread_label
    from public.messages as m
    where m.scope = 'role'
      and (
        (v_match_instance_id is not null and m.match_instance_id = v_match_instance_id)
        or (v_session_id is not null and m.session_id = v_session_id)
      )
      and (
        v_role is null
        or m.target_role is null
        or lower(m.target_role) = lower(v_role)
        or lower(m.role) = lower(v_role)
      )
    order by m.created_at desc
    limit v_limit
  ),
  whisper_messages as (
    select
      m.*, 
      'whisper'::text as thread_scope,
      (
        'whisper:' || coalesce(
          case
            when v_owner_id is not null and v_owner_id = m.owner_id then coalesce(m.target_hero_id::text, m.target_owner_id::text, m.id::text)
            when v_owner_id is not null and v_owner_id = m.target_owner_id then coalesce(m.owner_id::text, m.hero_id::text, m.id::text)
            else m.id::text
          end,
          m.id::text
        )
      )::text as thread_id,
      coalesce(m.thread_hint, '귓속말')::text as thread_label
    from public.messages as m
    where m.scope = 'whisper'
      and (
        v_owner_id is null
        or v_owner_id = m.owner_id
        or v_owner_id = m.user_id
        or (m.visible_owner_ids is not null and v_owner_id = any(m.visible_owner_ids))
      )
    order by m.created_at desc
    limit v_limit
  ),
  combined as (
    select *
    from chat_room_messages
    where v_chat_room_id is not null
      and (v_requested_scope is null or v_requested_scope in ('', 'room'))
    union all
    select *
    from main_messages
    where v_requested_scope in ('', 'main', 'system')
    union all
    select *
    from role_messages
    where v_requested_scope in ('', 'role')
    union all
    select *
    from whisper_messages
    where v_requested_scope in ('', 'whisper')
    union all
    select *
    from global_messages
    where v_chat_room_id is null
      and v_requested_scope = 'global'
  )
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_messages
  from (
    select
      c.id,
      c.created_at,
      c.updated_at,
      c.scope,
      c.channel_type,
      c.session_id,
      c.match_instance_id,
      c.game_id,
      c.chat_room_id,
      c.user_id,
      c.owner_id,
      c.hero_id,
      c.username,
      c.avatar_url,
      c.role,
      c.target_hero_id,
      c.target_owner_id,
      c.target_role,
      c.text,
      c.metadata,
      c.visible_owner_ids,
      c.thread_hint,
      c.thread_scope,
      case
        when c.thread_scope = 'role' and v_role is not null then 'role:' || lower(v_role)
        when c.thread_scope = 'main' then 'main'
        when c.thread_scope = 'global' then 'global'
        else c.thread_id
      end as thread_id,
      case
        when c.thread_scope = 'role' and v_role is not null then format('역할 (%s)', v_role)
        when c.thread_scope = 'main' then '메인 게임'
        when c.thread_scope = 'global' then '전체'
        when c.thread_scope = 'room' then coalesce(v_chat_room_label, '대화방')
        else c.thread_label
      end as thread_label,
      coalesce(h.name, c.username) as hero_name,
      h.image_url as hero_image_url,
      cr.name as chat_room_name,
      th.name as target_hero_name,
      th.image_url as target_hero_image_url,
      coalesce(read_stats.total_members, 0)::integer as room_member_total,
      coalesce(read_stats.unread_members, 0)::integer as room_unread_count
    from combined as c
    left join public.heroes as h on h.id = c.hero_id
    left join public.heroes as th on th.id = c.target_hero_id
    left join public.chat_rooms as cr on cr.id = c.chat_room_id
    left join lateral (
      select
        count(*) filter (where coalesce(mem.status, 'active') = 'active') as total_members,
        count(*) filter (
          where coalesce(mem.status, 'active') = 'active'
            and coalesce(mem.last_read_message_at, mem.joined_at, timestamptz 'epoch') < c.created_at
            and (mem.owner_id is null or mem.owner_id <> c.owner_id)
        ) as unread_members
      from public.chat_room_members mem
      where c.chat_room_id is not null
        and mem.room_id = c.chat_room_id
    ) as read_stats on true
    order by c.created_at asc, c.id
  ) as row;

  return jsonb_build_object(
    'messages', v_messages,
    'viewerRole', v_role,
    'sessionId', v_session_id,
    'matchInstanceId', v_match_instance_id,
    'gameId', v_game_id
  );
end;
$$;

grant execute on function public.fetch_rank_chat_threads(
  uuid,
  uuid,
  integer,
  uuid,
  text
)
to authenticated,
   service_role,
   anon;

create or replace function public.create_chat_room(
  p_name text,
  p_description text default '',
  p_visibility text default 'private',
  p_capacity integer default 20,
  p_allow_ai boolean default true,
  p_require_approval boolean default false,
  p_hero_id uuid default null
)
returns public.chat_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_name text := coalesce(trim(p_name), '');
  v_description text := coalesce(trim(p_description), '');
  v_visibility text := case
    when lower(coalesce(p_visibility, '')) = 'public' then 'public'
    else 'private'
  end;
  v_capacity integer := greatest(2, least(coalesce(p_capacity, 20), 500));
  v_room public.chat_rooms%rowtype;
begin
  if v_owner_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if v_name = '' then
    raise exception 'missing_room_name' using errcode = 'P0001';
  end if;

  insert into public.chat_rooms (
    owner_id,
    hero_id,
    name,
    description,
    visibility,
    capacity,
    allow_ai,
    require_approval
  )
  values (
    v_owner_id,
    p_hero_id,
    v_name,
    v_description,
    v_visibility,
    v_capacity,
    coalesce(p_allow_ai, true),
    coalesce(p_require_approval, false)
  )
  returning * into v_room;

  insert into public.chat_room_members (room_id, owner_id, hero_id, role, status, is_moderator)
  values (v_room.id, v_owner_id, p_hero_id, null, 'active', true)
  on conflict (room_id, owner_id) do update
    set hero_id = excluded.hero_id,
        status = 'active',
        is_moderator = true,
        last_active_at = timezone('utc', now());

  return v_room;
end;
$$;

grant execute on function public.create_chat_room(
  text,
  text,
  text,
  integer,
  boolean,
  boolean,
  uuid
)
to authenticated;

create or replace function public.join_chat_room(
  p_room_id uuid,
  p_hero_id uuid default null
)
returns public.chat_room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_membership public.chat_room_members%rowtype;
  v_display_name text := null;
  v_member_count integer := 0;
begin
  if v_owner_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if p_room_id is null then
    raise exception 'missing_room_id' using errcode = 'P0001';
  end if;

  delete from public.chat_room_bans
  where room_id = p_room_id
    and owner_id = v_owner_id
    and expires_at is not null
    and expires_at <= timezone('utc', now());

  if exists (
    select 1
    from public.chat_room_bans b
    where b.room_id = p_room_id
      and b.owner_id = v_owner_id
      and (b.expires_at is null or b.expires_at > timezone('utc', now()))
  ) then
    raise exception 'banned_from_room' using errcode = 'P0001';
  end if;

  insert into public.chat_room_members (room_id, owner_id, hero_id, status)
  values (p_room_id, v_owner_id, p_hero_id, 'active')
  on conflict (room_id, owner_id) do update
    set hero_id = excluded.hero_id,
        status = 'active',
        last_active_at = timezone('utc', now())
  returning * into v_membership;

  begin
    select coalesce(h.name, u.raw_user_meta_data->>'full_name', u.email, v_owner_id::text)
      into v_display_name
    from auth.users u
    left join public.heroes h on h.id = coalesce(v_membership.hero_id, p_hero_id)
    where u.id = v_owner_id;

    select count(*)
      into v_member_count
    from public.chat_room_members mem
    where mem.room_id = p_room_id
      and coalesce(mem.status, 'active') = 'active';

    perform public.send_rank_chat_message(
      p_scope => 'room',
      p_text => format('%s 님이 참여했습니다.', coalesce(v_display_name, '참여자')),
      p_chat_room_id => p_room_id,
      p_metadata => jsonb_build_object(
        'event', 'member_join',
        'member_name', coalesce(v_display_name, '참여자'),
        'member_id', v_owner_id,
        'room_member_total', v_member_count
      ),
      p_user_id => v_owner_id
    );
  exception
    when others then
      null;
  end;

  return v_membership;
end;
$$;

grant execute on function public.join_chat_room(
  uuid,
  uuid
)
to authenticated;

create or replace function public.leave_chat_room(
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_deleted integer := 0;
  v_display_name text := null;
  v_member_count integer := 0;
  v_hero_id uuid := null;
begin
  if v_owner_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if p_room_id is null then
    raise exception 'missing_room_id' using errcode = 'P0001';
  end if;

  select hero_id
    into v_hero_id
  from public.chat_room_members
  where room_id = p_room_id
    and owner_id = v_owner_id
  limit 1;

  select coalesce(h.name, u.raw_user_meta_data->>'full_name', u.email, v_owner_id::text)
    into v_display_name
  from auth.users u
  left join public.heroes h on h.id = v_hero_id
  where u.id = v_owner_id;

  delete from public.chat_room_members
  where room_id = p_room_id
    and owner_id = v_owner_id
  returning 1 into v_deleted;

  if v_deleted > 0 then
    select count(*)
      into v_member_count
    from public.chat_room_members mem
    where mem.room_id = p_room_id
      and coalesce(mem.status, 'active') = 'active';

    begin
      perform public.send_rank_chat_message(
        p_scope => 'room',
        p_text => format('%s 님이 나갔습니다.', coalesce(v_display_name, '참여자')),
        p_chat_room_id => p_room_id,
        p_metadata => jsonb_build_object(
          'event', 'member_leave',
          'member_name', coalesce(v_display_name, '참여자'),
          'member_id', v_owner_id,
          'room_member_total', v_member_count
        ),
        p_user_id => v_owner_id
      );
    exception
      when others then
        null;
    end;
  end if;

  return v_deleted > 0;
end;
$$;

grant execute on function public.leave_chat_room(uuid)
to authenticated;

drop function if exists public.delete_chat_room(uuid);
create or replace function public.delete_chat_room(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_room_owner_id uuid := null;
  v_room_is_system boolean := false;
begin
  if v_owner_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if p_room_id is null then
    raise exception 'missing_room_id' using errcode = 'P0001';
  end if;

  select r.owner_id,
         coalesce(
           case
             when to_jsonb(r) ? 'is_system'
               then nullif(to_jsonb(r)->>'is_system', '')::boolean
             else null
           end,
           false
         )
    into v_room_owner_id,
         v_room_is_system
  from public.chat_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if coalesce(v_room_is_system, false) then
    raise exception 'cannot_delete_system_room' using errcode = 'P0001';
  end if;

  if v_room_owner_id <> v_owner_id then
    raise exception 'not_room_owner' using errcode = 'P0001';
  end if;

  delete from public.chat_rooms
  where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_chat_room(uuid)
to authenticated;

drop function if exists public.mark_chat_room_read(uuid, uuid);
drop function if exists public.mark_chat_room_read(text, text);
create or replace function public.mark_chat_room_read(
  p_room_id text,
  p_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_room_id uuid := null;
  v_last_id_text text := null;
  v_last_uuid uuid := null;
  v_last_bigint bigint := null;
  v_last_at timestamptz := null;
  v_candidate text := null;
  v_message_id_type text := null;
  v_member_id_type text := null;
  v_last_integer integer := null;
  v_last_numeric numeric := null;
begin
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  begin
    if p_room_id is not null and trim(p_room_id) <> '' then
      v_room_id := trim(p_room_id)::uuid;
    end if;
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'error', 'invalid_room_id',
        'detail', coalesce(nullif(trim(p_room_id), ''), 'null')
      );
  end;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_room_id');
  end if;

  select c.data_type
    into v_message_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'messages'
    and c.column_name = 'id'
  limit 1;

  select c.data_type
    into v_member_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'chat_room_members'
    and c.column_name = 'last_read_message_id'
  limit 1;

  if p_message_id is not null and trim(p_message_id) <> '' then
    v_candidate := trim(p_message_id);
  end if;

  if v_candidate is not null then
    select id::text, created_at
      into v_last_id_text, v_last_at
    from public.messages
    where chat_room_id = v_room_id
      and id::text = v_candidate
    order by created_at desc
    limit 1;
  end if;

  if v_last_id_text is null or v_last_at is null then
    select id::text, created_at
      into v_last_id_text, v_last_at
    from public.messages
    where chat_room_id = v_room_id
    order by created_at desc
    limit 1;
  end if;

  if v_last_id_text is not null then
    begin
      v_last_uuid := v_last_id_text::uuid;
    exception
      when others then
        v_last_uuid := null;
    end;

    begin
      v_last_bigint := v_last_id_text::bigint;
    exception
      when others then
        v_last_bigint := null;
    end;

    begin
      v_last_integer := v_last_id_text::integer;
    exception
      when others then
        v_last_integer := null;
    end;

    begin
      v_last_numeric := v_last_id_text::numeric;
    exception
      when others then
        v_last_numeric := null;
    end;
  end if;

  if coalesce(v_member_id_type, 'uuid') in ('uuid', 'USER-DEFINED') then
    update public.chat_room_members
    set last_read_message_id = coalesce(v_last_uuid, last_read_message_id),
        last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  elsif v_member_id_type = 'bigint' then
    update public.chat_room_members
    set last_read_message_id = coalesce(v_last_bigint, last_read_message_id),
        last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  elsif v_member_id_type = 'integer' then
    update public.chat_room_members
    set last_read_message_id = coalesce(v_last_integer, last_read_message_id),
        last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  elsif v_member_id_type = 'numeric' then
    update public.chat_room_members
    set last_read_message_id = coalesce(v_last_numeric, last_read_message_id),
        last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  elsif v_member_id_type in ('text', 'character varying', 'character')
        or v_member_id_type like 'character varying%' then
    update public.chat_room_members
    set last_read_message_id = coalesce(v_last_id_text, last_read_message_id::text)::text,
        last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  else
    update public.chat_room_members
    set last_read_message_at = coalesce(v_last_at, timezone('utc', now()))
    where room_id = v_room_id
      and owner_id = v_owner_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'roomId', v_room_id,
    'lastReadAt', coalesce(v_last_at, timezone('utc', now())),
    'lastReadMessageId', v_last_id_text
  );
end;
$$;

grant execute on function public.mark_chat_room_read(text, text)
to authenticated;

create or replace function public.fetch_chat_rooms(
  p_search text default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_limit integer := greatest(coalesce(p_limit, 24), 5);
  v_query text := coalesce(trim(p_search), '');
  v_joined jsonb := '[]'::jsonb;
  v_available jsonb := '[]'::jsonb;
  v_trending jsonb := '[]'::jsonb;
  v_suggestions jsonb := '[]'::jsonb;
  v_now timestamptz := timezone('utc', now());
  v_search_key text := null;
begin
  if v_owner_id is null then
    return jsonb_build_object(
      'joined', '[]'::jsonb,
      'available', '[]'::jsonb,
      'trendingKeywords', '[]'::jsonb,
      'suggestedKeywords', '[]'::jsonb
    );
  end if;

  if v_query <> '' then
    v_search_key := left(lower(v_query), 120);
    if v_search_key is not null and v_search_key <> '' then
      insert into public.chat_room_search_terms as terms (query, search_count, last_searched_at, last_owner_id)
      values (v_search_key, 1, v_now, v_owner_id)
      on conflict (query) do update
        set search_count = terms.search_count + 1,
            last_searched_at = v_now,
            last_owner_id = v_owner_id;
    end if;
  end if;

  with base_rooms as (
    select
      r.id,
      r.name,
      r.description,
      r.visibility,
      r.capacity,
      r.allow_ai,
      r.require_approval,
      r.owner_id,
      r.hero_id,
      r.created_at,
      r.updated_at,
      r.default_background_url,
      r.default_ban_minutes,
      r.default_theme,
      counts.member_count,
      m_self.owner_id as member_owner_id,
      coalesce(m_self.status, 'active') as member_status,
      m_self.last_read_message_at,
      m_self.last_read_message_id,
      m_self.joined_at,
      hero.image_url as cover_url
    from public.chat_rooms r
    left join public.chat_room_members m_self
      on m_self.room_id = r.id
     and m_self.owner_id = v_owner_id
    left join (
      select room_id, count(*) filter (where coalesce(status, 'active') = 'active') as member_count
      from public.chat_room_members
      group by room_id
    ) counts on counts.room_id = r.id
    left join public.heroes hero on hero.id = r.hero_id
  ),
  last_messages as (
    select
      lm.chat_room_id,
      lm.created_at,
      jsonb_build_object(
        'id', lm.id,
        'text', lm.text,
        'metadata', lm.metadata,
        'created_at', lm.created_at,
        'owner_id', lm.owner_id,
        'username', lm.username
      ) as payload
    from (
      select
        m.chat_room_id,
        m.id,
        m.text,
        m.metadata,
        m.created_at,
        m.owner_id,
        m.username,
        row_number() over (partition by m.chat_room_id order by m.created_at desc, m.id desc) as rn
      from public.messages m
      where m.chat_room_id is not null
    ) lm
    where lm.rn = 1
  ),
  unread_counts as (
    select
      m.chat_room_id,
      count(*)::integer as unread_count
    from public.messages m
    join public.chat_room_members mem
      on mem.room_id = m.chat_room_id
     and mem.owner_id = v_owner_id
    where m.chat_room_id is not null
      and coalesce(mem.status, 'active') = 'active'
      and m.created_at > coalesce(mem.last_read_message_at, mem.joined_at)
    group by m.chat_room_id
  )
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_joined
  from (
    select
      br.id,
      br.name,
      br.description,
      br.visibility,
      br.capacity,
      br.allow_ai,
      br.require_approval,
      br.owner_id,
      br.hero_id,
      br.member_count,
      br.cover_url,
      br.created_at,
      br.updated_at,
      br.default_background_url,
      br.default_ban_minutes,
      br.default_theme,
      lm.payload as latest_message,
      lm.created_at as last_message_at,
      coalesce(un.unread_count, 0) as unread_count
    from base_rooms br
    left join last_messages lm on lm.chat_room_id = br.id
    left join unread_counts un on un.chat_room_id = br.id
    where br.member_owner_id = v_owner_id
      and br.member_status = 'active'
    order by coalesce(lm.created_at, br.updated_at) desc nulls last
    limit v_limit
  ) as row;

  with base_rooms as (
    select
      r.id,
      r.name,
      r.description,
      r.visibility,
      r.capacity,
      r.allow_ai,
      r.require_approval,
      r.owner_id,
      r.hero_id,
      r.created_at,
      r.updated_at,
      r.default_background_url,
      r.default_ban_minutes,
      r.default_theme,
      counts.member_count,
      m_self.owner_id as member_owner_id,
      coalesce(m_self.status, 'active') as member_status,
      m_self.last_read_message_at,
      m_self.last_read_message_id,
      m_self.joined_at,
      hero.image_url as cover_url
    from public.chat_rooms r
    left join public.chat_room_members m_self
      on m_self.room_id = r.id
     and m_self.owner_id = v_owner_id
    left join (
      select room_id, count(*) filter (where coalesce(status, 'active') = 'active') as member_count
      from public.chat_room_members
      group by room_id
    ) counts on counts.room_id = r.id
    left join public.heroes hero on hero.id = r.hero_id
  ),
  last_messages as (
    select
      lm.chat_room_id,
      lm.created_at,
      jsonb_build_object(
        'id', lm.id,
        'text', lm.text,
        'metadata', lm.metadata,
        'created_at', lm.created_at,
        'owner_id', lm.owner_id,
        'username', lm.username
      ) as payload
    from (
      select
        m.chat_room_id,
        m.id,
        m.text,
        m.metadata,
        m.created_at,
        m.owner_id,
        m.username,
        row_number() over (partition by m.chat_room_id order by m.created_at desc, m.id desc) as rn
      from public.messages m
      where m.chat_room_id is not null
    ) lm
    where lm.rn = 1
  ),
  available_rooms as (
    select distinct on (br.id)
      br.id,
      br.name,
      br.description,
      br.visibility,
      br.capacity,
      br.allow_ai,
      br.require_approval,
      br.owner_id,
      br.hero_id,
      br.member_count,
      br.cover_url,
      br.created_at,
      br.updated_at,
      br.default_background_url,
      br.default_ban_minutes,
      br.default_theme,
      lm.payload as latest_message,
      lm.created_at as last_message_at
    from base_rooms br
    left join last_messages lm on lm.chat_room_id = br.id
    where (br.member_owner_id is null or br.member_status <> 'active')
      and (br.visibility = 'public' or br.owner_id = v_owner_id)
      and (
        v_query = ''
        or lower(br.name) like lower('%' || v_query || '%')
        or lower(br.description) like lower('%' || v_query || '%')
      )
    order by br.id, coalesce(lm.created_at, br.updated_at) desc nulls last
  )
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_available
  from (
    select *
    from available_rooms
    order by coalesce(last_message_at, updated_at) desc nulls last
    limit v_limit
  ) as row;

  select coalesce(jsonb_agg(jsonb_build_object(
      'keyword', t.query,
      'search_count', t.search_count,
      'last_searched_at', t.last_searched_at
    )), '[]'::jsonb)
    into v_trending
  from (
    select t.query, t.search_count, t.last_searched_at
    from public.chat_room_search_terms t
    order by t.search_count desc, t.last_searched_at desc, t.query asc
    limit 25
  ) as t;

  if v_query <> '' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'keyword', t.query,
        'search_count', t.search_count,
        'last_searched_at', t.last_searched_at
      )), '[]'::jsonb)
      into v_suggestions
    from (
      select t.query, t.search_count, t.last_searched_at
      from public.chat_room_search_terms t
      where lower(t.query) like lower(v_query || '%')
         or lower(t.query) like lower('%' || v_query || '%')
      order by
        case when lower(t.query) like lower(v_query || '%') then 0 else 1 end,
        t.search_count desc,
        t.last_searched_at desc,
        t.query asc
      limit 25
    ) as t;
  else
    v_suggestions := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'joined', coalesce(v_joined, '[]'::jsonb),
    'available', coalesce(v_available, '[]'::jsonb),
    'trendingKeywords', coalesce(v_trending, '[]'::jsonb),
    'suggestedKeywords', coalesce(v_suggestions, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.fetch_chat_rooms(text, integer)
to authenticated;

create or replace function public.fetch_chat_dashboard(
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_limit integer := greatest(coalesce(p_limit, 24), 8);
  v_rooms jsonb := '{}'::jsonb;
  v_joined jsonb := '[]'::jsonb;
  v_public jsonb := '[]'::jsonb;
  v_heroes jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_contacts jsonb := '[]'::jsonb;
begin
  if v_owner_id is null then
    return jsonb_build_object(
      'heroes', '[]'::jsonb,
      'rooms', '[]'::jsonb,
      'publicRooms', '[]'::jsonb,
      'sessions', '[]'::jsonb,
      'contacts', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_heroes
  from (
    select
      h.id,
      h.name,
      h.description,
      h.image_url,
      h.created_at,
      h.updated_at
    from public.heroes h
    where h.owner_id = v_owner_id
    order by h.updated_at desc
    limit v_limit
  ) as row;

  v_rooms := public.fetch_chat_rooms(null, v_limit);
  v_joined := coalesce(v_rooms->'joined', '[]'::jsonb);
  v_public := coalesce(v_rooms->'available', '[]'::jsonb);

  with session_map as (
    select
      s.id as session_id,
      s.room_id,
      public.try_cast_uuid(
        coalesce(
          sm.extras->>'matchInstanceId',
          sm.extras->>'match_instance_id',
          sm.async_fill_snapshot->>'matchInstanceId',
          sm.async_fill_snapshot->>'match_instance_id'
        )
      ) as match_instance_id,
      s.updated_at as session_updated_at
    from public.rank_sessions s
    left join public.rank_session_meta sm on sm.session_id = s.id
  ),
  my_roster as (
    select
      session_lookup.session_id,
      r.match_instance_id,
      r.role,
      r.updated_at,
      row_number() over (
        order by coalesce(session_lookup.session_updated_at, r.updated_at) desc
      ) as rn
    from public.rank_match_roster r
    left join lateral (
      select sm.session_id, sm.session_updated_at
      from session_map sm
      where (
        sm.match_instance_id is not null
        and sm.match_instance_id = r.match_instance_id
      )
         or (
           sm.match_instance_id is null
           and sm.room_id is not null
           and sm.room_id = r.room_id
         )
      order by sm.session_updated_at desc
      limit 1
    ) as session_lookup on true
    where r.owner_id = v_owner_id
  )
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_sessions
  from (
    select
      s.id as session_id,
      s.status,
      s.game_id,
      g.name as game_name,
      g.description as game_description,
      g.image_url as game_image_url,
      mr.match_instance_id,
      mr.role as viewer_role,
      sm.turn_limit,
      sm.selected_time_limit_seconds,
      sm.drop_in_bonus_seconds,
      sm.turn_state,
      s.updated_at,
      (
        select coalesce(jsonb_agg(to_jsonb(participant_row)), '[]'::jsonb)
        from (
          select
            rp.owner_id,
            rp.hero_id,
            rp.role,
            rp.standin,
            rp.score,
            rp.rating,
            rp.slot_index,
            rp.updated_at,
            h.name as hero_name,
            h.image_url as hero_image_url
          from public.rank_match_roster rp
          left join public.heroes h on h.id = rp.hero_id
          where rp.match_instance_id = mr.match_instance_id
          order by coalesce(rp.slot_index, 0) asc, rp.updated_at desc
          limit 12
        ) as participant_row
      ) as participants
    from my_roster mr
    join public.rank_sessions s on s.id = mr.session_id
    left join public.rank_session_meta sm on sm.session_id = s.id
    left join public.rank_games g on g.id = s.game_id
    where mr.rn <= v_limit
    order by s.updated_at desc
  ) as row;

  with session_map as (
    select
      s.id as session_id,
      s.room_id,
      public.try_cast_uuid(
        coalesce(
          sm.extras->>'matchInstanceId',
          sm.extras->>'match_instance_id',
          sm.async_fill_snapshot->>'matchInstanceId',
          sm.async_fill_snapshot->>'match_instance_id'
        )
      ) as match_instance_id,
      s.updated_at as session_updated_at
    from public.rank_sessions s
    left join public.rank_session_meta sm on sm.session_id = s.id
  ),
  my_roster as (
    select
      session_lookup.session_id,
      r.match_instance_id,
      r.role,
      r.updated_at,
      row_number() over (
        order by coalesce(session_lookup.session_updated_at, r.updated_at) desc
      ) as rn
    from public.rank_match_roster r
    left join lateral (
      select sm.session_id, sm.session_updated_at
      from session_map sm
      where (
        sm.match_instance_id is not null
        and sm.match_instance_id = r.match_instance_id
      )
         or (
           sm.match_instance_id is null
           and sm.room_id is not null
           and sm.room_id = r.room_id
         )
      order by sm.session_updated_at desc
      limit 1
    ) as session_lookup on true
    where r.owner_id = v_owner_id
  ),
  contact_candidates as (
    select distinct on (rp.owner_id, rp.hero_id)
      rp.owner_id,
      rp.hero_id,
      rp.role,
      rp.match_instance_id,
      rp.updated_at
    from public.rank_match_roster rp
    join my_roster mr on mr.match_instance_id = rp.match_instance_id
    where rp.owner_id is not null
      and rp.owner_id <> v_owner_id
    order by rp.owner_id, rp.hero_id, rp.updated_at desc
  )
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_contacts
  from (
    select
      cc.owner_id,
      cc.hero_id,
      cc.role,
      cc.match_instance_id,
      cc.updated_at,
      h.name as hero_name,
      h.image_url as hero_image_url
    from contact_candidates cc
    left join public.heroes h on h.id = cc.hero_id
    order by cc.updated_at desc
    limit v_limit
  ) as row;

  return jsonb_build_object(
    'heroes', coalesce(v_heroes, '[]'::jsonb),
    'rooms', coalesce(v_joined, '[]'::jsonb),
    'publicRooms', coalesce(v_public, '[]'::jsonb),
    'roomSummary', jsonb_build_object(
      'joined', coalesce(v_joined, '[]'::jsonb),
      'available', coalesce(v_public, '[]'::jsonb)
    ),
    'sessions', coalesce(v_sessions, '[]'::jsonb),
    'contacts', coalesce(v_contacts, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.fetch_chat_dashboard(integer)
to authenticated;

drop function if exists public.manage_chat_room_role(uuid, uuid, text, integer, text);
create or replace function public.manage_chat_room_role(
  p_room_id uuid,
  p_target_owner uuid,
  p_action text,
  p_duration_minutes integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room record;
  v_is_owner boolean := false;
  v_is_moderator boolean := false;
  v_target_membership public.chat_room_members%rowtype;
  v_existing_ban public.chat_room_bans%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_expires timestamptz := null;
  v_duration integer := null;
  v_moderator_count integer := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_room_id is null or p_target_owner is null then
    return jsonb_build_object('ok', false, 'error', 'missing_parameter');
  end if;

  select id, owner_id
    into v_room
  from public.chat_rooms
  where id = p_room_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  v_is_owner := (v_room.owner_id = v_actor);

  if not v_is_owner then
    select count(*)
      into v_moderator_count
    from public.chat_room_moderators
    where room_id = p_room_id
      and owner_id = v_actor;

    if v_moderator_count = 0 then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;

    v_is_moderator := true;
  else
    v_is_moderator := true;
  end if;

  if p_action is null then
    return jsonb_build_object('ok', false, 'error', 'missing_action');
  end if;

  if p_action = 'promote' then
    if not v_is_owner then
      return jsonb_build_object('ok', false, 'error', 'owner_only');
    end if;

    if p_target_owner = v_room.owner_id then
      return jsonb_build_object('ok', false, 'error', 'invalid_target');
    end if;

    select count(*)
      into v_moderator_count
    from public.chat_room_moderators
    where room_id = p_room_id;

    if v_moderator_count >= 5 then
      return jsonb_build_object('ok', false, 'error', 'moderator_limit');
    end if;

    update public.chat_room_members
    set is_moderator = true,
        status = 'active'
    where room_id = p_room_id
      and owner_id = p_target_owner
    returning * into v_target_membership;

    if not found then
      insert into public.chat_room_members (room_id, owner_id, status, is_moderator)
      values (p_room_id, p_target_owner, 'active', true)
      on conflict (room_id, owner_id) do update
        set is_moderator = true,
            status = 'active'
      returning * into v_target_membership;
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', 'promote',
      'membership', row_to_json(v_target_membership)
    );
  elsif p_action = 'demote' then
    if not v_is_owner then
      return jsonb_build_object('ok', false, 'error', 'owner_only');
    end if;

    update public.chat_room_members
    set is_moderator = false
    where room_id = p_room_id
      and owner_id = p_target_owner
    returning * into v_target_membership;

    return jsonb_build_object(
      'ok', true,
      'action', 'demote',
      'membership', row_to_json(v_target_membership)
    );
  elsif p_action = 'ban' then
    if not v_is_moderator then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;

    if p_target_owner = v_room.owner_id then
      return jsonb_build_object('ok', false, 'error', 'cannot_ban_owner');
    end if;

    if p_target_owner = v_actor then
      return jsonb_build_object('ok', false, 'error', 'cannot_ban_self');
    end if;

    if p_duration_minutes is not null and p_duration_minutes > 0 then
      v_duration := greatest(p_duration_minutes, 1);
      v_expires := v_now + make_interval(mins => v_duration);
    end if;

    insert into public.chat_room_bans (room_id, owner_id, banned_by, reason, expires_at)
    values (
      p_room_id,
      p_target_owner,
      v_actor,
      nullif(trim(coalesce(p_reason, '')), ''),
      v_expires
    )
    on conflict (room_id, owner_id) do update
      set banned_by = excluded.banned_by,
          reason = excluded.reason,
          expires_at = excluded.expires_at,
          updated_at = timezone('utc', now())
    returning * into v_existing_ban;

    update public.chat_room_members
    set status = 'banned',
        is_moderator = false
    where room_id = p_room_id
      and owner_id = p_target_owner
    returning * into v_target_membership;

    return jsonb_build_object(
      'ok', true,
      'action', 'ban',
      'ban', row_to_json(v_existing_ban),
      'membership', row_to_json(v_target_membership)
    );
  elsif p_action = 'unban' then
    delete from public.chat_room_bans
    where room_id = p_room_id
      and owner_id = p_target_owner
    returning * into v_existing_ban;

    update public.chat_room_members
    set status = 'inactive',
        is_moderator = false
    where room_id = p_room_id
      and owner_id = p_target_owner
    returning * into v_target_membership;

    return jsonb_build_object(
      'ok', true,
      'action', 'unban',
      'ban', row_to_json(v_existing_ban),
      'membership', row_to_json(v_target_membership)
    );
  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end if;
end;
$$;

grant execute on function public.manage_chat_room_role(uuid, uuid, text, integer, text)
to authenticated;

drop function if exists public.fetch_chat_room_bans(uuid);
create or replace function public.fetch_chat_room_bans(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_allowed boolean := false;
  v_bans jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('bans', '[]'::jsonb);
  end if;

  select exists (
    select 1
    from public.chat_rooms r
    where r.id = p_room_id
      and r.owner_id = v_actor
  )
  or exists (
    select 1
    from public.chat_room_moderators m
    where m.room_id = p_room_id
      and m.owner_id = v_actor
  )
    into v_allowed;

  if not v_allowed then
    return jsonb_build_object('bans', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
    into v_bans
  from (
    select
      b.room_id,
      b.owner_id,
      b.banned_by,
      b.reason,
      b.expires_at,
      b.created_at,
      b.updated_at,
      u.email as banned_by_email,
      u.raw_user_meta_data->>'full_name' as banned_by_name,
      coalesce(
        u_owner.raw_user_meta_data->>'full_name',
        u_owner.email,
        b.owner_id::text
      ) as owner_name,
      u_owner.email as owner_email
    from public.chat_room_bans b
    left join auth.users u on u.id = b.banned_by
    left join auth.users u_owner on u_owner.id = b.owner_id
    where b.room_id = p_room_id
    order by b.created_at desc
  ) as row;

  return jsonb_build_object('bans', v_bans);
end;
$$;

grant execute on function public.fetch_chat_room_bans(uuid)
to authenticated;

drop function if exists public.update_chat_room_ban(uuid, uuid, integer, text);
create or replace function public.update_chat_room_ban(
  p_room_id uuid,
  p_owner_id uuid,
  p_duration_minutes integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_owner boolean := false;
  v_new_expires_at timestamptz := null;
  v_reason text := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(r.owner_id = v_actor, false)
    into v_is_owner
  from public.chat_rooms r
  where r.id = p_room_id;

  if not v_is_owner then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_duration_minutes is not null then
    if p_duration_minutes < 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_duration');
    end if;
    if p_duration_minutes = 0 then
      v_new_expires_at := null;
    else
      v_new_expires_at := timezone('utc', now()) + make_interval(mins => p_duration_minutes);
    end if;
  end if;

  if p_reason is not null then
    v_reason := nullif(trim(p_reason), '');
  end if;

  update public.chat_room_bans
  set
    expires_at = coalesce(v_new_expires_at, expires_at),
    reason = coalesce(v_reason, reason),
    updated_at = timezone('utc', now())
  where room_id = p_room_id
    and owner_id = p_owner_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ban_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ban', (
      select to_jsonb(b) || jsonb_build_object(
        'banned_by_email', u.email,
        'banned_by_name', u.raw_user_meta_data->>'full_name',
        'owner_name', coalesce(u_owner.raw_user_meta_data->>'full_name', u_owner.email, b.owner_id::text),
        'owner_email', u_owner.email
      )
      from public.chat_room_bans b
      left join auth.users u on u.id = b.banned_by
      left join auth.users u_owner on u_owner.id = b.owner_id
      where b.room_id = p_room_id
        and b.owner_id = p_owner_id
    )
  );
end;
$$;

grant execute on function public.update_chat_room_ban(uuid, uuid, integer, text)
to authenticated;

drop function if exists public.fetch_chat_room_announcements(uuid, integer, timestamptz);
create or replace function public.fetch_chat_room_announcements(
  p_room_id uuid,
  p_limit integer default 20,
  p_cursor timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_can_view boolean := false;
  v_limit integer := greatest(5, least(coalesce(p_limit, 20), 100));
  v_cursor timestamptz := p_cursor;
  v_pinned jsonb := null;
  v_announcements jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('announcements', '[]'::jsonb, 'pinned', null, 'hasMore', false);
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = p_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = p_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = p_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_view;

  if not v_can_view then
    return jsonb_build_object('announcements', '[]'::jsonb, 'pinned', null, 'hasMore', false);
  end if;

  select to_jsonb(row)
    into v_pinned
  from (
    select
      a.id,
      a.room_id,
      nullif(to_jsonb(a)->>'title', '') as title,
      a.content,
      nullif(to_jsonb(a)->>'image_url', '') as image_url,
      coalesce((to_jsonb(a)->>'pinned')::boolean, false) as pinned,
      a.created_at,
      a.updated_at,
      a.author_id,
      u.raw_user_meta_data->>'full_name' as author_name,
      u.email as author_email,
      (select count(*) from public.chat_room_announcement_reactions r where r.announcement_id = a.id) as heart_count,
      (select count(*) from public.chat_room_announcement_comments c where c.announcement_id = a.id) as comment_count,
      exists (
        select 1
        from public.chat_room_announcement_reactions r
        where r.announcement_id = a.id
          and r.owner_id = v_actor
      ) as viewer_reacted,
      polls_data.polls
    from public.chat_room_announcements a
    left join auth.users u on u.id = a.author_id
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poll.id,
        'question', poll.question,
        'totalVotes', coalesce(option_data.total_votes, 0),
        'viewerOptionId', viewer_vote.option_id,
        'options', coalesce(option_data.options, '[]'::jsonb)
      ) order by poll.created_at asc, poll.id asc), '[]'::jsonb) as polls
      from public.chat_room_announcement_polls poll
      left join public.chat_room_announcement_poll_votes viewer_vote
        on viewer_vote.poll_id = poll.id
       and viewer_vote.owner_id = v_actor
      left join lateral (
        select
          coalesce(jsonb_agg(jsonb_build_object(
            'id', opt.id,
            'label', opt.label,
            'position', opt.position,
            'voteCount', coalesce(counts.vote_count, 0),
            'viewerVoted', viewer_vote.option_id is not null and viewer_vote.option_id = opt.id
          ) order by opt.position, opt.id), '[]'::jsonb) as options,
          coalesce(sum(counts.vote_count), 0)::integer as total_votes
        from public.chat_room_announcement_poll_options opt
        left join lateral (
          select count(*)::integer as vote_count
          from public.chat_room_announcement_poll_votes v_opt
          where v_opt.option_id = opt.id
        ) counts on true
        where opt.poll_id = poll.id
      ) option_data on true
      where poll.announcement_id = a.id
    ) polls_data on true
    where a.room_id = p_room_id
      and coalesce((to_jsonb(a)->>'pinned')::boolean, false)
    order by a.updated_at desc, a.id desc
    limit 1
  ) as row;

  with candidate as (
    select
      a.id,
      a.room_id,
      nullif(to_jsonb(a)->>'title', '') as title,
      a.content,
      nullif(to_jsonb(a)->>'image_url', '') as image_url,
      coalesce((to_jsonb(a)->>'pinned')::boolean, false) as pinned,
      a.created_at,
      a.updated_at,
      a.author_id,
      u.raw_user_meta_data->>'full_name' as author_name,
      u.email as author_email,
      (select count(*) from public.chat_room_announcement_reactions r where r.announcement_id = a.id) as heart_count,
      (select count(*) from public.chat_room_announcement_comments c where c.announcement_id = a.id) as comment_count,
      exists (
        select 1
        from public.chat_room_announcement_reactions r
        where r.announcement_id = a.id
          and r.owner_id = v_actor
      ) as viewer_reacted,
      polls_data.polls
    from public.chat_room_announcements a
    left join auth.users u on u.id = a.author_id
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poll.id,
        'question', poll.question,
        'totalVotes', coalesce(option_data.total_votes, 0),
        'viewerOptionId', viewer_vote.option_id,
        'options', coalesce(option_data.options, '[]'::jsonb)
      ) order by poll.created_at asc, poll.id asc), '[]'::jsonb) as polls
      from public.chat_room_announcement_polls poll
      left join public.chat_room_announcement_poll_votes viewer_vote
        on viewer_vote.poll_id = poll.id
       and viewer_vote.owner_id = v_actor
      left join lateral (
        select
          coalesce(jsonb_agg(jsonb_build_object(
            'id', opt.id,
            'label', opt.label,
            'position', opt.position,
            'voteCount', coalesce(counts.vote_count, 0),
            'viewerVoted', viewer_vote.option_id is not null and viewer_vote.option_id = opt.id
          ) order by opt.position, opt.id), '[]'::jsonb) as options,
          coalesce(sum(counts.vote_count), 0)::integer as total_votes
        from public.chat_room_announcement_poll_options opt
        left join lateral (
          select count(*)::integer as vote_count
          from public.chat_room_announcement_poll_votes v_opt
          where v_opt.option_id = opt.id
        ) counts on true
        where opt.poll_id = poll.id
      ) option_data on true
      where poll.announcement_id = a.id
    ) polls_data on true
    where a.room_id = p_room_id
      and (
        not coalesce((to_jsonb(a)->>'pinned')::boolean, false)
        or v_pinned is null
        or a.id <> (v_pinned->>'id')::uuid
      )
      and (v_cursor is null or a.created_at < v_cursor)
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ),
  limited as (
    select *
    from candidate
    order by created_at desc, id desc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(limited)), '[]'::jsonb),
    (select count(*) from candidate) > v_limit
  into v_announcements, v_has_more
  from limited;

  return jsonb_build_object(
    'announcements', v_announcements,
    'pinned', v_pinned,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

grant execute on function public.fetch_chat_room_announcements(uuid, integer, timestamptz)
to authenticated;

drop function if exists public.fetch_chat_room_announcement_detail(uuid);
create or replace function public.fetch_chat_room_announcement_detail(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid;
  v_can_view boolean := false;
  v_announcement jsonb := null;
  v_comments jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('announcement', null, 'comments', '[]'::jsonb);
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = p_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('announcement', null, 'comments', '[]'::jsonb);
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = v_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_view;

  if not v_can_view then
    return jsonb_build_object('announcement', null, 'comments', '[]'::jsonb);
  end if;

  select to_jsonb(row)
    into v_announcement
  from (
    select
      a.id,
      a.room_id,
      nullif(to_jsonb(a)->>'title', '') as title,
      a.content,
      nullif(to_jsonb(a)->>'image_url', '') as image_url,
      coalesce((to_jsonb(a)->>'pinned')::boolean, false) as pinned,
      a.created_at,
      a.updated_at,
      a.author_id,
      u.raw_user_meta_data->>'full_name' as author_name,
      u.email as author_email,
      (select count(*) from public.chat_room_announcement_reactions r where r.announcement_id = a.id) as heart_count,
      (select count(*) from public.chat_room_announcement_comments c where c.announcement_id = a.id) as comment_count,
      exists (
        select 1
        from public.chat_room_announcement_reactions r
        where r.announcement_id = a.id
          and r.owner_id = v_actor
      ) as viewer_reacted,
      polls_data.polls
    from public.chat_room_announcements a
    left join auth.users u on u.id = a.author_id
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poll.id,
        'question', poll.question,
        'totalVotes', coalesce(option_data.total_votes, 0),
        'viewerOptionId', viewer_vote.option_id,
        'options', coalesce(option_data.options, '[]'::jsonb)
      ) order by poll.created_at asc, poll.id asc), '[]'::jsonb) as polls
      from public.chat_room_announcement_polls poll
      left join public.chat_room_announcement_poll_votes viewer_vote
        on viewer_vote.poll_id = poll.id
       and viewer_vote.owner_id = v_actor
      left join lateral (
        select
          coalesce(jsonb_agg(jsonb_build_object(
            'id', opt.id,
            'label', opt.label,
            'position', opt.position,
            'voteCount', coalesce(counts.vote_count, 0),
            'viewerVoted', viewer_vote.option_id is not null and viewer_vote.option_id = opt.id
          ) order by opt.position, opt.id), '[]'::jsonb) as options,
          coalesce(sum(counts.vote_count), 0)::integer as total_votes
        from public.chat_room_announcement_poll_options opt
        left join lateral (
          select count(*)::integer as vote_count
          from public.chat_room_announcement_poll_votes v_opt
          where v_opt.option_id = opt.id
        ) counts on true
        where opt.poll_id = poll.id
      ) option_data on true
      where poll.announcement_id = a.id
    ) polls_data on true
    where a.id = p_announcement_id
  ) as row;

  with comment_rows as (
    select
      c.id,
      c.announcement_id,
      c.owner_id,
      c.content,
      c.created_at,
      u.raw_user_meta_data->>'full_name' as owner_name,
      u.email as owner_email
    from public.chat_room_announcement_comments c
    left join auth.users u on u.id = c.owner_id
    where c.announcement_id = p_announcement_id
    order by c.created_at asc, c.id asc
    limit 200
  )
  select coalesce(jsonb_agg(to_jsonb(comment_rows)), '[]'::jsonb)
    into v_comments
  from comment_rows;

  return jsonb_build_object('announcement', v_announcement, 'comments', v_comments);
end;
$$;

grant execute on function public.fetch_chat_room_announcement_detail(uuid)
to authenticated;

drop function if exists public.create_chat_room_announcement(uuid, text, boolean);
drop function if exists public.create_chat_room_announcement(uuid, text, text, boolean);
drop function if exists public.create_chat_room_announcement(uuid, text, text, text, boolean);
create or replace function public.create_chat_room_announcement(
  p_room_id uuid,
  p_content text,
  p_title text default null,
  p_image_url text default null,
  p_pinned boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_can_manage boolean := false;
  v_title text := null;
  v_content text := coalesce(p_content, '');
  v_image text := null;
  v_row jsonb := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_content := trim(v_content);
  if v_content = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_content');
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  v_image := nullif(trim(coalesce(p_image_url, '')), '');

  select exists (
      select 1 from public.chat_rooms r
      where r.id = p_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = p_room_id
        and m.owner_id = v_actor
    )
    into v_can_manage;

  if not v_can_manage then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_room_announcements (room_id, author_id, title, content, image_url, pinned)
  values (p_room_id, v_actor, v_title, v_content, v_image, coalesce(p_pinned, false))
  returning jsonb_build_object(
    'id', id,
    'room_id', room_id,
    'author_id', author_id,
    'title', title,
    'content', content,
    'image_url', image_url,
    'pinned', pinned,
    'created_at', created_at,
    'updated_at', updated_at
  ) into v_row;

  if p_pinned then
    update public.chat_room_announcements
    set pinned = false
    where room_id = p_room_id
      and id <> (v_row->>'id')::uuid
      and pinned;
  end if;

  return jsonb_build_object('ok', true, 'announcement', v_row);
end;
$$;

grant execute on function public.create_chat_room_announcement(uuid, text, text, text, boolean)
to authenticated;

drop function if exists public.sync_chat_room_announcement_polls(uuid, jsonb);
create or replace function public.sync_chat_room_announcement_polls(
  p_announcement_id uuid,
  p_polls jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid := null;
  v_can_manage boolean := false;
  v_poll_records jsonb := coalesce(p_polls, '[]'::jsonb);
  v_poll jsonb;
  v_option jsonb;
  v_poll_id uuid;
  v_option_id uuid;
  v_question text;
  v_position integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = p_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    into v_can_manage;

  if not v_can_manage then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.chat_room_announcement_poll_votes
  where poll_id in (
    select id from public.chat_room_announcement_polls
    where announcement_id = p_announcement_id
  );

  delete from public.chat_room_announcement_poll_options
  where poll_id in (
    select id from public.chat_room_announcement_polls
    where announcement_id = p_announcement_id
  );

  delete from public.chat_room_announcement_polls
  where announcement_id = p_announcement_id;

  if jsonb_typeof(v_poll_records) <> 'array' then
    v_poll_records := '[]'::jsonb;
  end if;

  for v_poll in select * from jsonb_array_elements(v_poll_records)
  loop
    v_poll_id := null;
    v_question := nullif(trim(coalesce(v_poll->>'question', '')), '');

    if v_question is null then
      continue;
    end if;

    begin
      v_poll_id := (v_poll->>'id')::uuid;
    exception
      when others then
        v_poll_id := null;
    end;

    if v_poll_id is null then
      v_poll_id := gen_random_uuid();
    end if;

    insert into public.chat_room_announcement_polls (id, announcement_id, question)
    values (v_poll_id, p_announcement_id, v_question)
    on conflict (id) do update
      set question = excluded.question,
          updated_at = timezone('utc', now());

    if v_poll ? 'options' and jsonb_typeof(v_poll->'options') = 'array' then
      v_position := 0;
      for v_option in select * from jsonb_array_elements(v_poll->'options')
      loop
        v_position := v_position + 1;
        begin
          v_option_id := (v_option->>'id')::uuid;
        exception
          when others then
            v_option_id := null;
        end;

        if v_option_id is null then
          v_option_id := gen_random_uuid();
        end if;

        insert into public.chat_room_announcement_poll_options (id, poll_id, label, position)
        values (
          v_option_id,
          v_poll_id,
          coalesce(nullif(v_option->>'label', ''), format('옵션 %s', v_position)),
          v_position
        )
        on conflict (id) do update
          set label = excluded.label,
              position = excluded.position;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.sync_chat_room_announcement_polls(uuid, jsonb)
to authenticated;

drop function if exists public.vote_chat_room_announcement_poll(uuid, uuid);
create or replace function public.vote_chat_room_announcement_poll(
  p_poll_id uuid,
  p_option_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_announcement_id uuid := null;
  v_room_id uuid := null;
  v_can_vote boolean := false;
  v_option_exists boolean := false;
  v_current_option uuid := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select announcement_id
    into v_announcement_id
  from public.chat_room_announcement_polls
  where id = p_poll_id;

  if v_announcement_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = v_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = v_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_vote;

  if not v_can_vote then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_option_id is not null then
    select exists (
      select 1
      from public.chat_room_announcement_poll_options opt
      where opt.id = p_option_id
        and opt.poll_id = p_poll_id
    )
    into v_option_exists;

    if not v_option_exists then
      return jsonb_build_object('ok', false, 'error', 'invalid_option');
    end if;
  end if;

  if p_option_id is null then
    delete from public.chat_room_announcement_poll_votes
    where poll_id = p_poll_id
      and owner_id = v_actor;
  else
    insert into public.chat_room_announcement_poll_votes (poll_id, option_id, owner_id)
    values (p_poll_id, p_option_id, v_actor)
    on conflict (poll_id, owner_id) do update
      set option_id = excluded.option_id,
          created_at = timezone('utc', now());
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.vote_chat_room_announcement_poll(uuid, uuid)
to authenticated;

drop function if exists public.update_chat_room_announcement_pin(uuid, boolean);
create or replace function public.update_chat_room_announcement_pin(
  p_announcement_id uuid,
  p_pinned boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := null;
  v_room_id uuid := null;
  v_can_manage boolean := false;
  v_target_pinned boolean := coalesce(p_pinned, false);
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = p_announcement_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    into v_can_manage;

  if not v_can_manage then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.chat_room_announcements
  set pinned = v_target_pinned,
      updated_at = timezone('utc', now())
  where id = p_announcement_id
  returning jsonb_build_object(
    'id', id,
    'room_id', room_id,
    'author_id', author_id,
    'title', title,
    'content', content,
    'image_url', image_url,
    'pinned', pinned,
    'created_at', created_at,
    'updated_at', updated_at
  )
  into v_row;

  if v_target_pinned then
    update public.chat_room_announcements
    set pinned = false
    where room_id = v_room_id
      and id <> p_announcement_id
      and pinned;
  end if;

  return jsonb_build_object('ok', true, 'announcement', v_row);
end;
$$;

grant execute on function public.update_chat_room_announcement_pin(uuid, boolean)
to authenticated;

drop function if exists public.delete_chat_room_announcement(uuid);
create or replace function public.delete_chat_room_announcement(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid;
  v_author_id uuid;
  v_can_manage boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select room_id, author_id
    into v_room_id, v_author_id
  from public.chat_room_announcements
  where id = p_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    or v_actor = v_author_id
    into v_can_manage;

  if not v_can_manage then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.chat_room_announcement_reactions
  where announcement_id = p_announcement_id;

  delete from public.chat_room_announcement_comments
  where announcement_id = p_announcement_id;

  delete from public.chat_room_announcements
  where id = p_announcement_id;

  return jsonb_build_object('ok', true, 'deletedId', p_announcement_id);
end;
$$;

grant execute on function public.delete_chat_room_announcement(uuid)
to authenticated;

drop function if exists public.toggle_chat_room_announcement_reaction(uuid);
create or replace function public.toggle_chat_room_announcement_reaction(
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid;
  v_can_view boolean := false;
  v_reacted boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = p_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = v_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_view;

  if not v_can_view then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if exists (
    select 1
    from public.chat_room_announcement_reactions r
    where r.announcement_id = p_announcement_id
      and r.owner_id = v_actor
  ) then
    delete from public.chat_room_announcement_reactions
    where announcement_id = p_announcement_id
      and owner_id = v_actor;
    v_reacted := false;
  else
    insert into public.chat_room_announcement_reactions (announcement_id, owner_id)
    values (p_announcement_id, v_actor)
    on conflict do nothing;
    v_reacted := true;
  end if;

  return jsonb_build_object('ok', true, 'reacted', v_reacted);
end;
$$;

grant execute on function public.toggle_chat_room_announcement_reaction(uuid)
to authenticated;

drop function if exists public.create_chat_room_announcement_comment(uuid, text);
create or replace function public.create_chat_room_announcement_comment(
  p_announcement_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid;
  v_can_view boolean := false;
  v_content text := coalesce(p_content, '');
  v_comment jsonb := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_content := trim(v_content);
  if v_content = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_content');
  end if;

  select room_id
    into v_room_id
  from public.chat_room_announcements
  where id = p_announcement_id;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = v_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = v_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = v_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_view;

  if not v_can_view then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_room_announcement_comments (announcement_id, owner_id, content)
  values (p_announcement_id, v_actor, v_content)
  returning jsonb_build_object(
    'id', id,
    'announcement_id', announcement_id,
    'owner_id', owner_id,
    'content', content,
    'created_at', created_at
  ) into v_comment;

  return jsonb_build_object('ok', true, 'comment', v_comment);
end;
$$;

grant execute on function public.create_chat_room_announcement_comment(uuid, text)
to authenticated;

drop function if exists public.delete_chat_room_announcement_comment(uuid);
create or replace function public.delete_chat_room_announcement_comment(
  p_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room_id uuid;
  v_owner_id uuid;
  v_can_delete boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_comment_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_comment_id');
  end if;

  select c.owner_id, a.room_id
    into v_owner_id, v_room_id
  from public.chat_room_announcement_comments c
  join public.chat_room_announcements a on a.id = c.announcement_id
  where c.id = p_comment_id
  limit 1;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select
    v_actor = v_owner_id
    or exists (select 1 from public.chat_rooms r where r.id = v_room_id and r.owner_id = v_actor)
    or exists (select 1 from public.chat_room_moderators m where m.room_id = v_room_id and m.owner_id = v_actor)
    into v_can_delete;

  if not v_can_delete then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.chat_room_announcement_comments
  where id = p_comment_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.delete_chat_room_announcement_comment(uuid)
to authenticated;

drop function if exists public.fetch_chat_room_stats(uuid);
create or replace function public.fetch_chat_room_stats(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_can_view boolean := false;
  v_total_messages bigint := 0;
  v_messages_24h bigint := 0;
  v_attachment_count bigint := 0;
  v_last_message timestamptz := null;
  v_participant_count bigint := 0;
  v_moderator_count bigint := 0;
  v_contributions jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select exists (
      select 1 from public.chat_rooms r
      where r.id = p_room_id
        and r.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_moderators m
      where m.room_id = p_room_id
        and m.owner_id = v_actor
    )
    or exists (
      select 1 from public.chat_room_members mem
      where mem.room_id = p_room_id
        and mem.owner_id = v_actor
        and coalesce(mem.status, 'active') = 'active'
    )
    into v_can_view;

  if not v_can_view then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select
    coalesce(count(*), 0),
    coalesce(count(*) filter (where created_at >= timezone('utc', now()) - interval '24 hours'), 0),
    coalesce(sum(jsonb_array_length(coalesce(metadata->'attachments', '[]'::jsonb))), 0),
    max(created_at)
  into
    v_total_messages,
    v_messages_24h,
    v_attachment_count,
    v_last_message
  from public.messages
  where chat_room_id = p_room_id;

  select coalesce(count(*), 0)
    into v_participant_count
  from public.chat_room_members mem
  where mem.room_id = p_room_id
    and coalesce(mem.status, 'active') = 'active';

  select coalesce(count(*), 0)
    into v_moderator_count
  from public.chat_room_moderators m
  where m.room_id = p_room_id;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ownerId', stats.owner_id,
          'displayName', stats.display_name,
          'messageCount', stats.message_count,
          'share', case
            when v_total_messages > 0 then round((stats.message_count::numeric * 100) / v_total_messages, 2)
            else 0
          end,
          'lastMessageAt', stats.last_message_at
        )
        order by stats.message_count desc, stats.display_name
      ),
      '[]'::jsonb
    )
    into v_contributions
  from (
    select
      base.owner_id,
      base.message_count,
      base.last_message_at,
      coalesce(base.last_username, u_owner.raw_user_meta_data->>'full_name', u_owner.email, base.owner_id::text) as display_name
    from (
      select
        msg.owner_id,
        count(*) as message_count,
        max(msg.created_at) as last_message_at,
        max(msg.username) filter (where msg.username is not null) as last_username
      from public.messages msg
      where msg.chat_room_id = p_room_id
      group by msg.owner_id
    ) as base
    left join auth.users u_owner on u_owner.id = base.owner_id
  ) as stats;

  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'messageCount', v_total_messages,
      'messagesLast24h', v_messages_24h,
      'attachmentCount', v_attachment_count,
      'participantCount', v_participant_count,
      'moderatorCount', v_moderator_count,
      'lastMessageAt', v_last_message,
      'contributions', v_contributions
    )
  );
end;
$$;

grant execute on function public.fetch_chat_room_stats(uuid)
to authenticated;

drop function if exists public.fetch_chat_member_preferences(uuid);
create or replace function public.fetch_chat_member_preferences(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select to_jsonb(row)
    into v_row
  from (
    select
      pref.room_id,
      pref.owner_id,
      pref.bubble_color,
      pref.text_color,
      pref.background_url,
      pref.use_room_background,
      pref.metadata,
      pref.updated_at
    from public.chat_room_member_preferences pref
    where pref.room_id = p_room_id
      and pref.owner_id = v_actor
  ) as row;

  return jsonb_build_object(
    'ok', true,
    'preferences', coalesce(v_row, jsonb_build_object(
      'room_id', p_room_id,
      'owner_id', v_actor,
      'bubble_color', null,
      'text_color', null,
      'background_url', null,
      'use_room_background', true,
      'metadata', '{}'::jsonb
    ))
  );
end;
$$;

grant execute on function public.fetch_chat_member_preferences(uuid)
to authenticated;

drop function if exists public.upsert_chat_member_preferences(uuid, jsonb);
create or replace function public.upsert_chat_member_preferences(
  p_room_id uuid,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_bubble text := null;
  v_text text := null;
  v_background text := null;
  v_use_room boolean := true;
  v_metadata jsonb := '{}'::jsonb;
  v_row jsonb := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_preferences ? 'bubbleColor' then
    v_bubble := nullif(trim(coalesce(p_preferences->>'bubbleColor', '')), '');
  end if;

  if p_preferences ? 'textColor' then
    v_text := nullif(trim(coalesce(p_preferences->>'textColor', '')), '');
  end if;

  if p_preferences ? 'backgroundUrl' then
    v_background := nullif(trim(coalesce(p_preferences->>'backgroundUrl', '')), '');
  end if;

  if p_preferences ? 'useRoomBackground' then
    v_use_room := coalesce((p_preferences->>'useRoomBackground')::boolean, true);
  end if;

  if p_preferences ? 'metadata' then
    v_metadata := coalesce(p_preferences->'metadata', '{}'::jsonb);
  end if;

  insert into public.chat_room_member_preferences (
    room_id,
    owner_id,
    bubble_color,
    text_color,
    background_url,
    use_room_background,
    metadata
  )
  values (
    p_room_id,
    v_actor,
    v_bubble,
    v_text,
    v_background,
    v_use_room,
    v_metadata
  )
  on conflict (room_id, owner_id) do update
    set bubble_color = v_bubble,
        text_color = v_text,
        background_url = v_background,
        use_room_background = v_use_room,
        metadata = v_metadata
  returning jsonb_build_object(
    'room_id', room_id,
    'owner_id', owner_id,
    'bubble_color', bubble_color,
    'text_color', text_color,
    'background_url', background_url,
    'use_room_background', use_room_background,
    'metadata', metadata,
    'updated_at', updated_at
  ) into v_row;

  return jsonb_build_object('ok', true, 'preferences', v_row);
end;
$$;

grant execute on function public.upsert_chat_member_preferences(uuid, jsonb)
to authenticated;

drop function if exists public.update_chat_room_settings(uuid, jsonb);
create or replace function public.update_chat_room_settings(
  p_room_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_background text := null;
  v_default_ban integer := null;
  v_theme jsonb := null;
  v_theme_mode text := null;
  v_theme_preset text := null;
  v_theme_background text := null;
  v_theme_color text := null;
  v_theme_accent text := null;
  v_theme_bubble text := null;
  v_theme_text text := null;
  v_theme_auto boolean := true;
  v_row jsonb := null;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1 from public.chat_rooms r
    where r.id = p_room_id
      and r.owner_id = v_actor
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_settings ? 'defaultBanMinutes' then
    begin
      v_default_ban := greatest(0, coalesce((p_settings->>'defaultBanMinutes')::integer, 0));
    exception when others then
      v_default_ban := 0;
    end;
  end if;

  if p_settings ? 'defaultTheme' then
    v_theme := coalesce(p_settings->'defaultTheme', '{}'::jsonb);
    v_theme_mode := nullif(trim(coalesce(v_theme->>'mode', '')), '');
    if v_theme_mode not in ('preset', 'color', 'image', 'none') then
      v_theme_mode := 'preset';
    end if;
    v_theme_preset := nullif(trim(coalesce(v_theme->>'presetId', '')), '');
    v_theme_background := nullif(trim(coalesce(v_theme->>'backgroundUrl', '')), '');
    v_theme_color := nullif(trim(coalesce(v_theme->>'backgroundColor', '')), '');
    v_theme_accent := nullif(trim(coalesce(v_theme->>'accentColor', '')), '');
    v_theme_bubble := nullif(trim(coalesce(v_theme->>'bubbleColor', '')), '');
    v_theme_text := nullif(trim(coalesce(v_theme->>'textColor', '')), '');
    begin
      v_theme_auto := coalesce((v_theme->>'autoContrast')::boolean, true);
    exception when others then
      v_theme_auto := true;
    end;

    v_theme := jsonb_strip_nulls(
      jsonb_build_object(
        'mode', coalesce(v_theme_mode, 'preset'),
        'presetId', v_theme_preset,
        'backgroundUrl', case when coalesce(v_theme_mode, 'preset') = 'image' then v_theme_background else null end,
        'backgroundColor', case when coalesce(v_theme_mode, 'preset') = 'color' then v_theme_color else null end,
        'accentColor', v_theme_accent,
        'bubbleColor', v_theme_bubble,
        'textColor', v_theme_text,
        'autoContrast', v_theme_auto
      )
    );

    if coalesce(v_theme_mode, 'preset') = 'image' and v_background is null then
      v_background := v_theme_background;
    elsif coalesce(v_theme_mode, 'preset') <> 'image' and v_background is null then
      v_background := null;
    end if;
  end if;

  if p_settings ? 'defaultBackgroundUrl' then
    v_background := nullif(trim(coalesce(p_settings->>'defaultBackgroundUrl', '')), '');
  end if;

  update public.chat_rooms
  set default_background_url = case
        when v_background is not null then v_background
        when v_theme is not null and coalesce(v_theme->>'mode', 'preset') <> 'image' then null
        else default_background_url
      end,
      default_ban_minutes = coalesce(v_default_ban, default_ban_minutes),
      default_theme = coalesce(v_theme, default_theme)
  where id = p_room_id
  returning jsonb_build_object(
    'id', id,
    'default_background_url', default_background_url,
    'default_ban_minutes', default_ban_minutes,
    'default_theme', default_theme,
    'updated_at', updated_at
  ) into v_row;

  return jsonb_build_object('ok', true, 'settings', v_row);
end;
$$;

grant execute on function public.update_chat_room_settings(uuid, jsonb)
to authenticated;

--

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_bans'
  ) then
    alter publication supabase_realtime add table public.chat_room_bans;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_announcements'
  ) then
    alter publication supabase_realtime add table public.chat_room_announcements;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_announcement_comments'
  ) then
    alter publication supabase_realtime add table public.chat_room_announcement_comments;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_announcement_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_room_announcement_reactions;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_member_preferences'
  ) then
    alter publication supabase_realtime add table public.chat_room_member_preferences;
  end if;
end;
$$;
