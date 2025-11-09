-- Workspace sets persistent storage
-- Stores per-set virtual filesystem (files list), optional metadata, and an application-managed ETag for optimistic concurrency.

create table if not exists public.workspace_sets (
  id text primary key,
  files jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  etag text not null,
  updated_at timestamptz not null default now()
);

-- Update trigger to maintain updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_sets_updated_at on public.workspace_sets;
create trigger trg_workspace_sets_updated_at
before update on public.workspace_sets
for each row execute function public.set_updated_at();

-- Read policies can be added as needed; for local dev we keep RLS off for this table.
-- Uncomment to enable RLS and add explicit policies later.
-- alter table public.workspace_sets enable row level security;

