-- fetches the newest active/preparing/ready session for a given game
-- renamed with _v2 suffix to avoid PostgREST overload ambiguity when legacy
-- single-argument versions remain deployed.

create or replace function public.fetch_latest_rank_session_v2(
  p_game_id uuid,
  p_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_row record;
begin
  -- Opportunistic cleanup: on every latest-session fetch, also mark
  -- long-idle rank_sessions as aborted so they no longer interfere
  -- with matchmaking / session adoption.
  --
  -- 60분 이상 갱신되지 않은 active/preparing/ready 세션은
  -- stuck 세션으로 간주하고 정리한다.
  perform public.cleanup_expired_rank_sessions(60, 500);

  select
    s.id,
    s.status,
    s.owner_id,
    s.created_at,
    s.updated_at,
    s.mode as match_mode
  into v_row
  from public.rank_sessions as s
  where s.game_id = p_game_id
    and (p_owner_id is null or s.owner_id = p_owner_id)
    and s.status in ('active', 'preparing', 'ready')
  order by s.updated_at desc, s.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'owner_id', v_row.owner_id,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'match_mode', v_row.match_mode
  );
end;
$$;

grant execute on function public.fetch_latest_rank_session_v2(uuid, uuid) to service_role;
grant execute on function public.fetch_latest_rank_session_v2(uuid, uuid) to authenticated;

-- optional: drop the legacy overloaded helper once all clients migrate.
-- drop function if exists public.fetch_latest_rank_session(uuid, uuid);
