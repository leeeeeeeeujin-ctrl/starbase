-- fetches the newest active/preparing/ready session for a given game

create or replace function public.fetch_latest_rank_session(
  p_game_id uuid,
  p_owner_id uuid default null
)
returns table (
  id uuid,
  status text,
  owner_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  mode text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
  select
    s.id,
    s.status,
    s.owner_id,
    s.created_at,
    s.updated_at,
    s.mode
  from public.rank_sessions as s
  where s.game_id = p_game_id
    and (p_owner_id is null or s.owner_id = p_owner_id)
    and s.status in ('active', 'preparing', 'ready')
  order by s.updated_at desc, s.created_at desc
  limit 1;
end;
$$;

grant execute on function public.fetch_latest_rank_session(uuid, uuid) to service_role;
grant execute on function public.fetch_latest_rank_session(uuid, uuid) to authenticated;
