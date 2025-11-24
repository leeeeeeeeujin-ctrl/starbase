-- Create rank_game_workspaces and save_rank_game_workspace RPC
-- Run this script in Supabase SQL editor or via `supabase db execute` in your dev project.

create table if not exists public.rank_game_workspaces (
  game_id uuid primary key references public.rank_games(id) on delete cascade,
  template jsonb,
  graph jsonb,
  runtime_config jsonb,
  hooks_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert RPC to save a workspace snapshot for a rank game
create or replace function public.save_rank_game_workspace(
  p_game_id uuid,
  p_workspace jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rank_game_workspaces (
    game_id, template, graph, runtime_config, hooks_source, created_at, updated_at
  ) values (
    p_game_id,
    (p_workspace -> 'template'),
    (p_workspace -> 'graph'),
    (p_workspace -> 'runtime_config'),
    (p_workspace ->> 'hooks_source'),
    now(), now()
  )
  on conflict (game_id) do update set
    template = coalesce(excluded.template, public.rank_game_workspaces.template),
    graph = coalesce(excluded.graph, public.rank_game_workspaces.graph),
    runtime_config = coalesce(excluded.runtime_config, public.rank_game_workspaces.runtime_config),
    hooks_source = coalesce(excluded.hooks_source, public.rank_game_workspaces.hooks_source),
    updated_at = now();
end;
$$;

-- Grant execute to the service role so backend services can call this RPC
grant execute on function public.save_rank_game_workspace(uuid, jsonb) to service_role;

-- Verification queries (run these after executing the script):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'rank_game_workspaces'
-- order by ordinal_position;

-- select
--   n.nspname as schema,
--   p.proname as name,
--   pg_get_function_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on p.pronamespace = n.oid
-- where n.nspname = 'public'
--   and p.proname = 'save_rank_game_workspace';
