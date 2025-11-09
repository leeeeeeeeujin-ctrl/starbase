-- Realtime matchmaking functions for role-based slot allocation
-- @version: 2025.10.21

-- Function to handle realtime matchmaking queue
CREATE OR REPLACE FUNCTION process_realtime_queue(
    p_game_id UUID
)
RETURNS TABLE (
    match_id UUID,
    slot_assignments JSONB
) AS $$
DECLARE
    v_match_id UUID;
    v_slots_filled INTEGER;
    v_required_slots INTEGER;
    v_assignments JSONB := '[]'::jsonb;
BEGIN
    -- Get required slot count
    SELECT COUNT(*) 
    INTO v_required_slots
    FROM rank_game_slots
    WHERE game_id = p_game_id AND active = true;

    -- Find matches that are close to being filled
    FOR v_match_id IN
        SELECT DISTINCT q.id
        FROM rank_match_queue q
        JOIN rank_game_slots s ON q.game_id = s.game_id
        WHERE q.game_id = p_game_id
        AND q.status = 'waiting'
        GROUP BY q.id
        HAVING COUNT(s.hero_id) >= v_required_slots - 2  -- Almost filled matches
        ORDER BY MIN(q.joined_at)
    LOOP
        -- Get current slot assignments
        SELECT COUNT(*), 
               jsonb_agg(
                   jsonb_build_object(
                       'slot_index', s.slot_index,
                       'role', s.role,
                       'user_id', s.hero_owner_id,
                       'hero_id', s.hero_id
                   )
               )
        INTO v_slots_filled, v_assignments
        FROM rank_game_slots s
        WHERE s.game_id = p_game_id
        AND s.hero_id IS NOT NULL;

        -- If match is ready
        IF v_slots_filled = v_required_slots THEN
            -- Update match status
            UPDATE rank_match_queue
            SET status = 'matched',
                updated_at = now()
            WHERE id = v_match_id;

            -- Log the successful match
            INSERT INTO rank_matchmaking_logs (
                game_id,
                session_id,
                stage,
                status,
                metadata
            ) VALUES (
                p_game_id,
                v_match_id,
                'realtime_match',
                'completed',
                jsonb_build_object(
                    'slots_filled', v_slots_filled,
                    'assignments', v_assignments
                )
            );

            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to handle role priority and synergy in realtime
CREATE OR REPLACE FUNCTION calculate_realtime_priority(
    p_game_id UUID,
    p_role TEXT,
    p_rating INTEGER
)
RETURNS TABLE (
    priority FLOAT,
    wait_time INTEGER,
    role_demand FLOAT
) AS $$
DECLARE
    v_avg_wait_time INTEGER;
    v_role_queue_size INTEGER;
    v_total_queue_size INTEGER;
BEGIN
    -- Get average wait time for this role
    SELECT EXTRACT(EPOCH FROM AVG(now() - joined_at))::INTEGER
    INTO v_avg_wait_time
    FROM rank_match_queue
    WHERE game_id = p_game_id
    AND role = p_role
    AND status = 'waiting';

    -- Calculate role demand
    SELECT COUNT(*), (
        SELECT COUNT(*)
        FROM rank_match_queue
        WHERE game_id = p_game_id
        AND status = 'waiting'
    )
    INTO v_role_queue_size, v_total_queue_size
    FROM rank_match_queue
    WHERE game_id = p_game_id
    AND role = p_role
    AND status = 'waiting';

    -- Calculate priority score
    priority := (
        CASE 
            WHEN v_total_queue_size = 0 THEN 1.0
            ELSE v_role_queue_size::FLOAT / v_total_queue_size
        END
    );

    -- Adjust priority based on wait time
    IF v_avg_wait_time > 300 THEN  -- 5 minutes threshold
        priority := priority * 1.5;
    END IF;

    wait_time := COALESCE(v_avg_wait_time, 0);
    role_demand := COALESCE(priority, 1.0);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to manage realtime slot transitions
CREATE OR REPLACE FUNCTION manage_realtime_slots(
    p_game_id UUID,
    p_match_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_slot RECORD;
    v_next_role TEXT;
BEGIN
    -- Process each slot in the game
    FOR v_slot IN
        SELECT slot_index, role, hero_id
        FROM rank_game_slots
        WHERE game_id = p_game_id
        ORDER BY slot_index
    LOOP
        -- If slot is empty, find next optimal role
        IF v_slot.hero_id IS NULL THEN
            SELECT r.name
            INTO v_next_role
            FROM rank_game_roles r
            WHERE r.game_id = p_game_id
            AND r.active = true
            AND NOT EXISTS (
                SELECT 1
                FROM rank_game_slots s
                WHERE s.game_id = p_game_id
                AND s.role = r.name
                AND s.hero_id IS NOT NULL
            )
            ORDER BY r.score_delta_max DESC
            LIMIT 1;

            -- Update slot with new role if needed
            IF v_next_role IS NOT NULL AND v_next_role != v_slot.role THEN
                UPDATE rank_game_slots
                SET role = v_next_role
                WHERE game_id = p_game_id
                AND slot_index = v_slot.slot_index;

                -- Log the role transition
                INSERT INTO rank_matchmaking_logs (
                    game_id,
                    session_id,
                    stage,
                    status,
                    metadata
                ) VALUES (
                    p_game_id,
                    p_match_id,
                    'role_transition',
                    'completed',
                    jsonb_build_object(
                        'slot_index', v_slot.slot_index,
                        'old_role', v_slot.role,
                        'new_role', v_next_role
                    )
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;