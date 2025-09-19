-- public chat: messages table + RLS

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
on public.messages for select
using (true);

create policy if not exists messages_insert_auth
on public.messages for insert to authenticated
with check (auth.uid() = user_id);

create index if not exists messages_created_at_desc on public.messages (created_at desc);
