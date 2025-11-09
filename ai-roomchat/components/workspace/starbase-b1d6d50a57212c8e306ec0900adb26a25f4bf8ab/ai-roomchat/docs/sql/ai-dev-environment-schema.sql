-- =========================================
--  AI 개발 환경을 위한 수퍼베이스 스키마
--  Starbase AI Roomchat - Game Development Platform
-- =========================================

-- Extension 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================
--  1. AI API 관리 테이블
-- =========================================

-- AI API 설정 테이블 (사용자별)
CREATE TABLE IF NOT EXISTS public.ai_api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'cohere', 'local')),
  model_name TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  endpoint_url TEXT, -- 커스텀 엔드포인트 (로컬서버 등)
  enabled BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  test_status TEXT DEFAULT 'pending' CHECK (test_status IN ('success', 'failed', 'pending')),
  test_error_message TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, provider, model_name)
);

-- RLS 설정
ALTER TABLE public.ai_api_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_api_configs_owner_only ON public.ai_api_configs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_api_configs_user_provider 
  ON public.ai_api_configs (user_id, provider, enabled);

-- =========================================
--  2. 게임 프로젝트 관리 테이블
-- =========================================

-- 사용자 게임 프로젝트
CREATE TABLE IF NOT EXISTS public.game_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  project_type TEXT DEFAULT 'text_game' CHECK (project_type IN ('text_game', 'battle_game', 'puzzle_game', 'rpg_game', 'strategy_game')),
  
  -- 프로젝트 설정
  settings JSONB DEFAULT '{}'::jsonb,
  variables JSONB DEFAULT '{}'::jsonb,
  
  -- 점수 시스템 (FlexibleGameEngine 연동)
  score_rules JSONB DEFAULT '{
    "initial_score": 0,
    "win_points": 100,
    "lose_points": -50,
    "bonus_multiplier": 1.0
  }'::jsonb,
  end_conditions JSONB DEFAULT '{
    "score_limit": 1000,
    "time_limit_seconds": 600,
    "turn_limit": 50
  }'::jsonb,
  
  -- 메타데이터
  is_public BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  
  -- 상태
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 설정
ALTER TABLE public.game_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_projects_select ON public.game_projects
  FOR SELECT USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY game_projects_owner_only ON public.game_projects
  FOR INSERT, UPDATE, DELETE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_game_projects_user_public 
  ON public.game_projects (user_id, is_public, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_projects_type_public 
  ON public.game_projects (project_type, is_public, featured);

-- =========================================
--  3. 프로젝트 파일 관리 테이블
-- =========================================

-- 프로젝트 파일들 (코드, 설정 등)
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.game_projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('javascript', 'typescript', 'python', 'sql', 'json', 'markdown', 'html', 'css', 'lua', 'yaml')),
  content TEXT NOT NULL,
  
  -- 버전 관리
  version INTEGER DEFAULT 1,
  parent_version_id UUID REFERENCES public.project_files(id),
  
  -- 메타데이터
  size_bytes INTEGER DEFAULT 0,
  encoding TEXT DEFAULT 'utf-8',
  last_modified_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, file_path, version)
);

-- RLS 설정 (프로젝트 소유자만 접근)
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_files_project_owner ON public.project_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.game_projects 
      WHERE id = project_files.project_id 
      AND (user_id = auth.uid() OR is_public = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_projects 
      WHERE id = project_files.project_id 
      AND user_id = auth.uid()
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_project_files_project_type 
  ON public.project_files (project_id, file_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_version 
  ON public.project_files (project_id, file_path, version DESC);

-- =========================================
--  4. 게임 세션 및 점수 관리 테이블
-- =========================================

-- 게임 세션 (FlexibleGameEngine 연동)
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.game_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 게임 상태
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'paused', 'finished', 'cancelled')),
  current_score INTEGER DEFAULT 0,
  current_turn INTEGER DEFAULT 1,
  
  -- 세션 데이터
  session_data JSONB DEFAULT '{}'::jsonb, -- 세션별 임시 데이터
  persistent_data JSONB DEFAULT '{}'::jsonb, -- 영구 저장 데이터
  game_variables JSONB DEFAULT '{}'::jsonb, -- 게임 변수들
  
  -- 시간 정보
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- 결과 정보
  final_score INTEGER,
  result TEXT CHECK (result IN ('win', 'lose', 'draw', 'quit', 'timeout')),
  end_reason TEXT, -- 'completion', 'timeout', 'manual', 'score_limit'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 설정
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_sessions_owner_only ON public.game_sessions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status 
  ON public.game_sessions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_sessions_project_status 
  ON public.game_sessions (project_id, status, created_at DESC);

-- 점수 변동 기록
CREATE TABLE IF NOT EXISTS public.score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'win', 'lose', 'bonus', 'penalty', 'achievement'
  score_change INTEGER NOT NULL,
  old_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  reason TEXT,
  
  -- 이벤트 데이터
  event_data JSONB DEFAULT '{}'::jsonb,
  turn_number INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 설정
ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY score_events_session_owner ON public.score_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions 
      WHERE id = score_events.session_id 
      AND user_id = auth.uid()
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_score_events_session_time 
  ON public.score_events (session_id, created_at DESC);

-- =========================================
--  5. AI 작업 로그 테이블
-- =========================================

-- AI 코드 도우미 사용 로그
CREATE TABLE IF NOT EXISTS public.ai_assistant_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.game_projects(id) ON DELETE SET NULL,
  
  -- 요청 정보
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  programming_language TEXT NOT NULL,
  
  -- 대화 내용
  user_message TEXT NOT NULL,
  ai_response TEXT,
  generated_code TEXT,
  
  -- 실행 결과
  execution_success BOOLEAN,
  execution_result TEXT,
  execution_error TEXT,
  
  -- 메타데이터
  response_time_ms INTEGER,
  tokens_used INTEGER,
  cost_estimate NUMERIC(10,6), -- 예상 비용 (달러)
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 설정
ALTER TABLE public.ai_assistant_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_assistant_logs_owner_only ON public.ai_assistant_logs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_user_time 
  ON public.ai_assistant_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_logs_project_time 
  ON public.ai_assistant_logs (project_id, created_at DESC);

-- =========================================
--  6. 패키지 및 라이브러리 관리 테이블
-- =========================================

-- 사용자가 다운로드한 개발 패키지들 (하이브리드 앱용)
CREATE TABLE IF NOT EXISTS public.user_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  package_name TEXT NOT NULL,
  package_type TEXT NOT NULL CHECK (package_type IN ('npm', 'pip', 'custom', 'cdn')),
  version TEXT DEFAULT 'latest',
  
  -- 패키지 데이터
  package_url TEXT, -- CDN URL 또는 다운로드 링크
  package_size_bytes INTEGER,
  
  -- 설치 정보
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  
  -- 메타데이터
  description TEXT,
  dependencies JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, package_name, package_type)
);

-- RLS 설정
ALTER TABLE public.user_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_packages_owner_only ON public.user_packages
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_packages_user_type 
  ON public.user_packages (user_id, package_type, last_used_at DESC);

-- =========================================
--  7. 필수 함수들
-- =========================================

-- 업데이트 시간 자동 갱신 함수
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER ai_api_configs_set_updated_at
  BEFORE UPDATE ON public.ai_api_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER game_projects_set_updated_at
  BEFORE UPDATE ON public.game_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER project_files_set_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER game_sessions_set_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
--  8. 게임 프로젝트 관리 함수들
-- =========================================

-- 새 게임 프로젝트 생성 함수
CREATE OR REPLACE FUNCTION create_game_project(
  project_name TEXT,
  project_type TEXT DEFAULT 'text_game',
  initial_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_project_id UUID;
BEGIN
  -- 프로젝트 생성
  INSERT INTO public.game_projects (user_id, name, project_type, settings)
  VALUES (auth.uid(), project_name, project_type, initial_settings)
  RETURNING id INTO new_project_id;
  
  -- 기본 파일 생성 (템플릿 기반)
  INSERT INTO public.project_files (project_id, file_path, file_type, content)
  VALUES 
    (new_project_id, 'README.md', 'markdown', 
     '# ' || project_name || E'\n\n게임 프로젝트입니다.\n\n## 설명\n이 프로젝트는 Starbase AI 개발 환경에서 만들어진 ' || project_type || ' 게임입니다.'),
    
    (new_project_id, 'src/main.js', 'javascript', 
     '// ' || project_name || ' - 메인 게임 로직\n\n// 게임 초기화\nfunction initGame() {\n  console.log("게임 시작: ' || project_name || '");\n}\n\n// 게임 시작\ninitGame();'),
     
    (new_project_id, 'config/game.json', 'json', 
     '{\n  "name": "' || project_name || '",\n  "version": "1.0.0",\n  "type": "' || project_type || '",\n  "settings": {\n    "maxScore": 1000,\n    "timeLimit": 600\n  }\n}');
  
  RETURN new_project_id;
END;
$$;

-- 게임 세션 시작 함수
CREATE OR REPLACE FUNCTION start_game_session(
  p_project_id UUID,
  initial_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_session_id UUID;
  project_score_rules JSONB;
BEGIN
  -- 프로젝트 점수 규칙 가져오기
  SELECT score_rules INTO project_score_rules
  FROM public.game_projects
  WHERE id = p_project_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;
  
  -- 세션 생성
  INSERT INTO public.game_sessions (
    project_id,
    user_id,
    status,
    current_score,
    session_data,
    started_at
  )
  VALUES (
    p_project_id,
    auth.uid(),
    'active',
    COALESCE((project_score_rules->>'initial_score')::INTEGER, 0),
    initial_data,
    NOW()
  )
  RETURNING id INTO new_session_id;
  
  RETURN new_session_id;
END;
$$;

-- 점수 업데이트 함수 (FlexibleGameEngine 연동)
CREATE OR REPLACE FUNCTION update_game_score(
  p_session_id UUID,
  p_event_type TEXT,
  p_score_change INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_turn_number INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_score INTEGER;
  v_new_score INTEGER;
  v_project_id UUID;
  v_end_conditions JSONB;
  v_should_end_game BOOLEAN := FALSE;
  result JSONB;
BEGIN
  -- 현재 점수 및 프로젝트 정보 가져오기
  SELECT 
    gs.current_score, 
    gs.project_id,
    gp.end_conditions
  INTO v_old_score, v_project_id, v_end_conditions
  FROM public.game_sessions gs
  JOIN public.game_projects gp ON gs.project_id = gp.id
  WHERE gs.id = p_session_id AND gs.user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;
  
  -- 새 점수 계산
  v_new_score := v_old_score + p_score_change;
  
  -- 종료 조건 확인
  IF v_end_conditions IS NOT NULL THEN
    -- 점수 한계 확인
    IF (v_end_conditions->>'score_limit') IS NOT NULL 
       AND v_new_score >= (v_end_conditions->>'score_limit')::INTEGER THEN
      v_should_end_game := TRUE;
    END IF;
    
    -- 턴 한계 확인
    IF p_turn_number IS NOT NULL 
       AND (v_end_conditions->>'turn_limit') IS NOT NULL 
       AND p_turn_number >= (v_end_conditions->>'turn_limit')::INTEGER THEN
      v_should_end_game := TRUE;
    END IF;
  END IF;
  
  -- 세션 점수 업데이트
  UPDATE public.game_sessions
  SET 
    current_score = v_new_score,
    current_turn = COALESCE(p_turn_number, current_turn),
    status = CASE WHEN v_should_end_game THEN 'finished' ELSE status END,
    ended_at = CASE WHEN v_should_end_game THEN NOW() ELSE ended_at END,
    final_score = CASE WHEN v_should_end_game THEN v_new_score ELSE final_score END,
    result = CASE WHEN v_should_end_game THEN 'win' ELSE result END,
    updated_at = NOW()
  WHERE id = p_session_id;
  
  -- 점수 변동 로그 기록
  INSERT INTO public.score_events (
    session_id,
    event_type,
    score_change,
    old_score,
    new_score,
    reason,
    turn_number
  )
  VALUES (
    p_session_id,
    p_event_type,
    p_score_change,
    v_old_score,
    v_new_score,
    p_reason,
    p_turn_number
  );
  
  -- 결과 반환
  result := jsonb_build_object(
    'session_id', p_session_id,
    'old_score', v_old_score,
    'new_score', v_new_score,
    'change', p_score_change,
    'event_type', p_event_type,
    'game_ended', v_should_end_game,
    'turn', p_turn_number
  );
  
  RETURN result;
END;
$$;

-- 게임 종료 함수
CREATE OR REPLACE FUNCTION end_game_session(
  p_session_id UUID,
  p_result TEXT DEFAULT 'manual',
  p_end_reason TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session public.game_sessions%ROWTYPE;
  v_duration_seconds INTEGER;
BEGIN
  -- 세션 정보 가져오기
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;
  
  -- 이미 종료된 게임인지 확인
  IF v_session.status = 'finished' THEN
    RAISE EXCEPTION 'Session is already finished';
  END IF;
  
  -- 게임 시간 계산
  v_duration_seconds := EXTRACT(EPOCH FROM (NOW() - v_session.started_at))::INTEGER;
  
  -- 세션 종료 처리
  UPDATE public.game_sessions
  SET 
    status = 'finished',
    ended_at = NOW(),
    duration_seconds = v_duration_seconds,
    final_score = current_score,
    result = p_result,
    end_reason = p_end_reason,
    updated_at = NOW()
  WHERE id = p_session_id;
  
  -- 프로젝트 플레이 카운트 증가
  UPDATE public.game_projects
  SET 
    play_count = play_count + 1,
    updated_at = NOW()
  WHERE id = v_session.project_id;
  
  -- 결과 반환
  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'final_score', v_session.current_score,
    'duration_seconds', v_duration_seconds,
    'result', p_result,
    'end_reason', p_end_reason
  );
END;
$$;

-- =========================================
--  9. AI API 관리 함수들
-- =========================================

-- API 키 테스트 결과 업데이트 함수
CREATE OR REPLACE FUNCTION update_api_test_result(
  p_config_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ai_api_configs
  SET 
    last_tested_at = NOW(),
    test_status = p_status,
    test_error_message = p_error_message,
    updated_at = NOW()
  WHERE id = p_config_id AND user_id = auth.uid();
END;
$$;

-- API 사용 카운트 증가 함수
CREATE OR REPLACE FUNCTION increment_api_usage(
  p_provider TEXT,
  p_model_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ai_api_configs
  SET 
    usage_count = usage_count + 1,
    updated_at = NOW()
  WHERE user_id = auth.uid() 
    AND provider = p_provider 
    AND model_name = p_model_name;
END;
$$;