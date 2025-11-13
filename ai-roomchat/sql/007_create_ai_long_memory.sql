-- Long-term memory storage per user

create table if not exists public.ai_long_memory (
  user_id uuid not null,
  key text not null,
  content text not null,
  used_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists ai_long_memory_user_updated_idx
  on public.ai_long_memory (user_id, updated_at desc);

-- Optional RLS (disabled by default for local/dev). Uncomment to enable.
-- alter table public.ai_long_memory enable row level security;

