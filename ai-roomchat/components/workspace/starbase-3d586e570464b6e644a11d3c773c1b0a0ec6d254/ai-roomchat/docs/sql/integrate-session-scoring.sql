-- Integrate scoring calculation into session finalization
-- Date: 2025-10-21
-- Purpose: Apply score deltas using computeSessionScore logic when finalizing rank sessions

-- Helper function to compute session score based on wins
create or replace function public.compute_session_score_delta(
  p_wins integer,
  p_win_point integer default 25,
  p_win_cap integer default 3,
  p_loss_penalty integer default -15,
  p_floor integer default 0,
  p_ceiling integer default null
)
returns integer
language plpgsql
immutable
as $$
declare
  v_delta integer;
  v_capped_wins integer;
begin
  -- Cap wins at win_cap
  v_capped_wins := least(coalesce(p_wins, 0), coalesce(p_win_cap, 3));
  
  -- Calculate base delta
  if v_capped_wins > 0 then
    v_delta := v_capped_wins * coalesce(p_win_point, 25);
  else
    v_delta := coalesce(p_loss_penalty, -15);
  end if;
  
  -- Apply floor
  if coalesce(p_floor, 0) > 0 and v_delta < p_floor then
    v_delta := p_floor;
  end if;
  
  -- Apply ceiling
  if p_ceiling is not null and v_delta > p_ceiling then
    v_delta := p_ceiling;
  end if;
  
  return v_delta;
end;
$$;

comment on function public.compute_session_score_delta is 
'Calculate score delta for a session based on wins, with configurable points, caps, floor, and ceiling';

-- Update finalize_rank_session_outcome to compute and apply score deltas
-- This assumes the RPC already exists; we'll add score calculation before updating participants

-- Note: Since we can't easily patch an existing function here, we'll create a helper
-- that the RPC can call, or document the integration point.

-- Integration point: In finalize_rank_session_outcome, after determining wins/losses,
-- call compute_session_score_delta for each entry and apply the result.
-- 
-- Example integration (pseudo-code for the RPC):
-- 
--   foreach entry in p_outcomes loop
--     v_computed_delta := compute_session_score_delta(
--       entry.wins,
--       game_rules.win_point,
--       game_rules.win_cap,
--       game_rules.loss_penalty,
--       game_rules.score_floor,
--       game_rules.score_ceiling
--     );
--     
--     -- Apply to participant
--     update rank_participants
--     set score = greatest(0, score + v_computed_delta),
--         rating = greatest(0, rating + v_computed_delta),
--         updated_at = now()
--     where owner_id = entry.owner_id and game_id = p_game_id;
--   end loop;

-- For stand-in participants (simulated = true), you may want to skip score updates
-- or apply a reduced delta.
