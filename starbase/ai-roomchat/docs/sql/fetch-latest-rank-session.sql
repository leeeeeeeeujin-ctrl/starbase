-- fetches the newest active/preparing/ready session for a given game

create or replace function public.fetch_latest_rank_session(
  p_game_id uuid
)
returns table (
  id uuid,
  status text,
  owner_id uuid,
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
    s.updated_at,
    s.mode
  from public.rank_sessions as s
  where s.game_id = p_game_id
    and s.status in ('active', 'preparing', 'ready')
  order by s.updated_at desc
  limit 1;
end;
$$;

grant execute on function public.fetch_latest_rank_session(uuid) to service_role;
grant execute on function public.fetch_latest_rank_session(uuid) to authenticated;
