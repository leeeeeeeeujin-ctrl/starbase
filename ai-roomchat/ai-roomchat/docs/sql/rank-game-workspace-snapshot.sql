-- Rank game ↔ workspace snapshot storage
-- --------------------------------------
-- 이 스크립트는 랭크 게임이 참조하는 워크스페이스 런타임 스냅샷을
-- Supabase DB에 저장하기 위한 테이블과 헬퍼 RPC를 정의합니다.
--
-- 개념:
-- - 한 개의 rank_games.row 는 한 개의 "기준 워크스페이스" 스냅샷을 가진다고 가정합니다.
-- - 스냅샷에는 최소한 네 가지 파일의 내용이 포함됩니다:
--     /template.json
--     /graph/prompt-graph.json
--     /game/runtime.config.json
--     /game/hooks/automation.js
-- - 프론트엔드에서는 register_rank_game 호출 이후 별도의 API를 통해
--   save_rank_game_workspace(p_game_id, p_workspace) 를 호출하여 스냅샷을 저장합니다.

create table if not exists public.rank_game_workspaces (
  game_id uuid primary key references public.rank_games(id) on delete cascade,
  template jsonb,
  graph jsonb,
  runtime_config jsonb,
  hooks_source text,
  ui_shell jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger set_timestamp_rank_game_workspaces
before update on public.rank_game_workspaces
for each row
execute procedure public.set_current_timestamp_updated_at();

comment on table public.rank_game_workspaces is
  '워크스페이스 기반 게임의 런타임 스냅샷 (template/graph/runtime.config/hooks)를 game_id 별로 저장';

comment on column public.rank_game_workspaces.template is
  'workspace /template.json 내용 (jsonb)';

comment on column public.rank_game_workspaces.graph is
  'workspace /graph/prompt-graph.json 내용 (jsonb)';

comment on column public.rank_game_workspaces.runtime_config is
  'workspace /game/runtime.config.json 내용 (jsonb)';

comment on column public.rank_game_workspaces.hooks_source is
  'workspace /game/hooks/automation.js 원본 소스 (text)';

comment on column public.rank_game_workspaces.ui_shell is
  'workspace /game/ui.shell.json 내용 (jsonb, 선택적)';

-- Upsert helper: save_rank_game_workspace
-- ---------------------------------------
-- p_workspace 예시:
-- {
--   "template": { ... },                -- /template.json 파싱 결과
--   "graph": { "nodes": [...], ... },   -- /graph/prompt-graph.json
--   "runtime_config": { ... },          -- /game/runtime.config.json
--   "hooks_source": "export function ..."  -- /game/hooks/automation.js
-- }

create or replace function public.save_rank_game_workspace(
  p_game_id uuid,
  p_workspace jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template jsonb;
  v_graph jsonb;
  v_runtime_config jsonb;
  v_hooks_source text;
  v_ui_shell jsonb;
begin
  if p_game_id is null then
    raise exception 'p_game_id is required';
  end if;

  if p_workspace is null then
    raise exception 'p_workspace is required';
  end if;

  if not exists (select 1 from public.rank_games where id = p_game_id) then
    raise exception 'rank_games row not found for id=%', p_game_id;
  end if;

  v_template := p_workspace->'template';
  v_graph := p_workspace->'graph';
  v_runtime_config := p_workspace->'runtime_config';
  v_hooks_source := (p_workspace->>'hooks_source');
  v_ui_shell := p_workspace->'ui_shell';

  insert into public.rank_game_workspaces (
    game_id,
    template,
    graph,
    runtime_config,
    hooks_source,
    ui_shell
  )
  values (
    p_game_id,
    v_template,
    v_graph,
    v_runtime_config,
    v_hooks_source,
    v_ui_shell
  )
  on conflict (game_id) do update
    set template       = excluded.template,
        graph          = excluded.graph,
        runtime_config = excluded.runtime_config,
        hooks_source   = excluded.hooks_source,
        ui_shell       = excluded.ui_shell,
        updated_at     = now();
end;
$$;

grant execute on function public.save_rank_game_workspace(uuid, jsonb) to service_role;
