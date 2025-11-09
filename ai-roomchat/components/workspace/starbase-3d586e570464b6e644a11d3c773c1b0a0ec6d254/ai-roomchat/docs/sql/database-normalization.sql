-- 🏗️ 데이터베이스 구조 개선 및 정규화
-- docs/sql/database-normalization.sql

-- =========================================
--  게임 변수를 위한 정규화된 테이블
-- =========================================

-- 게임 변수 타입 정의
CREATE TABLE IF NOT EXISTS public.game_variable_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'player_level', 'inventory', 'health' 등
  data_type TEXT NOT NULL CHECK (data_type IN ('integer', 'float', 'string', 'boolean', 'json')),
  default_value TEXT, -- 기본값 (문자열로 저장)
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 게임 변수 타입들 삽입
INSERT INTO public.game_variable_types (name, data_type, default_value, description) VALUES
('player_level', 'integer', '1', '플레이어 레벨'),
('player_health', 'integer', '100', '플레이어 체력'),
('player_mana', 'integer', '50', '플레이어 마나'),
('inventory', 'json', '[]', '인벤토리 아이템 목록'),
('achievements', 'json', '[]', '획득한 업적 목록'),
('current_location', 'string', 'start', '현재 위치'),
('gold', 'integer', '0', '보유 골드'),
('experience', 'integer', '0', '경험치'),
('game_flags', 'json', '{}', '게임 진행 플래그들'),
('last_save_time', 'string', '', '마지막 저장 시간')
ON CONFLICT (name) DO NOTHING;

-- 정규화된 게임 변수 테이블
CREATE TABLE IF NOT EXISTS public.game_session_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  variable_type_id UUID NOT NULL REFERENCES public.game_variable_types(id),
  value TEXT NOT NULL, -- 모든 값을 문자열로 저장 (타입 변환은 애플리케이션에서)
  persistence_level TEXT NOT NULL DEFAULT 'session' CHECK (persistence_level IN ('session', 'game', 'permanent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(session_id, variable_type_id)
);

-- RLS 설정
ALTER TABLE public.game_variable_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_variables ENABLE ROW LEVEL SECURITY;

-- 게임 변수 타입은 모든 인증된 사용자가 읽기 가능
CREATE POLICY game_variable_types_read ON public.game_variable_types
  FOR SELECT TO authenticated USING (true);

-- 세션 변수는 세션 소유자만 접근
CREATE POLICY session_variables_owner_only ON public.game_session_variables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions 
      WHERE id = session_id AND user_id = auth.uid()
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_session_variables_session_type 
  ON public.game_session_variables (session_id, variable_type_id);

CREATE INDEX IF NOT EXISTS idx_session_variables_persistence 
  ON public.game_session_variables (persistence_level, updated_at DESC);

-- =========================================
--  점수 이벤트 세분화
-- =========================================

-- 점수 이벤트 타입 정의
CREATE TABLE IF NOT EXISTS public.score_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'combat_win', 'quest_complete', 'achievement_unlock' 등
  category TEXT NOT NULL, -- 'combat', 'quest', 'achievement', 'penalty' 등
  default_points INTEGER NOT NULL DEFAULT 0,
  multiplier_applicable BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 점수 이벤트 타입들
INSERT INTO public.score_event_types (name, category, default_points, description) VALUES
('combat_win', 'combat', 100, '전투 승리'),
('combat_lose', 'combat', -50, '전투 패배'),
('quest_complete', 'quest', 200, '퀘스트 완료'),
('quest_fail', 'quest', -25, '퀘스트 실패'),
('achievement_unlock', 'achievement', 150, '업적 달성'),
('item_collect', 'item', 25, '아이템 수집'),
('level_up', 'progress', 300, '레벨업'),
('death_penalty', 'penalty', -100, '사망 패널티'),
('time_bonus', 'bonus', 50, '시간 보너스'),
('perfect_score', 'bonus', 500, '완벽한 수행'),
('hint_used', 'penalty', -10, '힌트 사용'),
('save_progress', 'system', 0, '진행 상황 저장')
ON CONFLICT (name) DO NOTHING;

-- 개선된 점수 이벤트 테이블
ALTER TABLE public.score_events 
  ADD COLUMN IF NOT EXISTS event_type_id UUID REFERENCES public.score_event_types(id),
  ADD COLUMN IF NOT EXISTS multiplier FLOAT DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS location TEXT, -- 이벤트 발생 위치
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'; -- 추가 메타데이터만 JSONB 사용

-- 기존 event_type을 새로운 구조로 마이그레이션
UPDATE public.score_events 
SET event_type_id = (
  SELECT id FROM public.score_event_types 
  WHERE name = 
    CASE public.score_events.event_type
      WHEN 'win' THEN 'combat_win'
      WHEN 'lose' THEN 'combat_lose'
      WHEN 'achievement' THEN 'achievement_unlock'
      WHEN 'bonus' THEN 'time_bonus'
      WHEN 'penalty' THEN 'hint_used'
      ELSE 'save_progress'
    END
  LIMIT 1
)
WHERE event_type_id IS NULL;

-- =========================================
--  프로젝트 설정 정규화
-- =========================================

-- 프로젝트 설정 타입
CREATE TABLE IF NOT EXISTS public.project_setting_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  data_type TEXT NOT NULL CHECK (data_type IN ('integer', 'float', 'string', 'boolean')),
  category TEXT NOT NULL, -- 'gameplay', 'display', 'audio', 'performance' 등
  default_value TEXT,
  min_value TEXT, -- 최소값 (숫자 타입의 경우)
  max_value TEXT, -- 최대값 (숫자 타입의 경우)
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 프로젝트 설정들
INSERT INTO public.project_setting_types (name, data_type, category, default_value, description) VALUES
('max_score', 'integer', 'gameplay', '1000', '최대 달성 가능 점수'),
('time_limit_seconds', 'integer', 'gameplay', '600', '게임 시간 제한 (초)'),
('max_turns', 'integer', 'gameplay', '50', '최대 턴 수'),
('difficulty_level', 'integer', 'gameplay', '1', '난이도 레벨 (1-5)'),
('enable_hints', 'boolean', 'gameplay', 'true', '힌트 시스템 활성화'),
('auto_save_interval', 'integer', 'performance', '30', '자동 저장 간격 (초)'),
('sound_enabled', 'boolean', 'audio', 'true', '사운드 효과 활성화'),
('animation_speed', 'float', 'display', '1.0', '애니메이션 속도 배율'),
('theme', 'string', 'display', 'default', '게임 테마'),
('language', 'string', 'display', 'ko', '게임 언어')
ON CONFLICT (name) DO NOTHING;

-- 정규화된 프로젝트 설정 테이블
CREATE TABLE IF NOT EXISTS public.project_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.game_projects(id) ON DELETE CASCADE,
  setting_type_id UUID NOT NULL REFERENCES public.project_setting_types(id),
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, setting_type_id)
);

-- RLS 설정
ALTER TABLE public.project_setting_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_setting_types_read ON public.project_setting_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY project_settings_owner_only ON public.project_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.game_projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

-- =========================================
--  개선된 함수들
-- =========================================

-- 게임 변수 설정/조회 함수
CREATE OR REPLACE FUNCTION set_game_variable(
  p_session_id UUID,
  p_variable_name TEXT,
  p_value TEXT,
  p_persistence TEXT DEFAULT 'session'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_variable_type_id UUID;
  v_result JSONB;
BEGIN
  -- 변수 타입 ID 조회
  SELECT id INTO v_variable_type_id
  FROM public.game_variable_types
  WHERE name = p_variable_name;
  
  IF v_variable_type_id IS NULL THEN
    RAISE EXCEPTION 'Unknown variable type: %', p_variable_name;
  END IF;
  
  -- 변수 설정 (UPSERT)
  INSERT INTO public.game_session_variables (
    session_id,
    variable_type_id,
    value,
    persistence_level
  ) VALUES (
    p_session_id,
    v_variable_type_id,
    p_value,
    p_persistence
  )
  ON CONFLICT (session_id, variable_type_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    persistence_level = EXCLUDED.persistence_level,
    updated_at = NOW();
  
  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'variable_name', p_variable_name,
    'value', p_value,
    'persistence', p_persistence
  );
  
  RETURN v_result;
END;
$$;

-- 게임 변수 조회 함수
CREATE OR REPLACE FUNCTION get_game_variables(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_variables JSONB;
BEGIN
  SELECT jsonb_object_agg(
    vt.name,
    jsonb_build_object(
      'value', sv.value,
      'data_type', vt.data_type,
      'persistence', sv.persistence_level,
      'updated_at', sv.updated_at
    )
  ) INTO v_variables
  FROM public.game_session_variables sv
  JOIN public.game_variable_types vt ON sv.variable_type_id = vt.id
  WHERE sv.session_id = p_session_id;
  
  RETURN COALESCE(v_variables, '{}'::jsonb);
END;
$$;

-- 프로젝트 설정 함수
CREATE OR REPLACE FUNCTION set_project_setting(
  p_project_id UUID,
  p_setting_name TEXT,
  p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_setting_type_id UUID;
BEGIN
  -- 설정 타입 ID 조회
  SELECT id INTO v_setting_type_id
  FROM public.project_setting_types
  WHERE name = p_setting_name;
  
  IF v_setting_type_id IS NULL THEN
    RAISE EXCEPTION 'Unknown setting type: %', p_setting_name;
  END IF;
  
  -- 설정값 저장
  INSERT INTO public.project_settings (
    project_id,
    setting_type_id,
    value
  ) VALUES (
    p_project_id,
    v_setting_type_id,
    p_value
  )
  ON CONFLICT (project_id, setting_type_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'setting_name', p_setting_name,
    'value', p_value
  );
END;
$$;

-- 최적화된 인덱스들
CREATE INDEX IF NOT EXISTS idx_project_settings_project_category 
  ON public.project_settings ps
  JOIN public.project_setting_types pst ON ps.setting_type_id = pst.id
  (ps.project_id, pst.category);

CREATE INDEX IF NOT EXISTS idx_score_events_type_category 
  ON public.score_events se
  JOIN public.score_event_types set ON se.event_type_id = set.id
  (se.session_id, set.category, se.created_at DESC);

-- 성능 분석을 위한 뷰
CREATE OR REPLACE VIEW v_game_performance_summary AS
SELECT 
  gs.id as session_id,
  gs.project_id,
  gs.user_id,
  gs.status,
  gs.current_score,
  gs.current_turn,
  gs.duration_seconds,
  COUNT(se.id) as total_score_events,
  COUNT(sv.id) as total_variables,
  MAX(se.created_at) as last_score_event,
  AVG(se.score_change) as avg_score_change
FROM public.game_sessions gs
LEFT JOIN public.score_events se ON gs.id = se.session_id
LEFT JOIN public.game_session_variables sv ON gs.id = sv.session_id
GROUP BY gs.id, gs.project_id, gs.user_id, gs.status, gs.current_score, gs.current_turn, gs.duration_seconds;

-- 통계 조회 개선 함수
CREATE OR REPLACE FUNCTION get_normalized_performance_stats(
  p_time_range TEXT DEFAULT '24h'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_stats JSONB;
BEGIN
  -- 시간 범위 설정
  CASE p_time_range
    WHEN '1h' THEN v_start_time := NOW() - INTERVAL '1 hour';
    WHEN '24h' THEN v_start_time := NOW() - INTERVAL '24 hours';
    WHEN '7d' THEN v_start_time := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN v_start_time := NOW() - INTERVAL '30 days';
    ELSE v_start_time := NOW() - INTERVAL '24 hours';
  END CASE;
  
  SELECT jsonb_build_object(
    'time_range', p_time_range,
    'sessions', jsonb_build_object(
      'total', COUNT(*),
      'active', COUNT(*) FILTER (WHERE status = 'active'),
      'finished', COUNT(*) FILTER (WHERE status = 'finished'),
      'avg_score', ROUND(COALESCE(AVG(current_score), 0), 2),
      'avg_turns', ROUND(COALESCE(AVG(current_turn), 0), 2),
      'avg_duration_minutes', ROUND(COALESCE(AVG(duration_seconds) / 60.0, 0), 2)
    ),
    'score_events_by_category', (
      SELECT jsonb_object_agg(
        set.category,
        jsonb_build_object(
          'total_events', COUNT(*),
          'avg_score_change', ROUND(AVG(se.score_change), 2),
          'total_score_impact', SUM(se.score_change)
        )
      )
      FROM public.score_events se
      JOIN public.score_event_types set ON se.event_type_id = set.id
      WHERE se.created_at >= v_start_time
      GROUP BY set.category
    ),
    'variables_usage', (
      SELECT jsonb_object_agg(
        vt.name,
        jsonb_build_object(
          'total_sets', COUNT(*),
          'unique_sessions', COUNT(DISTINCT sv.session_id)
        )
      )
      FROM public.game_session_variables sv
      JOIN public.game_variable_types vt ON sv.variable_type_id = vt.id
      WHERE sv.created_at >= v_start_time
      GROUP BY vt.name, vt.data_type
    )
  ) INTO v_stats
  FROM v_game_performance_summary
  WHERE created_at >= v_start_time;
  
  RETURN v_stats;
END;
$$;