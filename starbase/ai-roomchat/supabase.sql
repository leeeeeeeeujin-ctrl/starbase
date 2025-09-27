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

create table if not exists public.hero_bgms (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  label text not null default '기본',
  url text,
  storage_path text,
  duration_seconds integer,
  mime text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hero_bgms enable row level security;

create policy if not exists hero_bgms_select
on public.hero_bgms for select using (
  exists (
    select 1 from public.heroes h
    where h.id = hero_bgms.hero_id and h.owner_id = auth.uid()
  )
);

create policy if not exists hero_bgms_insert
on public.hero_bgms for insert with check (
  exists (
    select 1 from public.heroes h
    where h.id = hero_bgms.hero_id and h.owner_id = auth.uid()
  )
);

create policy if not exists hero_bgms_update
on public.hero_bgms for update using (
  exists (
    select 1 from public.heroes h
    where h.id = hero_bgms.hero_id and h.owner_id = auth.uid()
  )
);

create policy if not exists hero_bgms_delete
on public.hero_bgms for delete using (
  exists (
    select 1 from public.heroes h
    where h.id = hero_bgms.hero_id and h.owner_id = auth.uid()
  )
);

create index if not exists hero_bgms_hero_id_sort_idx
on public.hero_bgms (hero_id, sort_order, created_at);

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
