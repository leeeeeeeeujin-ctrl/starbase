-- Supabase rank roles & slots verification RPC
-- Ensures role definitions and slot templates remain consistent before
-- persisting registration or staging payloads. Execute this snippet in the
-- Supabase SQL editor so `verify_rank_roles_and_slots` is available to the
-- registration and match staging APIs.

create or replace function public.verify_rank_roles_and_slots(
  p_roles jsonb default '[]'::jsonb,
  p_slots jsonb default '[]'::jsonb
)
returns table (
  role_name text,
  declared_slot_count integer,
  active_slot_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles jsonb := coalesce(p_roles, '[]'::jsonb);
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_role_names text[] := array[]::text[];
  v_slot_indices integer[] := array[]::integer[];
  v_slot_counts jsonb := '{}'::jsonb;
  v_active_slots integer := 0;
  v_role record;
  v_slot record;
  v_slot_role record;
  v_active_for_role integer;
begin
  if jsonb_typeof(v_slots) is distinct from 'array' then
    raise exception 'invalid_slots' using detail = 'slots_must_be_array';
  end if;

  for v_slot in
    select
      coalesce(nullif(value->>'slot_index', '')::integer, ordinality - 1) as slot_index,
      coalesce(nullif(trim(value->>'role'), ''), '') as role,
      coalesce((value->>'active')::boolean, true) as active
    from jsonb_array_elements(v_slots) with ordinality as slot(value, ordinality)
  loop
    if v_slot.slot_index < 0 then
      raise exception 'invalid_slots' using detail = 'slot_index_negative';
    end if;

    if v_slot.slot_index = any(v_slot_indices) then
      raise exception 'invalid_slots' using detail = 'duplicate_slot_index';
    end if;

    v_slot_indices := array_append(v_slot_indices, v_slot.slot_index);

    if v_slot.active then
      if v_slot.role = '' then
        raise exception 'invalid_slots' using detail = 'active_slot_missing_role';
      end if;

      v_active_slots := v_active_slots + 1;
      v_slot_counts :=
        v_slot_counts || jsonb_build_object(
          v_slot.role,
          coalesce((v_slot_counts ->> v_slot.role)::integer, 0) + 1
        );
    end if;
  end loop;

  if v_active_slots = 0 then
    raise exception 'invalid_slots' using detail = 'no_active_slots';
  end if;

  if jsonb_typeof(v_roles) is distinct from 'array' then
    raise exception 'invalid_roles' using detail = 'roles_must_be_array';
  end if;

  if jsonb_array_length(v_roles) = 0 then
    raise exception 'invalid_roles' using detail = 'no_roles_defined';
  end if;

  for v_role in
    select
      coalesce(nullif(trim(r.name), ''), '') as role_name,
      greatest(coalesce(r.slot_count, 0), 0) as declared_slot_count
    from jsonb_to_recordset(v_roles) as r(
      name text,
      slot_count integer,
      score_delta_min integer,
      score_delta_max integer,
      active boolean
    )
  loop
    if v_role.role_name = '' then
      raise exception 'invalid_roles' using detail = 'role_name_required';
    end if;

    if v_role.role_name = any(v_role_names) then
      raise exception 'invalid_roles' using detail = 'duplicate_role_name';
    end if;

    v_role_names := array_append(v_role_names, v_role.role_name);
    v_active_for_role := coalesce((v_slot_counts ->> v_role.role_name)::integer, 0);

    if v_active_for_role <> v_role.declared_slot_count then
      raise exception 'invalid_roles'
        using detail = format('slot_count_mismatch:%s', v_role.role_name);
    end if;

    role_name := v_role.role_name;
    declared_slot_count := v_role.declared_slot_count;
    active_slot_count := v_active_for_role;
    return next;
  end loop;

  for v_slot_role in select key, value from jsonb_each(v_slot_counts) loop
    if coalesce(v_slot_role.key, '') <> '' and not (v_slot_role.key = any(v_role_names)) then
      raise exception 'invalid_roles'
        using detail = format('slot_role_missing_declaration:%s', v_slot_role.key);
    end if;
  end loop;
end;
$$;

grant execute on function public.verify_rank_roles_and_slots(jsonb, jsonb) to service_role;
