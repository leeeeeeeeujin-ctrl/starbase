-- Updates rank room counters via RPC so hosts can synchronise occupancy without
-- issuing direct table updates from the browser.

create or replace function public.update_rank_room_counters(
  p_room_id uuid,
  p_owner_id uuid default null,
  p_slot_count integer default null,
  p_filled_count integer default null,
  p_ready_count integer default null,
  p_status text default null,
  p_host_role_limit integer default null,
  p_updated_at timestamptz default now()
)
returns table (
  id uuid,
  slot_count integer,
  filled_count integer,
  ready_count integer,
  status text,
  host_role_limit integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_status text := null;
  v_host_limit integer := null;
  v_now timestamptz := coalesce(p_updated_at, now());
begin
  if p_room_id is null then
    raise exception 'missing_room_id' using errcode = 'P0001';
  end if;

  select *
    into v_room
    from public.rank_rooms
   where id = p_room_id
   for update;

  if not found then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;

  if p_owner_id is not null
     and v_room.owner_id is not null
     and v_room.owner_id <> p_owner_id then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_status is not null then
    v_status := lower(trim(p_status));
    if v_status not in ('open', 'in_progress', 'brawl', 'battle', 'ready', 'preparing', 'matchmaking') then
      v_status := coalesce(v_room.status, v_status);
    end if;
  end if;

  if p_host_role_limit is null then
    v_host_limit := null;
  elsif p_host_role_limit <= 0 then
    v_host_limit := null;
  else
    v_host_limit := greatest(1, p_host_role_limit);
  end if;

  update public.rank_rooms
     set slot_count = coalesce(p_slot_count, slot_count),
         filled_count = coalesce(p_filled_count, filled_count),
         ready_count = coalesce(p_ready_count, ready_count),
         status = coalesce(v_status, status),
         host_role_limit = v_host_limit,
         updated_at = v_now
   where id = p_room_id
   returning * into v_room;

  return query
  select
    v_room.id,
    v_room.slot_count,
    v_room.filled_count,
    v_room.ready_count,
    v_room.status,
    v_room.host_role_limit,
    v_room.updated_at;
end;
$$;

grant execute on function public.update_rank_room_counters(
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text,
  integer,
  timestamptz
) to service_role;

grant execute on function public.update_rank_room_counters(
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text,
  integer,
  timestamptz
) to authenticated;
