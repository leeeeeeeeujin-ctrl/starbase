-- Channel-aware wrapper for finalize_rank_session_outcome
-- This function preserves the original behavior but also computes
-- a channels summary from the provided p_outcomes JSON array and
-- includes it in the stored payload under the `channels` key.
--
-- Usage: call this function instead of (or as a replacement for)
-- the existing `finalize_rank_session_outcome`. It's backward-compatible
-- with callers that omit `channel` fields in outcomes.

create or replace function public.finalize_rank_session_outcome(
  p_session_id uuid,
  p_game_id uuid,
  p_outcomes jsonb,
  p_roles jsonb,
  p_summary jsonb,
  p_completed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_result jsonb := '{}'::jsonb;
  v_outcome record;
  v_participant jsonb;
  v_channels jsonb := '{}'::jsonb;
begin
  -- Lock the session row as before
  select *
    into v_session
  from public.rank_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if p_game_id is not null and v_session.game_id <> p_game_id then
    raise exception 'session_game_mismatch' using errcode = 'P0001';
  end if;

  if v_session.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'session_id', v_session.id);
  end if;

  -- Build participant updates (same as prior implementation)
  for v_outcome in
    select *
      from jsonb_to_recordset(coalesce(p_outcomes, '[]'::jsonb)) as t (
        key text,
        participant_id text,
        owner_id text,
        hero_id text,
        hero_name text,
        role text,
        result text,
        wins integer,
        losses integer,
        eliminated boolean,
        slot_index integer,
        score_delta integer,
        history jsonb
      )
  loop
    -- Normalize incoming ids to text and compare against stored id::text.
    -- This makes the function tolerant to schemas where rank_participants.id
    -- may be numeric (bigint) or uuid. Comparing id::text avoids operator
    -- mismatch errors while remaining simple and explicit.
    declare v_participant_text text := nullif(coalesce(v_outcome.participant_id::text, ''), '');
    declare v_participant_json jsonb := null;

    if v_participant_text is not null then
      update public.rank_participants
         set score = coalesce(score, 0) + coalesce(v_outcome.score_delta, 0),
             battles = coalesce(battles, 0) + 1,
             status = case
               when coalesce(lower(v_outcome.result), '') in ('won', 'win') then 'won'
               when coalesce(lower(v_outcome.result), '') in ('lost', 'lose') then 'lost'
               when coalesce(lower(v_outcome.result), '') in ('eliminated', 'out', 'retired') then 'retired'
               else coalesce(status, 'active')
             end,
             updated_at = p_completed_at
       where (id::text) = v_participant_text
       returning jsonb_build_object(
         'participant_id', id,
         'score', score,
         'status', status
       ) into v_participant_json;

      if v_participant_json is not null then
        v_result := jsonb_set(
          v_result,
          array['participants'],
          coalesce(v_result->'participants', '[]'::jsonb) || v_participant_json
        );
      end if;
    end if;
  end loop;

  -- Build a channels summary from p_outcomes (group by cleaned outcome->>'channel')
  -- Normalize channel keys: trim and treat empty/null as a sentinel '__no_channel__'
  select coalesce(jsonb_object_agg(channel, entries), '{}'::jsonb)
    into v_channels
  from (
    select coalesce(nullif(trim(e->>'channel'), ''), '__no_channel__') as channel,
           jsonb_agg(e) as entries
    from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) e
    group by coalesce(nullif(trim(e->>'channel'), ''), '__no_channel__')
  ) s;

  update public.rank_sessions
     set status = 'completed',
         updated_at = p_completed_at,
         -- Ensure the coalesce compares same types: cast the JSON text to integer first
         turn = coalesce((p_summary->>'turn')::integer, v_session.turn)
   where id = v_session.id;

  insert into public.rank_session_battle_logs as l (
    session_id,
    game_id,
    result,
    reason,
    payload,
    created_at,
    updated_at
  )
  values (
    v_session.id,
    coalesce(p_game_id, v_session.game_id),
    coalesce(p_summary->>'result', 'completed'),
    coalesce(p_summary->>'reason', 'roles_resolved'),
    jsonb_build_object(
      'entries', coalesce(p_outcomes, '[]'::jsonb),
      'roles', coalesce(p_roles, '[]'::jsonb),
      'summary', coalesce(p_summary, '{}'::jsonb),
      'channels', coalesce(v_channels, '{}'::jsonb)
    ),
    p_completed_at,
    p_completed_at
  )
  on conflict (session_id)
  do update set
    result = excluded.result,
    reason = excluded.reason,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'completed',
    'session_id', v_session.id,
    'game_id', v_session.game_id,
    'participants', coalesce(v_result->'participants', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.finalize_rank_session_outcome(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz
) to service_role;

grant execute on function public.finalize_rank_session_outcome(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  timestamptz
) to authenticated;
