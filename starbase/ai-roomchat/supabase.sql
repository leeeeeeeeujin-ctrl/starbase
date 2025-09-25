
create extension if not exists "pgcrypto";

-- heroes table + RLS + storage policies

create table if not exists public.heroes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null,
  ability1 text not null,
  ability2 text not null,
  ability3 text not null,
  ability4 text not null,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.heroes enable row level security;

create policy if not exists heroes_insert
on public.heroes for insert to authenticated
with check (auth.uid() = owner_id);

create policy if not exists heroes_select
on public.heroes for select to authenticated
using (auth.uid() = owner_id);

-- 공개 열람 원하면 위 정책 삭제 후 아래 사용
-- create policy if not exists heroes_select_public on public.heroes
-- for select using (true);

-- storage policies for bucket 'heroes'
create policy if not exists storage_heroes_read
on storage.objects for select
using (bucket_id = 'heroes');

create policy if not exists storage_heroes_write
on storage.objects for insert to authenticated
with check (bucket_id = 'heroes');

create policy if not exists storage_heroes_update
on storage.objects for update to authenticated
using (bucket_id = 'heroes')
with check (bucket_id = 'heroes');

-- ranking core tables

create table if not exists public.rank_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  image_url text,
  prompt_set_id uuid,
  realtime_match boolean not null default false,
  rules jsonb,
  rules_prefix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rank_game_roles (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  name text not null,
  slot_count integer not null default 1 check (slot_count > 0),
  active boolean not null default true,
  score_delta_min integer not null default 20,
  score_delta_max integer not null default 40,
  created_at timestamptz not null default now()
);

create index if not exists rank_game_roles_game_id_idx on public.rank_game_roles (game_id, active);

create table if not exists public.rank_game_slots (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  slot_index integer not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rank_game_slots_unique_idx on public.rank_game_slots (game_id, slot_index);

create table if not exists public.rank_participants (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  hero_ids uuid[] default array[]::uuid[],
  role text,
  rating integer not null default 1000,
  score integer not null default 1000,
  battles integer not null default 0,
  win_rate numeric,
  status text not null default 'alive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rank_participants_owner_unique on public.rank_participants (game_id, owner_id);
create index if not exists rank_participants_game_idx on public.rank_participants (game_id, rating desc);

create table if not exists public.rank_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.rank_games(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  turn integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rank_turns (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  idx integer not null,
  role text not null,
  public boolean not null default true,
  content text,
  created_at timestamptz not null default now()
);

create index if not exists rank_turns_session_idx on public.rank_turns (session_id, idx);

create table if not exists public.rank_battles (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.rank_games(id) on delete cascade,
  attacker_owner_id uuid references auth.users(id) on delete set null,
  attacker_hero_ids uuid[] default array[]::uuid[],
  defender_owner_id uuid references auth.users(id) on delete set null,
  defender_hero_ids uuid[] default array[]::uuid[],
  result text not null,
  score_delta integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists rank_battles_game_idx on public.rank_battles (game_id, created_at desc);

create table if not exists public.rank_battle_logs (
  id bigint generated always as identity primary key,
  battle_id bigint not null references public.rank_battles(id) on delete cascade,
  game_id uuid references public.rank_games(id) on delete set null,
  turn_no integer not null default 0,
  prompt text,
  ai_response text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rank_battle_logs_battle_idx on public.rank_battle_logs (battle_id, turn_no);
create index if not exists rank_battle_logs_game_idx on public.rank_battle_logs (game_id, created_at desc);

create view if not exists public.rank_players as
select * from public.rank_participants;

create view if not exists public.rank_session_players as
select * from public.rank_participants;

create view if not exists public.rank_session_turns as
select * from public.rank_turns;

create view if not exists public.rank_session_logs as
select * from public.rank_battle_logs;

create view if not exists public.session_logs as
select * from public.rank_battle_logs;
