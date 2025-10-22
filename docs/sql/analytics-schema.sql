-- ========================================
-- 📊 Analytics Database Schema
-- 게임 분석 데이터 저장을 위한 테이블 구조
-- ========================================

-- 분석 세션 테이블
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    user_agent TEXT,
    platform VARCHAR(100),
    language VARCHAR(10),
    viewport_width INTEGER,
    viewport_height INTEGER,
    timezone VARCHAR(50),
    referrer TEXT,
    connection_info JSONB,
    start_time TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 게임 이벤트 테이블
CREATE TABLE IF NOT EXISTS analytics_game_events (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    url TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

-- 사용자 행동 테이블
CREATE TABLE IF NOT EXISTS analytics_user_actions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    action_type VARCHAR(100) NOT NULL,
    action_context JSONB,
    url TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

-- 성능 메트릭 테이블
CREATE TABLE IF NOT EXISTS analytics_performance_metrics (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit VARCHAR(20) DEFAULT 'ms',
    url TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

-- 오류 추적 테이블
CREATE TABLE IF NOT EXISTS analytics_errors (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    error_message TEXT NOT NULL,
    error_stack TEXT,
    error_context JSONB,
    url TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

-- AI 요청 추적 테이블
CREATE TABLE IF NOT EXISTS analytics_ai_requests (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    prompt_length INTEGER,
    response_time NUMERIC,
    success BOOLEAN NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

-- 일일 통계 테이블
CREATE TABLE IF NOT EXISTS analytics_daily_stats (
    id BIGSERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    total_sessions INTEGER DEFAULT 0,
    total_events INTEGER DEFAULT 0,
    game_events INTEGER DEFAULT 0,
    user_actions INTEGER DEFAULT 0,
    performance_metrics INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    ai_requests INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 인덱스 생성 (성능 최적화)
-- ========================================

-- 세션 관련 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_id ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start_time ON analytics_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_activity ON analytics_sessions(last_activity);

-- 게임 이벤트 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_game_events_session_id ON analytics_game_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_game_events_user_id ON analytics_game_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_game_events_type_timestamp ON analytics_game_events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_game_events_timestamp ON analytics_game_events(timestamp);

-- 사용자 행동 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_user_actions_session_id ON analytics_user_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_actions_user_id ON analytics_user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_actions_type_timestamp ON analytics_user_actions(action_type, timestamp);

-- 성능 메트릭 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_performance_session_id ON analytics_performance_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_performance_metric_timestamp ON analytics_performance_metrics(metric_name, timestamp);

-- 오류 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_errors_session_id ON analytics_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_errors_user_id ON analytics_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_errors_timestamp ON analytics_errors(timestamp);

-- AI 요청 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_ai_requests_session_id ON analytics_ai_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_ai_requests_provider ON analytics_ai_requests(provider);
CREATE INDEX IF NOT EXISTS idx_analytics_ai_requests_success_timestamp ON analytics_ai_requests(success, timestamp);

-- ========================================
-- RLS (Row Level Security) 정책
-- ========================================

-- 분석 데이터는 관리자만 접근 가능
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily_stats ENABLE ROW LEVEL SECURITY;

-- 관리자 정책 (모든 데이터 접근 가능)
CREATE POLICY "Admin full access on analytics_sessions" ON analytics_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_game_events" ON analytics_game_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_user_actions" ON analytics_user_actions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_performance_metrics" ON analytics_performance_metrics
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_errors" ON analytics_errors
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_ai_requests" ON analytics_ai_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin full access on analytics_daily_stats" ON analytics_daily_stats
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.role = 'admin'
        )
    );

-- 사용자는 자신의 데이터만 조회 가능
CREATE POLICY "Users can view own analytics_sessions" ON analytics_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view own analytics_game_events" ON analytics_game_events
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view own analytics_user_actions" ON analytics_user_actions
    FOR SELECT USING (user_id = auth.uid());

-- ========================================
-- 분석 함수 및 뷰
-- ========================================

-- 세션 요약 뷰
CREATE OR REPLACE VIEW analytics_session_summary AS
SELECT 
    s.session_id,
    s.user_id,
    s.start_time,
    s.last_activity,
    EXTRACT(EPOCH FROM (s.last_activity - s.start_time)) / 60 as session_duration_minutes,
    COUNT(DISTINCT ge.id) as game_events_count,
    COUNT(DISTINCT ua.id) as user_actions_count,
    COUNT(DISTINCT e.id) as errors_count,
    COUNT(DISTINCT ai.id) as ai_requests_count,
    AVG(CASE WHEN pm.metric_name = 'ai_response_time' THEN pm.metric_value END) as avg_ai_response_time
FROM analytics_sessions s
LEFT JOIN analytics_game_events ge ON s.session_id = ge.session_id
LEFT JOIN analytics_user_actions ua ON s.session_id = ua.session_id
LEFT JOIN analytics_errors e ON s.session_id = e.session_id
LEFT JOIN analytics_ai_requests ai ON s.session_id = ai.session_id
LEFT JOIN analytics_performance_metrics pm ON s.session_id = pm.session_id
GROUP BY s.session_id, s.user_id, s.start_time, s.last_activity;

-- 성능 메트릭 통계 함수
CREATE OR REPLACE FUNCTION get_performance_stats(
    metric_name_param VARCHAR DEFAULT NULL,
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    metric_name VARCHAR,
    avg_value NUMERIC,
    min_value NUMERIC,
    max_value NUMERIC,
    count BIGINT,
    percentile_50 NUMERIC,
    percentile_95 NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pm.metric_name,
        AVG(pm.metric_value) as avg_value,
        MIN(pm.metric_value) as min_value,
        MAX(pm.metric_value) as max_value,
        COUNT(*) as count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pm.metric_value) as percentile_50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.metric_value) as percentile_95
    FROM analytics_performance_metrics pm
    WHERE (metric_name_param IS NULL OR pm.metric_name = metric_name_param)
    AND pm.timestamp >= start_date::TIMESTAMPTZ
    AND pm.timestamp < (end_date + INTERVAL '1 day')::TIMESTAMPTZ
    GROUP BY pm.metric_name
    ORDER BY pm.metric_name;
END;
$$ LANGUAGE plpgsql;

-- 오류 분석 함수
CREATE OR REPLACE FUNCTION analyze_errors(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    error_pattern TEXT,
    error_count BIGINT,
    unique_users BIGINT,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUBSTRING(e.error_message FROM 1 FOR 100) as error_pattern,
        COUNT(*) as error_count,
        COUNT(DISTINCT e.user_id) as unique_users,
        MIN(e.timestamp) as first_occurrence,
        MAX(e.timestamp) as last_occurrence
    FROM analytics_errors e
    WHERE e.timestamp >= start_date::TIMESTAMPTZ
    AND e.timestamp < (end_date + INTERVAL '1 day')::TIMESTAMPTZ
    GROUP BY SUBSTRING(e.error_message FROM 1 FOR 100)
    ORDER BY error_count DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- AI 사용량 분석 함수
CREATE OR REPLACE FUNCTION analyze_ai_usage(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    provider VARCHAR,
    total_requests BIGINT,
    success_requests BIGINT,
    success_rate NUMERIC,
    avg_response_time NUMERIC,
    unique_users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ai.provider,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE ai.success = true) as success_requests,
        (COUNT(*) FILTER (WHERE ai.success = true)::NUMERIC / COUNT(*)) * 100 as success_rate,
        AVG(ai.response_time) as avg_response_time,
        COUNT(DISTINCT ai.user_id) as unique_users
    FROM analytics_ai_requests ai
    WHERE ai.timestamp >= start_date::TIMESTAMPTZ
    AND ai.timestamp < (end_date + INTERVAL '1 day')::TIMESTAMPTZ
    GROUP BY ai.provider
    ORDER BY total_requests DESC;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 자동 정리 함수 (오래된 데이터 삭제)
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_old_analytics_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- 90일 이상된 세션 데이터 삭제
    DELETE FROM analytics_sessions 
    WHERE start_time < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- 30일 이상된 상세 이벤트 데이터 삭제 (세션은 유지)
    DELETE FROM analytics_game_events 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    DELETE FROM analytics_user_actions 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    DELETE FROM analytics_performance_metrics 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- 오류는 60일간 보관
    DELETE FROM analytics_errors 
    WHERE timestamp < NOW() - INTERVAL '60 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- AI 요청 기록은 30일간 보관
    DELETE FROM analytics_ai_requests 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 트리거 및 자동화
-- ========================================

-- 업데이트 시간 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER update_analytics_sessions_updated_at
    BEFORE UPDATE ON analytics_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_daily_stats_updated_at
    BEFORE UPDATE ON analytics_daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();