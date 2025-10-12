-- sync_rank_match_roster RPC
-- Paste into Supabase SQL editor to provision optimistic slot-version updates
-- for the rank_match_roster staging workflow.

alter table public.rank_match_roster
  add column if not exists slot_template_version bigint default 0,
  add column if not exists slot_template_source text default 'room-stage',
  add column if not exists slot_template_updated_at timestamptz default now();

update public.rank_match_roster
  set
    slot_template_version = coalesce(slot_template_version, 0),
    slot_template_source = coalesce(nullif(slot_template_source, ''), 'room-stage'),
    slot_template_updated_at = coalesce(slot_template_updated_at, updated_at, now())
where slot_template_version is null
   or slot_template_source is null
   or slot_template_source = ''
   or slot_template_updated_at is null;

alter table public.rank_match_roster
  alter column slot_template_version set default 0,
  alter column slot_template_source set default 'room-stage',
  alter column slot_template_updated_at set default now();

-- Drop legacy signatures first so the redeploy is idempotent. Older installs
-- placed the JSONB payload last, so we clear that version as well as the new
-- preferred signature before recreating the function.
drop function if exists public.sync_rank_match_roster(
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  timestamptz,
  jsonb
);

drop function if exists public.sync_rank_match_roster(
  uuid,
  uuid,
  uuid,
  jsonb,
  bigint,
  text,
  timestamptz
);

create or replace function public.sync_rank_match_roster(
  p_room_id uuid,
  p_game_id uuid,
  p_match_instance_id uuid,
  p_roster jsonb,
  p_slot_template_version bigint default null,
  p_slot_template_source text default null,
  p_slot_template_updated_at timestamptz default null
)
returns table (
  inserted_count integer,
  slot_template_version bigint,
  slot_template_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_version bigint := coalesce(p_slot_template_version, (extract(epoch from v_now) * 1000)::bigint);
  v_updated_at timestamptz := coalesce(p_slot_template_updated_at, v_now);
  v_current_version bigint;
begin
  if p_room_id is null or p_game_id is null or p_match_instance_id is null then
    raise exception 'missing_identifiers';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'empty_roster';
  end if;

  select max(slot_template_version)
  into v_current_version
  from public.rank_match_roster
  where room_id = p_room_id;

  if v_current_version is not null and v_version < v_current_version then
    raise exception 'slot_version_conflict';
  end if;

  delete from public.rank_match_roster
  where room_id = p_room_id;

  return query
  with payload as (
    select
      (entry->>'slot_id')::uuid as slot_id,
      coalesce((entry->>'slot_index')::integer, (ord::int - 1)) as slot_index,
      coalesce(nullif(entry->>'role', ''), '역할 미지정') as role,
      (entry->>'owner_id')::uuid as owner_id,
      (entry->>'hero_id')::uuid as hero_id,
      nullif(entry->>'hero_name', '') as hero_name,
      coalesce(entry->'hero_summary', '{}'::jsonb) as hero_summary,
      coalesce((entry->>'ready')::boolean, false) as ready,
      (entry->>'joined_at')::timestamptz as joined_at,
      (entry->>'score')::integer as score,
      (entry->>'rating')::integer as rating,
      (entry->>'battles')::integer as battles,
      (entry->>'win_rate')::numeric as win_rate,
      nullif(entry->>'status', '') as status,
      coalesce((entry->>'standin')::boolean, false) as standin,
      nullif(entry->>'match_source', '') as match_source
    from jsonb_array_elements(p_roster) with ordinality as entries(entry, ord)
  ), inserted as (
    insert into public.rank_match_roster (
      match_instance_id,
      room_id,
      game_id,
      slot_id,
      slot_index,
      role,
      owner_id,
      hero_id,
      hero_name,
      hero_summary,
      ready,
      joined_at,
      score,
      rating,
      battles,
      win_rate,
      status,
      standin,
      match_source,
      slot_template_version,
      slot_template_source,
      slot_template_updated_at,
      created_at,
      updated_at
    )
    select
      p_match_instance_id,
      p_room_id,
      p_game_id,
      payload.slot_id,
      payload.slot_index,
      payload.role,
      payload.owner_id,
      payload.hero_id,
      payload.hero_name,
      payload.hero_summary,
      payload.ready,
      payload.joined_at,
      payload.score,
      payload.rating,
      payload.battles,
      payload.win_rate,
      payload.status,
      payload.standin,
      payload.match_source,
      v_version,
      coalesce(nullif(p_slot_template_source, ''), 'room-stage'),
      v_updated_at,
      v_now,
      v_now
    from payload
    order by payload.slot_index
    returning 1
  )
  select
    (select count(*) from inserted) as inserted_count,
    v_version as slot_template_version,
    v_updated_at as slot_template_updated_at;
end;
$$;

grant execute on function public.sync_rank_match_roster(
  uuid,
  uuid,
  uuid,
  jsonb,
  bigint,
  text,
  timestamptz
) to service_role;
