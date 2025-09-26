-- public chat: messages table + RLS

create table if not exists public.messages (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete set null,
  target_hero_id uuid references public.heroes(id) on delete set null,
  scope text not null default 'global' check (scope in ('global', 'whisper', 'blocked')),
  username text not null,
  avatar_url text,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.messages
  add column if not exists hero_id uuid references public.heroes(id) on delete set null;

alter table public.messages
  add column if not exists target_hero_id uuid references public.heroes(id) on delete set null;

alter table public.messages
  add column if not exists scope text;

update public.messages
set scope = 'global'
where scope is null;

alter table public.messages
  alter column scope set default 'global';

alter table public.messages
  alter column scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_scope_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_scope_check
      check (scope in ('global', 'whisper', 'blocked'));
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
  and (owner_id is null or owner_id = auth.uid())
);

create index if not exists messages_created_at_desc on public.messages (created_at desc);
create index if not exists messages_scope_created_at on public.messages (scope, created_at desc);
create index if not exists messages_hero_scope_created_at on public.messages (hero_id, scope, created_at desc);
create index if not exists messages_target_scope_created_at on public.messages (target_hero_id, scope, created_at desc);
