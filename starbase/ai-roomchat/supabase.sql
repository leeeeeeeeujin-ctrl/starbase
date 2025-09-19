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
