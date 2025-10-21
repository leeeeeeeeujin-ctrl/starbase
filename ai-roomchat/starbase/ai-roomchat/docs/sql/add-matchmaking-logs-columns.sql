-- Add missing columns to rank_matchmaking_logs table
-- Date: 2025-10-21
-- Purpose: Support enhanced matchmaking observability with mode, drop_in flag, and metadata

-- Add mode column (text)
alter table public.rank_matchmaking_logs
  add column if not exists mode text;

-- Add drop_in boolean flag
alter table public.rank_matchmaking_logs
  add column if not exists drop_in boolean default false;

-- Add metadata jsonb for flexible event data
alter table public.rank_matchmaking_logs
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Create index on drop_in for filtering
create index if not exists rank_matchmaking_logs_drop_in_idx
  on public.rank_matchmaking_logs (drop_in)
  where drop_in = true;

-- Create GIN index on metadata for efficient JSON queries
create index if not exists rank_matchmaking_logs_metadata_idx
  on public.rank_matchmaking_logs using gin (metadata);

-- Update existing rows to set defaults
update public.rank_matchmaking_logs
  set drop_in = false
  where drop_in is null;

update public.rank_matchmaking_logs
  set metadata = '{}'::jsonb
  where metadata is null;

-- Add comment for documentation
comment on column public.rank_matchmaking_logs.mode is 'Match mode (rank_solo, rank_team, etc.)';
comment on column public.rank_matchmaking_logs.drop_in is 'Whether this log entry is related to drop-in matchmaking';
comment on column public.rank_matchmaking_logs.metadata is 'Flexible JSON data for assignments, diagnostics, and custom event properties';
