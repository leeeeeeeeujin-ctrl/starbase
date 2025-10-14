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
begin
  if p_room_id is null then
    raise exception 'missing_room_id';
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
      p_owner_id,
      'active',
      0,
      p_mode,
      v_vote_payload
    )
    returning id into v_session_id;
  else
    update public.rank_sessions
       set updated_at = now(),
           mode = coalesce(p_mode, mode),
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
begin
  if p_room_id is null or p_game_id is null or p_match_instance_id is null then
    raise exception 'missing_identifiers';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'empty_roster';
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
  jsonb,
  bigint,
  text,
  timestamptz
) to service_role;

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
  check (channel_type in ('lobby', 'main', 'role', 'whisper', 'system'));

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

drop policy if exists messages_select_public on public.messages;
create policy messages_select_public
on public.messages for select
using (
  auth.role() = 'service_role'
  or scope = 'global'
  or visible_owner_ids is null
  or auth.uid() = owner_id
  or auth.uid() = user_id
  or (visible_owner_ids is not null and auth.uid() = any(visible_owner_ids))
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

    if left(v_topic, 9) = 'realtime:' or left(v_topic, 6) = 'topic:' then
      v_final_topic := v_topic;
    else
      v_final_topic := 'realtime:public:' || v_topic;
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
    'messages:global',
    case when v_scope is not null and trim(both from v_scope) <> '' then 'messages:scope:' || lower(trim(both from v_scope)) end,
    case when v_channel is not null and trim(both from v_channel) <> '' then 'messages:channel:' || lower(trim(both from v_channel)) end,
    case when v_session is not null then 'messages:session:' || v_session::text end,
    case when v_match is not null then 'messages:match:' || v_match::text end,
    case when v_game is not null then 'messages:game:' || v_game::text end,
    case when v_room is not null then 'messages:room:' || v_room::text end,
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
begin
  if v_user_id is null and p_user_id is not null then
    v_user_id := p_user_id;
  end if;

  if v_user_id is null then
    raise exception 'missing_user_id' using errcode = 'P0001';
  end if;

  if v_text = '' then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;

  if v_scope not in ('global', 'main', 'role', 'whisper', 'system') then
    v_scope := 'global';
  end if;

  v_channel := case v_scope
    when 'main' then 'main'
    when 'role' then 'role'
    when 'whisper' then 'whisper'
    when 'system' then 'system'
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

  if v_scope in ('main', 'role', 'whisper') then
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
  text,
  jsonb,
  uuid
)
to authenticated,
   service_role;

create or replace function public.fetch_rank_chat_threads(
  p_session_id uuid default null,
  p_match_instance_id uuid default null,
  p_limit integer default 120
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
    select * from global_messages
    union all
    select * from main_messages
    union all
    select * from role_messages
    union all
    select * from whisper_messages
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
      c.room_id,
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
        else c.thread_label
      end as thread_label
    from combined as c
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
  integer
)
to authenticated,
   service_role,
   anon;

--
