-- GitHub integration tables (optional)

create table if not exists public.gh_linked_sets (
  user_id uuid not null,
  set_id uuid not null,
  repo text not null,
  branch text not null default 'main',
  created_at timestamptz not null default now(),
  primary key (user_id, set_id, repo)
);

create index if not exists gh_linked_sets_user_created_idx
  on public.gh_linked_sets (user_id, created_at desc);

create table if not exists public.gh_inbox_snapshots (
  id bigserial primary key,
  user_id uuid,
  repo text not null,
  ref text,
  kind text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists gh_inbox_user_created_idx
  on public.gh_inbox_snapshots (user_id, created_at desc);
