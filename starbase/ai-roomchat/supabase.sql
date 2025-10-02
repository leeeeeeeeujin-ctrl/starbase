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

alter table public.rank_audio_events enable row level security;

create policy if not exists rank_audio_events_select_owner
on public.rank_audio_events for select
using (auth.uid() = owner_id);

create policy if not exists rank_audio_events_insert_owner
on public.rank_audio_events for insert to authenticated
with check (auth.uid() = owner_id);

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
