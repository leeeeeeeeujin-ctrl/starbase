-- fetch_rank_match_ready_snapshot RPC
-- Aggregates roster, room, session, and readiness metadata for the match-ready flow.
-- Execute this script in the Supabase SQL editor to provision the RPC.

create or replace function public.fetch_rank_match_ready_snapshot(
  p_game_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with roster_source as (
  select
    r.*,
    coalesce(r.slot_template_updated_at, r.updated_at, r.created_at) as version_ts
  from public.rank_match_roster r
  where r.game_id = p_game_id
),
max_version as (
  select max(slot_template_version) as value from roster_source
),
version_filtered as (
  select *
  from roster_source
  where (
    select value from max_version
  ) is null
     or slot_template_version = (select value from max_version)
),
room_ranked as (
  select
    r.*,
    max(coalesce(r.slot_template_updated_at, r.updated_at, r.created_at))
      over (partition by r.room_id) as room_latest_ts
  from version_filtered r
),
target_room as (
  select room_id
  from room_ranked
  where room_id is not null
  order by room_latest_ts desc nulls last
  limit 1
),
chosen_roster as (
  select *
  from room_ranked
  where (select room_id from target_room) is null
     or room_id = (select room_id from target_room)
),
room_payload as (
  select to_jsonb(r.*) as data
  from public.rank_rooms r
  where r.id = (select room_id from target_room)
  limit 1
),
fallback_room as (
  select to_jsonb(r.*) as data
  from public.rank_rooms r
  where r.game_id = p_game_id
  order by r.updated_at desc
  limit 1
),
resolved_room as (
  select coalesce(
    (select data from room_payload),
    (select data from fallback_room)
  ) as data
),
session_payload as (
  select to_jsonb(s.*) as data
  from public.rank_sessions s
  where s.game_id = p_game_id
    and s.status in ('active', 'preparing', 'ready')
  order by s.updated_at desc, s.created_at desc
  limit 1
),
resolved_session as (
  select data, (data->>'id')::uuid as id
  from session_payload
),
session_meta_payload as (
  select to_jsonb(m.*) as data
  from public.rank_session_meta m
  where m.session_id = (select id from resolved_session)
  limit 1
),
ready_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'owner_id', s.owner_id,
        'participant_id', s.participant_id,
        'match_instance_id', s.match_instance_id,
        'pressed_at', s.pressed_at,
        'expires_at', s.expires_at
      )
      order by s.pressed_at
    ),
    '[]'::jsonb
  ) as data
  from public.rank_session_ready_signals s
  where s.session_id = (select id from resolved_session)
)
select jsonb_build_object(
  'roster', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'match_instance_id', r.match_instance_id,
          'room_id', r.room_id,
          'game_id', r.game_id,
          'slot_id', r.slot_id,
          'slot_index', r.slot_index,
          'role', r.role,
          'owner_id', r.owner_id,
          'hero_id', r.hero_id,
          'hero_name', r.hero_name,
          'hero_summary', r.hero_summary,
          'ready', r.ready,
          'joined_at', r.joined_at,
          'score', r.score,
          'rating', r.rating,
          'battles', r.battles,
          'win_rate', r.win_rate,
          'status', r.status,
          'standin', r.standin,
          'match_source', r.match_source,
          'slot_template_version', r.slot_template_version,
          'slot_template_source', r.slot_template_source,
          'slot_template_updated_at', r.slot_template_updated_at,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        )
        order by r.slot_index, coalesce(r.updated_at, r.created_at) desc, r.id
      )
      from chosen_roster r
    ),
    '[]'::jsonb
  ),
  'slot_template_version', (select max(slot_template_version) from chosen_roster),
  'slot_template_source', (select max(slot_template_source) from chosen_roster),
  'slot_template_updated_at', (
    select max(coalesce(slot_template_updated_at, updated_at, created_at))
    from chosen_roster
  ),
  'room', (select data from resolved_room),
  'session', (select data from resolved_session),
  'session_meta', (select data from session_meta_payload),
  'ready_signals', (select data from ready_payload)
);
$$;

grant execute on function public.fetch_rank_match_ready_snapshot(uuid) to service_role;
grant execute on function public.fetch_rank_match_ready_snapshot(uuid) to authenticated;
