-- ========================================
-- Text Battle Matchmaking / Rank RPC Implementation (v1)
-- ----------------------------------------
-- - find_text_battle_pair: 호출자를 rank_match_queue 에 enqueue 하고 matched=false 반환
-- - finalize_text_battle_rank: text_battle_sessions 를 completed 로 마크하고
--   (선택적으로) finalize_rank_session_outcome 를 호출해 랭크 세션을 종료
-- ========================================

create or replace function public.find_text_battle_pair(
  p_game_id      uuid,
  p_mode         text,
  p_user_id      uuid,
  p_hero_id      uuid,
  p_role         text,
  p_score        integer,
  p_debug        jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_queue_id uuid;
begin
  /*
    v1:
    - 복잡한 매칭 알고리즘 없이, 호출자를 rank_match_queue 에 enqueue 만 한다.
    - 이후 별도의 매칭 워커/트리거(realtime-matchmaking.sql 등)가 큐를 처리해
      룸/세션을 생성한다고 가정한다.
  */
  insert into public.rank_match_queue (
    game_id,
    owner_id,
    hero_id,
    role,
    score,
    status,
    joined_at,
    updated_at
  )
  values (
    p_game_id,
    p_user_id,
    p_hero_id,
    p_role,
    p_score,
    'waiting',
    now(),
    now()
  )
  returning id into v_queue_id;

  return jsonb_build_object(
    'matched', false,
    'queue_id', v_queue_id,
    'game_id', p_game_id,
    'mode', p_mode,
    'debug', coalesce(p_debug, '{}'::jsonb)
  );
end;
$$;


create or replace function public.finalize_text_battle_rank(
  p_rank_session_id   uuid,
  p_text_session_id   uuid,
  p_summary           jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_text_session public.text_battle_sessions%rowtype;
  v_now timestamptz := now();
  v_winner text;
  v_final_score jsonb;
  v_result jsonb;
begin
  /*
    v1 동작:
    - text_battle_sessions 에서 winner / final_score 를 가져와 completed 로 마크한다.
    - p_summary 에 winner / final_score 가 있으면 그 값으로 덮어쓴다.
    - finalize_rank_session_outcome(...) 을 호출해 랭크 세션을 "완료" 상태로만 업데이트한다.
      (참가자 점수 정책은 추후 outcomes/roles 생성 로직을 추가해 확장)
  */

  select *
    into v_text_session
  from public.text_battle_sessions
  where id = p_text_session_id
  for update;

  if not found then
    raise exception 'text_battle_session_not_found'
      using errcode = 'P0001';
  end if;

  -- 요약에서 winner / final_score 제공 시 우선 사용
  if p_summary ? 'winner' then
    v_winner := p_summary->>'winner';
  else
    v_winner := v_text_session.winner;
  end if;

  if p_summary ? 'final_score' then
    v_final_score := p_summary->'final_score';
  else
    v_final_score := v_text_session.final_score;
  end if;

  update public.text_battle_sessions
     set status      = 'completed',
         winner      = v_winner,
         final_score = v_final_score,
         updated_at  = v_now
   where id = v_text_session.id;

  -- 랭크 세션을 함께 종료하고 싶을 경우,
  -- p_summary.outcomes / p_summary.roles / p_summary.result / p_summary.reason 등을
  -- 텍스트 배틀 훅에서 채워 넣은 뒤 이 RPC를 호출하면 된다.
  if p_rank_session_id is not null then
    perform public.finalize_rank_session_outcome(
      p_rank_session_id,
      null, -- game_id는 finalize_rank_session_outcome 내부에서 세션을 통해 검증
      coalesce(p_summary->'outcomes', '[]'::jsonb),
      coalesce(p_summary->'roles', '[]'::jsonb),
      jsonb_build_object(
        'result', coalesce(p_summary->>'result', 'completed'),
        'reason', coalesce(p_summary->>'reason', 'text_battle'),
        'turn',  coalesce(p_summary->>'turn', null)
      ),
      v_now
    );
  end if;

  v_result := jsonb_build_object(
    'status', 'completed',
    'text_session_id', v_text_session.id,
    'winner', v_winner,
    'final_score', v_final_score
  );

  if p_rank_session_id is not null then
    v_result := jsonb_set(
      v_result,
      array['rank_session_id'],
      to_jsonb(p_rank_session_id)
    );
  end if;

  return v_result;
end;
$$;

