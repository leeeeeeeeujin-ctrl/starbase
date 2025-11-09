-- Supabase helper to compute async lobby fill snapshot
-- Computes the host role seat cap, pending vacancies, and candidate queue
-- for a room and stores it inside rank_session_meta.async_fill_snapshot.
--
-- Usage: paste into the Supabase SQL editor (run as service role) to install
-- `refresh_match_session_async_fill`. The function will:
--   * read the current room slots and determine the host role seats/limit
--   * gather waiting candidates from rank_match_queue (excluding seated owners)
--   * persist the generated snapshot into rank_session_meta and return the row
--
-- Parameters:
--   p_session_id        - rank_sessions.id to update
--   p_room_id           - rank_rooms.id used to inspect current seating
--   p_host_role_limit   - optional override for the host role cap (defaults to room.host_role_limit or 3)
--   p_max_queue         - optional minimum number of candidates to return (defaults to 3)
--
-- Returns the updated rank_session_meta row so callers receive the latest
-- selected_time_limit_seconds/time_vote/turn_state alongside async_fill_snapshot.

create or replace function public.refresh_match_session_async_fill(
  p_session_id uuid,
  p_room_id uuid,
  p_host_role_limit integer default null,
  p_max_queue integer default 3
)
returns table (
  session_id uuid,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  drop_in_bonus_seconds integer,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  realtime_mode text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_now timestamptz := now();
  v_epoch_ms bigint := floor(extract(epoch from v_now) * 1000);
  v_mode text;
  v_host_role text;
  v_host_role_key text;
  v_total integer := 0;
  v_allowed integer := 0;
  v_pending_count integer := 0;
  v_queue_limit integer := 0;
  v_assigned jsonb := '[]'::jsonb;
  v_overflow jsonb := '[]'::jsonb;
  v_seat_indexes jsonb := '[]'::jsonb;
  v_pending_indexes jsonb := '[]'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_pool_size integer := 0;
  v_assigned_owner_ids text[] := array[]::text[];
  v_snapshot jsonb := null;
  v_meta record;
begin
  select
    r.id,
    r.game_id,
    r.owner_id,
    coalesce(nullif(lower(trim(r.realtime_mode)), ''), 'off') as realtime_mode,
    coalesce(p_host_role_limit, r.host_role_limit) as host_role_limit
  into v_room
  from public.rank_rooms r
  where r.id = p_room_id
  limit 1;

  if v_room.id is null then
    raise exception 'rank_room_not_found';
  end if;

  v_mode := coalesce(v_room.realtime_mode, 'off');

  if v_mode <> 'off' then
    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', null,
      'seatLimit', jsonb_build_object('allowed', 0, 'total', 0),
      'seatIndexes', '[]'::jsonb,
      'pendingSeatIndexes', '[]'::jsonb,
      'assigned', '[]'::jsonb,
      'overflow', '[]'::jsonb,
      'fillQueue', '[]'::jsonb,
      'poolSize', 0,
      'generatedAt', v_epoch_ms
    );
  else
    select
      coalesce(trim(s.role), '')
    into v_host_role
    from public.rank_room_slots s
    where s.room_id = p_room_id
      and s.occupant_owner_id = v_room.owner_id
    order by s.slot_index
    limit 1;

    if v_host_role is null or v_host_role = '' then
      select coalesce(trim(s.role), '')
      into v_host_role
      from public.rank_room_slots s
      where s.room_id = p_room_id
      order by s.slot_index
      limit 1;
    end if;

    if v_host_role is null or v_host_role = '' then
      v_host_role := '역할 미지정';
    end if;

    v_host_role_key := lower(trim(v_host_role));

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position,
        count(*) over (partition by lower(trim(coalesce(s.role, '')))) as role_total
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select coalesce(max(role_total), 0)
    into v_total
    from host
    where role_key = v_host_role_key;

    if v_total is null then
      v_total := 0;
    end if;

    v_allowed := coalesce(v_room.host_role_limit, p_host_role_limit, 3);
    if v_allowed is null then
      v_allowed := 3;
    end if;
    if v_allowed < 1 then
      v_allowed := 1;
    end if;
    if v_total > 0 and v_allowed > v_total then
      v_allowed := v_total;
    end if;
    if v_total = 0 then
      v_allowed := 0;
    end if;

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position > v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null), '[]'::jsonb),
      coalesce(array_agg(distinct case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is not null then occupant_owner_id::text end), array[]::text[]),
      coalesce(sum(case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null then 1 else 0 end), 0)
    into
      v_assigned,
      v_overflow,
      v_seat_indexes,
      v_pending_indexes,
      v_assigned_owner_ids,
      v_pending_count
    from host;

    if v_assigned_owner_ids is null then
      v_assigned_owner_ids := array[]::text[];
    end if;

    if v_pending_count is null then
      v_pending_count := 0;
    end if;

    v_queue_limit := greatest(v_pending_count, coalesce(p_max_queue, 3));
    if v_queue_limit < 0 then
      v_queue_limit := 0;
    end if;

    select count(*)
    into v_pool_size
    from public.rank_match_queue q
    where q.game_id = v_room.game_id
      and lower(trim(coalesce(q.role, ''))) = v_host_role_key
      and q.status = 'waiting'
      and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
      and (q.owner_id is distinct from v_room.owner_id);

    with queued as (
      select
        q.owner_id,
        q.hero_id,
        h.name as hero_name,
        q.joined_at,
        q.score,
        p.rating,
        p.win_rate,
        p.battles,
        q.status,
        row_number() over (order by q.joined_at) as rn
      from public.rank_match_queue q
      left join public.rank_participants p
        on p.game_id = q.game_id
       and p.owner_id = q.owner_id
      left join public.heroes h
        on h.id = coalesce(q.hero_id, p.hero_id)
      where q.game_id = v_room.game_id
        and lower(trim(coalesce(q.role, ''))) = v_host_role_key
        and q.status = 'waiting'
        and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
        and (q.owner_id is distinct from v_room.owner_id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ownerId', case when owner_id is null then null else owner_id::text end,
      'heroId', case when hero_id is null then null else hero_id::text end,
      'heroName', hero_name,
      'role', v_host_role,
      'score', score,
      'rating', rating,
      'winRate', win_rate,
      'battles', battles,
      'status', status,
      'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
    ) order by rn) filter (where rn <= v_queue_limit), '[]'::jsonb)
    into v_queue
    from queued;

    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', v_host_role,
      'seatLimit', jsonb_build_object('allowed', v_allowed, 'total', v_total),
      'seatIndexes', v_seat_indexes,
      'pendingSeatIndexes', v_pending_indexes,
      'assigned', v_assigned,
      'overflow', v_overflow,
      'fillQueue', v_queue,
      'poolSize', v_pool_size,
      'generatedAt', v_epoch_ms
    );
  end if;

  insert into public.rank_session_meta as m (
    session_id,
    async_fill_snapshot,
    updated_at
  ) values (
    p_session_id,
    v_snapshot,
    v_now
  )
  on conflict (session_id)
  do update set
    async_fill_snapshot = excluded.async_fill_snapshot,
    updated_at = excluded.updated_at
  returning m.*
  into v_meta;

  return query select
    v_meta.session_id,
    v_meta.selected_time_limit_seconds,
    v_meta.time_vote,
    v_meta.drop_in_bonus_seconds,
    v_meta.turn_state,
    v_meta.async_fill_snapshot,
    v_meta.realtime_mode,
    v_meta.updated_at;
end;
$$;

grant execute on function public.refresh_match_session_async_fill(
  uuid,
  uuid,
  integer,
  integer
) to service_role;
