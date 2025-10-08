-- starbase rank project Supabase schema bootstrap
-- Run this script (or paste sections) into the Supabase SQL editor when migrating a new instance.
-- It consolidates gameplay, social, monitoring, CMS, and chat tables plus RLS policies.

-- =========================================
--  Base gameplay & monitoring schema
-- =========================================
-- 초기 확장 설정
create extension if not exists "pgcrypto";

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

create policy if not exists heroes_select_owner
on public.heroes for select using (auth.uid() = owner_id);

create policy if not exists heroes_insert_owner
on public.heroes for insert with check (auth.uid() = owner_id);

create policy if not exists heroes_update_owner
on public.heroes for update using (auth.uid() = owner_id);

create policy if not exists heroes_delete_owner
on public.heroes for delete using (auth.uid() = owner_id);

drop view if exists public.rank_heroes;
create view public.rank_heroes as
select * from public.heroes;

grant select on public.rank_heroes to authenticated;
grant select on public.rank_heroes to anon;

-- 스토리지 버킷 'heroes' 접근 정책
create policy if not exists storage_heroes_select
on storage.objects for select
using (bucket_id = 'heroes');

create policy if not exists storage_heroes_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'heroes');

create policy if not exists storage_heroes_update
on storage.objects for update to authenticated
using (bucket_id = 'heroes')
with check (bucket_id = 'heroes');

create policy if not exists storage_title_backgrounds_select
on storage.objects for select
using (bucket_id = 'title-backgrounds');

create policy if not exists storage_title_backgrounds_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'title-backgrounds' and auth.role() = 'service_role');

create policy if not exists storage_title_backgrounds_update
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

create policy if not exists prompt_sets_select
on public.prompt_sets for select using (auth.uid() = owner_id or is_public);

create policy if not exists prompt_sets_insert
on public.prompt_sets for insert with check (auth.uid() = owner_id);

create policy if not exists prompt_sets_update
on public.prompt_sets for update using (auth.uid() = owner_id);

create policy if not exists prompt_sets_delete
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

create policy if not exists prompt_slots_select
on public.prompt_slots for select
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and (s.owner_id = auth.uid() or s.is_public)
));

create policy if not exists prompt_slots_insert
on public.prompt_slots for insert
with check (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and s.owner_id = auth.uid()
));

create policy if not exists prompt_slots_update
on public.prompt_slots for update
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_slots.set_id and s.owner_id = auth.uid()
));

create policy if not exists prompt_slots_delete
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

create policy if not exists prompt_bridges_select
on public.prompt_bridges for select
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and (s.owner_id = auth.uid() or s.is_public)
));

create policy if not exists prompt_bridges_insert
on public.prompt_bridges for insert
with check (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and s.owner_id = auth.uid()
));

create policy if not exists prompt_bridges_update
on public.prompt_bridges for update
using (exists (
  select 1 from public.prompt_sets s
  where s.id = prompt_bridges.from_set and s.owner_id = auth.uid()
));

create policy if not exists prompt_bridges_delete
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

create policy if not exists prompt_library_entries_select
on public.prompt_library_entries for select
using (true);

create policy if not exists prompt_library_entries_insert
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

create policy if not exists prompt_library_entries_update
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

create policy if not exists rank_audio_preferences_select_owner
on public.rank_audio_preferences for select
using (auth.uid() = owner_id);

create policy if not exists rank_audio_preferences_insert_owner
on public.rank_audio_preferences for insert to authenticated
with check (auth.uid() = owner_id);

create policy if not exists rank_audio_preferences_update_owner
on public.rank_audio_preferences for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy if not exists rank_audio_preferences_delete_owner
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

create policy if not exists rank_audio_events_select_owner
on public.rank_audio_events for select
using (auth.uid() = owner_id);

create policy if not exists rank_audio_events_insert_owner
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

create policy if not exists rank_audio_monitor_rules_service_only
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

create policy if not exists rank_title_settings_select_public
on public.rank_title_settings for select
using (true);

create policy if not exists rank_title_settings_insert_service_role
on public.rank_title_settings for insert
with check (auth.role() = 'service_role');

create policy if not exists rank_title_settings_update_service_role
on public.rank_title_settings for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy if not exists rank_title_settings_delete_service_role
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

create policy if not exists rank_announcements_select_public
on public.rank_announcements for select
using (true);

create policy if not exists rank_announcements_insert_service_role
on public.rank_announcements for insert
with check (auth.role() = 'service_role');

create policy if not exists rank_announcements_update_service_role
on public.rank_announcements for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy if not exists rank_announcements_delete_service_role
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

create policy if not exists rank_api_key_cooldowns_service_select
on public.rank_api_key_cooldowns for select
using (auth.role() = 'service_role');

create policy if not exists rank_api_key_cooldowns_service_insert
on public.rank_api_key_cooldowns for insert
with check (auth.role() = 'service_role');

create policy if not exists rank_api_key_cooldowns_service_update
on public.rank_api_key_cooldowns for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy if not exists rank_api_key_cooldowns_service_delete
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

create policy if not exists rank_api_key_audit_service_all
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

create policy if not exists rank_user_api_keys_service_all
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

create policy if not exists rank_user_api_keyring_service_all
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

create policy if not exists rank_cooldown_timeline_uploads_service_all
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
  realtime_match boolean not null default false,
  likes_count integer not null default 0,
  play_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rank_games enable row level security;

create policy if not exists rank_games_select_public
on public.rank_games for select using (true);

create policy if not exists rank_games_insert_owner
on public.rank_games for insert with check (auth.uid() = owner_id);

create policy if not exists rank_games_update_owner
on public.rank_games for update using (auth.uid() = owner_id);

create policy if not exists rank_games_delete_owner
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

create policy if not exists rank_game_roles_select
on public.rank_game_roles for select using (true);

create policy if not exists rank_game_roles_mutate
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

create policy if not exists rank_game_tags_select
on public.rank_game_tags for select using (true);

create policy if not exists rank_game_tags_mutate
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

create policy if not exists rank_game_seasons_select
on public.rank_game_seasons for select using (true);

create policy if not exists rank_game_seasons_mutate
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

create policy if not exists rank_game_slots_select
on public.rank_game_slots for select using (true);

create policy if not exists rank_game_slots_mutate
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

create policy if not exists rank_participants_select
on public.rank_participants for select using (true);

create policy if not exists rank_participants_insert
on public.rank_participants for insert
with check (auth.uid() = owner_id);

create policy if not exists rank_participants_update
on public.rank_participants for update using (auth.uid() = owner_id);

create policy if not exists rank_participants_delete
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

create policy if not exists rank_battles_select
on public.rank_battles for select using (true);

create policy if not exists rank_battles_insert
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
  status text not null default 'open',
  slot_count integer not null default 0,
  filled_count integer not null default 0,
  ready_count integer not null default 0,
  host_last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create policy if not exists rank_rooms_select
on public.rank_rooms for select using (true);

create policy if not exists rank_rooms_insert
on public.rank_rooms for insert to authenticated with check (auth.uid() = owner_id);

create policy if not exists rank_rooms_update
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

create policy if not exists rank_room_slots_select
on public.rank_room_slots for select using (true);

create policy if not exists rank_room_slots_insert
on public.rank_room_slots for insert to authenticated
with check (
  exists (
    select 1 from public.rank_rooms
    where public.rank_rooms.id = room_id
      and public.rank_rooms.owner_id = auth.uid()
  )
);

create policy if not exists rank_room_slots_update
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

alter table public.rank_match_queue enable row level security;

create policy if not exists rank_match_queue_select
on public.rank_match_queue for select
using (
  status = 'waiting'
  or owner_id = auth.uid()
);

create policy if not exists rank_match_queue_insert
on public.rank_match_queue for insert to authenticated
with check (auth.uid() = owner_id);

create policy if not exists rank_match_queue_update
on public.rank_match_queue for update to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy if not exists rank_match_queue_delete
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

create policy if not exists rank_matchmaking_logs_service_insert
on public.rank_matchmaking_logs for insert
with check (auth.role() = 'service_role');

create policy if not exists rank_matchmaking_logs_service_select
on public.rank_matchmaking_logs for select
using (auth.role() = 'service_role');

alter table public.rank_battle_logs enable row level security;

create policy if not exists rank_battle_logs_select
on public.rank_battle_logs for select using (true);

create policy if not exists rank_battle_logs_insert
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
  add column if not exists rating_hint integer;

create index if not exists rank_sessions_status_recent_idx
on public.rank_sessions (status, game_id, updated_at desc);

alter table public.rank_sessions enable row level security;

create policy if not exists rank_sessions_select
on public.rank_sessions for select using (auth.uid() = owner_id or owner_id is null);

create policy if not exists rank_sessions_insert
on public.rank_sessions for insert to authenticated with check (auth.uid() = owner_id or owner_id is null);

create policy if not exists rank_sessions_update
on public.rank_sessions for update using (auth.uid() = owner_id or owner_id is null);

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

create policy if not exists rank_turns_select
on public.rank_turns for select using (true);

create policy if not exists rank_turns_insert
on public.rank_turns for insert to authenticated with check (true);

-- =========================================
--  공용 채팅 테이블
-- =========================================
create table if not exists public.messages (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  username text not null,
  avatar_url text,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy if not exists messages_select_public
on public.messages for select using (true);

create policy if not exists messages_insert_auth
on public.messages for insert to authenticated with check (auth.uid() = user_id);

--

-- =========================================
--  Extended chat schema adjustments
-- =========================================

create table if not exists public.messages (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  hero_id uuid references public.heroes(id) on delete set null,
  scope text not null default 'global',
  target_hero_id uuid references public.heroes(id) on delete set null,
  text text not null check (length(text) between 1 and 2000),
  metadata jsonb
);

alter table public.messages
  add column if not exists created_at timestamptz not null default now();

alter table public.messages
  add column if not exists user_id uuid;

alter table public.messages
  add column if not exists owner_id uuid;

alter table public.messages
  add column if not exists username text;

alter table public.messages
  add column if not exists avatar_url text;

alter table public.messages
  add column if not exists hero_id uuid;

alter table public.messages
  add column if not exists scope text;

alter table public.messages
  add column if not exists target_hero_id uuid;

alter table public.messages
  add column if not exists text text;

alter table public.messages
  add column if not exists metadata jsonb;

update public.messages
set user_id = coalesce(user_id, owner_id)
where user_id is null;

update public.messages
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

alter table public.messages
  alter column user_id set not null;

alter table public.messages
  alter column owner_id set not null;

alter table public.messages
  alter column username set not null;

alter table public.messages
  alter column text set not null;

alter table public.messages
  alter column scope set default 'global';

update public.messages
set scope = 'global'
where scope is null;

alter table public.messages
  alter column scope set not null;

alter table public.messages
  alter column created_at set default now();

alter table public.messages
  alter column created_at set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_user_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      drop constraint messages_user_id_fkey;
  end if;
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_owner_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      drop constraint messages_owner_id_fkey;
  end if;
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_hero_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      drop constraint messages_hero_id_fkey;
  end if;
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_target_hero_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      drop constraint messages_target_hero_id_fkey;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_user_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_owner_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_hero_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_hero_id_fkey
      foreign key (hero_id) references public.heroes(id) on delete set null;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_target_hero_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_target_hero_id_fkey
      foreign key (target_hero_id) references public.heroes(id) on delete set null;
  end if;
end $$;

alter table public.messages enable row level security;

create policy if not exists messages_select_public
on public.messages for select
using (true);

create policy if not exists messages_insert_auth
on public.messages for insert to authenticated
with check (
  auth.uid() = user_id
  and owner_id = auth.uid()
);

create index if not exists messages_created_at_desc on public.messages (created_at desc);
create index if not exists messages_scope_created_at on public.messages (scope, created_at desc);
create index if not exists messages_hero_scope_created_at on public.messages (hero_id, scope, created_at desc);
create index if not exists messages_target_scope_created_at on public.messages (target_hero_id, scope, created_at desc);

-- =========================================
--  Social graph schema
-- =========================================
-- =========================================
--  친구 시스템 (요청 & 관계)
-- =========================================
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists friend_requests_addressee_status on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_status on public.friend_requests (requester_id, status);
create unique index if not exists friend_requests_unique_pending
  on public.friend_requests (requester_id, addressee_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

create policy if not exists friend_requests_select_participants
on public.friend_requests for select
using (auth.uid() in (requester_id, addressee_id));

create policy if not exists friend_requests_insert_requester
on public.friend_requests for insert to authenticated
with check (auth.uid() = requester_id);

create policy if not exists friend_requests_update_participants
on public.friend_requests for update to authenticated
using (auth.uid() in (requester_id, addressee_id))
with check (auth.uid() in (requester_id, addressee_id));

create policy if not exists friend_requests_delete_participants
on public.friend_requests for delete to authenticated
using (auth.uid() in (requester_id, addressee_id));

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id_a uuid not null references auth.users(id) on delete cascade,
  user_id_b uuid not null references auth.users(id) on delete cascade,
  since timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.friendships
  add constraint friend_pairs_canonical
  check (user_id_a < user_id_b);

create unique index if not exists friendships_unique_pair
  on public.friendships (user_id_a, user_id_b);

create index if not exists friendships_user_a on public.friendships (user_id_a);
create index if not exists friendships_user_b on public.friendships (user_id_b);

alter table public.friendships enable row level security;

create policy if not exists friendships_select_participants
on public.friendships for select
using (auth.uid() in (user_id_a, user_id_b));

create policy if not exists friendships_insert_participants
on public.friendships for insert to authenticated
with check (auth.uid() in (user_id_a, user_id_b));

create policy if not exists friendships_delete_participants
on public.friendships for delete to authenticated
using (auth.uid() in (user_id_a, user_id_b));

-- =========================================
--  상태 갱신 트리거 (updated_at 자동 갱신)
-- =========================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_updated_at();
