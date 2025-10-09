-- Supabase rank game registration RPC
-- Creates register_rank_game so the frontend can submit game metadata,
-- role definitions, and slot templates in a single call. Run this in the
-- Supabase SQL editor (or via `supabase db execute`) to provision the RPC
-- before deploying the revamped registration flow.

create or replace function public.register_rank_game(
  p_owner_id uuid,
  p_game jsonb,
  p_roles jsonb default '[]'::jsonb,
  p_slots jsonb default '[]'::jsonb
)
returns table (
  game_id uuid,
  role_count integer,
  slot_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_role_count integer := 0;
  v_slot_count integer := 0;
  v_roles jsonb := coalesce(p_roles, '[]'::jsonb);
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_now timestamptz := now();
begin
  insert into public.rank_games (
    owner_id,
    name,
    description,
    image_url,
    prompt_set_id,
    realtime_match,
    roles,
    rules,
    rules_prefix,
    created_at,
    updated_at
  ) values (
    p_owner_id,
    nullif(trim(p_game->>'name'), ''),
    nullif(p_game->>'description', ''),
    nullif(p_game->>'image_url', ''),
    nullif(p_game->>'prompt_set_id', '')::uuid,
    nullif(lower(trim(p_game->>'realtime_match')), ''),
    (
      select jsonb_agg(to_jsonb(role_name))
      from (
        select distinct trim(value)::text as role_name
        from jsonb_array_elements_text(coalesce(p_game->'roles', '[]'::jsonb))
        where trim(value) <> ''
      ) as distinct_roles
    ),
    case when jsonb_typeof(p_game->'rules') in ('object', 'array') then p_game->'rules' else null end,
    nullif(p_game->>'rules_prefix', ''),
    v_now,
    v_now
  )
  returning * into v_game;

  if jsonb_array_length(v_roles) > 0 then
    insert into public.rank_game_roles (
      game_id,
      name,
      slot_count,
      active,
      score_delta_min,
      score_delta_max,
      created_at,
      updated_at
    )
    select
      v_game.id,
      coalesce(nullif(trim(r.name), ''), '역할') as name,
      greatest(coalesce(r.slot_count, 0), 0) as slot_count,
      coalesce(r.active, true) as active,
      greatest(coalesce(r.score_delta_min, 0), 0) as score_delta_min,
      greatest(
        coalesce(r.score_delta_max, coalesce(r.score_delta_min, 0)),
        coalesce(r.score_delta_min, 0)
      ) as score_delta_max,
      v_now,
      v_now
    from jsonb_to_recordset(v_roles) as r (
      name text,
      slot_count integer,
      score_delta_min integer,
      score_delta_max integer,
      active boolean
    );

    get diagnostics v_role_count = row_count;
  end if;

  if jsonb_array_length(v_slots) > 0 then
    insert into public.rank_game_slots as s (
      game_id,
      slot_index,
      role,
      active,
      created_at,
      updated_at
    )
    select
      v_game.id,
      coalesce(r.slot_index, row_number() over (order by r.slot_index nulls last)),
      coalesce(nullif(trim(r.role), ''), '역할'),
      coalesce(r.active, true),
      v_now,
      v_now
    from jsonb_to_recordset(v_slots) as r (
      slot_index integer,
      role text,
      active boolean
    )
    where coalesce(trim(r.role), '') <> ''
    on conflict on constraint rank_game_slots_game_id_slot_index_key
    do update set
      role = excluded.role,
      active = excluded.active,
      updated_at = v_now;

    get diagnostics v_slot_count = row_count;
  end if;

  return query
  select v_game.id, v_role_count, v_slot_count;
end;
$$;

grant execute on function public.register_rank_game(
  uuid,
  jsonb,
  jsonb,
  jsonb
) to service_role;
