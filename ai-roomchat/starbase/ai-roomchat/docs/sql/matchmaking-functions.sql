-- Advanced matchmaking functions for role-based slot allocation
-- @version: 2025.10.21

-- Function to find available slots for a role
CREATE OR REPLACE FUNCTION find_available_slots(
    p_game_id UUID,
    p_role TEXT,
    p_exclude_slots INTEGER[]
)
RETURNS TABLE (
    slot_index INTEGER,
    required_role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gs.slot_index,
        gs.role as required_role
    FROM rank_game_slots gs
    WHERE gs.game_id = p_game_id
    AND gs.role = p_role
    AND gs.active = true
    AND gs.slot_index NOT IN (SELECT unnest(p_exclude_slots))
    ORDER BY gs.slot_index;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate role synergy score
CREATE OR REPLACE FUNCTION calculate_role_synergy(
    p_game_id UUID,
    p_slot_index INTEGER,
    p_role TEXT
)
RETURNS FLOAT AS $$
DECLARE
    v_synergy_score FLOAT := 1.0;
    v_filled_roles TEXT[];
BEGIN
    -- Get currently filled roles in the game
    SELECT array_agg(DISTINCT gs.role)
    INTO v_filled_roles
    FROM rank_game_slots gs
    WHERE gs.game_id = p_game_id
    AND gs.hero_id IS NOT NULL
    AND gs.slot_index != p_slot_index;

    -- Calculate synergy based on role combinations
    -- This is a simple example - you can expand this logic
    IF v_filled_roles IS NOT NULL THEN
        IF array_length(v_filled_roles, 1) >= 2 THEN
            v_synergy_score := 1.5; -- Bonus for diverse roles
        END IF;
    END IF;

    RETURN v_synergy_score;
END;
$$ LANGUAGE plpgsql;

-- Main matchmaking function
CREATE OR REPLACE FUNCTION find_match_for_player(
    p_user_id UUID,
    p_hero_id UUID,
    p_role TEXT,
    p_rating INTEGER DEFAULT 1000
)
RETURNS TABLE (
    match_id UUID,
    slot_index INTEGER,
    role TEXT
) AS $$
DECLARE
    v_match_window INTEGER := 200; -- Initial rating window
    v_max_window INTEGER := 400;   -- Maximum rating window
    v_game_id UUID;
    v_found BOOLEAN := FALSE;
BEGIN
    -- Find appropriate game first
    SELECT id INTO v_game_id
    FROM rank_games g
    WHERE EXISTS (
        SELECT 1 
        FROM rank_game_roles r 
        WHERE r.game_id = g.id 
        AND r.name = p_role 
        AND r.active = true
    )
    LIMIT 1;

    IF v_game_id IS NULL THEN
        RETURN;
    END IF;

    -- Try to find match with increasingly wider rating windows
    WHILE v_match_window <= v_max_window AND NOT v_found LOOP
        -- Look for matches in the queue
        FOR match_id, slot_index, role IN
            SELECT 
                q.id,
                s.slot_index,
                s.role
            FROM rank_match_queue q
            JOIN rank_game_slots s ON q.game_id = s.game_id
            WHERE q.game_id = v_game_id
            AND q.status = 'waiting'
            AND abs(q.score - p_rating) <= v_match_window
            AND s.role = p_role
            AND s.active = true
            AND s.hero_id IS NULL
            ORDER BY 
                calculate_role_synergy(v_game_id, s.slot_index, p_role) DESC,
                abs(q.score - p_rating),
                q.joined_at
        LOOP
            -- Try to secure the slot with proper locking
            IF pg_try_advisory_xact_lock(match_id::bigint, slot_index) THEN
                -- Verify slot is still available
                IF NOT EXISTS (
                    SELECT 1 
                    FROM rank_game_slots 
                    WHERE game_id = v_game_id 
                    AND slot_index = slot_index 
                    AND hero_id IS NOT NULL
                ) THEN
                    v_found := TRUE;
                    RETURN NEXT;
                END IF;
            END IF;
            EXIT WHEN v_found;
        END LOOP;
        
        v_match_window := v_match_window + 50;
    END LOOP;
    
    -- If no match found, create new match
    IF NOT v_found THEN
        INSERT INTO rank_match_queue (
            game_id,
            owner_id,
            hero_id,
            role,
            score,
            status
        ) VALUES (
            v_game_id,
            p_user_id,
            p_hero_id,
            p_role,
            p_rating,
            'waiting'
        )
        RETURNING id, 1, p_role;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update match state
CREATE OR REPLACE FUNCTION update_match_state(
    p_match_id UUID,
    p_slot_index INTEGER,
    p_user_id UUID,
    p_hero_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Update slot assignment
    UPDATE rank_game_slots
    SET hero_id = p_hero_id,
        hero_owner_id = p_user_id,
        updated_at = now()
    WHERE game_id = (
        SELECT game_id 
        FROM rank_match_queue 
        WHERE id = p_match_id
    )
    AND slot_index = p_slot_index;

    -- Log the match state change
    INSERT INTO rank_matchmaking_logs (
        game_id,
        session_id,
        stage,
        status,
        metadata
    ) VALUES (
        (SELECT game_id FROM rank_match_queue WHERE id = p_match_id),
        p_match_id,
        'slot_assignment',
        'completed',
        jsonb_build_object(
            'slot_index', p_slot_index,
            'user_id', p_user_id,
            'hero_id', p_hero_id
        )
    );
END;
$$ LANGUAGE plpgsql;