-- ============================================
-- 테스트용 임시 테이블 (test_ 접두사)
-- 실제 랭크 게임 로직을 테스트하기 위한 임시 테이블
-- 테스트 완료 후 데이터 삭제 가능
-- ============================================

-- 1. 테스트용 참가자 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.rank_games(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hero_id uuid REFERENCES public.heroes(id) ON DELETE SET NULL,
  hero_ids uuid[] NOT NULL DEFAULT array[]::uuid[],
  slot_no integer,
  role text,
  rating integer NOT NULL DEFAULT 1000,
  score integer,
  battles integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  win_rate numeric,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 슬롯 중복 방지 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS test_rank_participants_slot_unique
  ON public.test_rank_participants (game_id, slot_no)
  WHERE slot_no IS NOT NULL;

-- 역할별 조회 인덱스
CREATE INDEX IF NOT EXISTS test_rank_participants_active_by_role
  ON public.test_rank_participants (game_id, role, status, updated_at DESC);

-- RLS 활성화 (관리자 전용)
ALTER TABLE public.test_rank_participants ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있음 (테스트 데이터이므로)
DROP POLICY IF EXISTS test_rank_participants_select ON public.test_rank_participants;
CREATE POLICY test_rank_participants_select
  ON public.test_rank_participants FOR SELECT USING (true);

-- 인증된 사용자는 삽입/수정/삭제 가능 (테스트용)
DROP POLICY IF EXISTS test_rank_participants_modify ON public.test_rank_participants;
CREATE POLICY test_rank_participants_modify
  ON public.test_rank_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2. 테스트용 배틀 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.rank_games(id) ON DELETE CASCADE,
  attacker_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attacker_hero_ids uuid[] NOT NULL DEFAULT array[]::uuid[],
  defender_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  defender_hero_ids uuid[] NOT NULL DEFAULT array[]::uuid[],
  result text NOT NULL,
  score_delta integer,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_rank_battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_rank_battles_select ON public.test_rank_battles;
CREATE POLICY test_rank_battles_select
  ON public.test_rank_battles FOR SELECT USING (true);

DROP POLICY IF EXISTS test_rank_battles_modify ON public.test_rank_battles;
CREATE POLICY test_rank_battles_modify
  ON public.test_rank_battles FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 3. 테스트용 배틀 로그 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_battle_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.rank_games(id) ON DELETE CASCADE,
  battle_id uuid NOT NULL REFERENCES public.test_rank_battles(id) ON DELETE CASCADE,
  turn_no integer NOT NULL DEFAULT 1,
  prompt text,
  ai_response text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_rank_battle_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_rank_battle_logs_select ON public.test_rank_battle_logs;
CREATE POLICY test_rank_battle_logs_select
  ON public.test_rank_battle_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS test_rank_battle_logs_modify ON public.test_rank_battle_logs;
CREATE POLICY test_rank_battle_logs_modify
  ON public.test_rank_battle_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 4. 테스트용 세션 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.rank_games(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  turn integer NOT NULL DEFAULT 0,
  mode text,
  vote_snapshot jsonb DEFAULT '{}'::jsonb,
  rating_hint integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_rank_sessions_status_recent_idx
  ON public.test_rank_sessions (status, game_id, updated_at DESC);

ALTER TABLE public.test_rank_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_rank_sessions_select ON public.test_rank_sessions;
CREATE POLICY test_rank_sessions_select
  ON public.test_rank_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS test_rank_sessions_modify ON public.test_rank_sessions;
CREATE POLICY test_rank_sessions_modify
  ON public.test_rank_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 5. 테스트용 세션 메타 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_session_meta (
  session_id uuid PRIMARY KEY REFERENCES public.test_rank_sessions(id) ON DELETE CASCADE,
  turn_limit integer,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  realtime_mode text DEFAULT 'off',
  drop_in_bonus_seconds integer DEFAULT 0,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  occupant_owner_id uuid,
  occupant_hero_name text,
  score_delta integer,
  final_score integer,
  extras jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_rank_session_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_rank_session_meta_select ON public.test_rank_session_meta;
CREATE POLICY test_rank_session_meta_select
  ON public.test_rank_session_meta FOR SELECT USING (true);

DROP POLICY IF EXISTS test_rank_session_meta_modify ON public.test_rank_session_meta;
CREATE POLICY test_rank_session_meta_modify
  ON public.test_rank_session_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 6. 테스트용 세션 슬롯 테이블
CREATE TABLE IF NOT EXISTS public.test_rank_session_slots (
  session_id uuid NOT NULL REFERENCES public.test_rank_sessions(id) ON DELETE CASCADE,
  slot_no integer NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hero_ids uuid[] NOT NULL DEFAULT array[]::uuid[],
  role text,
  score integer DEFAULT 0,
  status text,
  PRIMARY KEY (session_id, slot_no)
);

ALTER TABLE public.test_rank_session_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_rank_session_slots_select ON public.test_rank_session_slots;
CREATE POLICY test_rank_session_slots_select
  ON public.test_rank_session_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS test_rank_session_slots_modify ON public.test_rank_session_slots;
CREATE POLICY test_rank_session_slots_modify
  ON public.test_rank_session_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================
-- 테스트 데이터 정리용 함수
-- ============================================

-- 모든 테스트 데이터 삭제
CREATE OR REPLACE FUNCTION public.clear_all_test_rank_data()
RETURNS void AS $$
BEGIN
  DELETE FROM public.test_rank_battle_logs;
  DELETE FROM public.test_rank_battles;
  DELETE FROM public.test_rank_session_slots;
  DELETE FROM public.test_rank_session_meta;
  DELETE FROM public.test_rank_sessions;
  DELETE FROM public.test_rank_participants;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 특정 게임의 테스트 데이터만 삭제
CREATE OR REPLACE FUNCTION public.clear_test_rank_data_by_game(p_game_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.test_rank_battle_logs WHERE game_id = p_game_id;
  DELETE FROM public.test_rank_battles WHERE game_id = p_game_id;
  DELETE FROM public.test_rank_sessions WHERE game_id = p_game_id;
  DELETE FROM public.test_rank_participants WHERE game_id = p_game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 특정 세션의 테스트 데이터만 삭제
CREATE OR REPLACE FUNCTION public.clear_test_rank_session(p_session_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.test_rank_battle_logs 
  WHERE battle_id IN (
    SELECT id FROM public.test_rank_battles 
    WHERE id IN (
      SELECT id FROM public.test_rank_sessions WHERE id = p_session_id
    )
  );
  
  DELETE FROM public.test_rank_session_slots WHERE session_id = p_session_id;
  DELETE FROM public.test_rank_session_meta WHERE session_id = p_session_id;
  DELETE FROM public.test_rank_sessions WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 사용 예시 (주석)
-- ============================================

-- 1. 이 SQL 파일을 Supabase SQL Editor에서 실행
-- 2. 관리자 포탈에서 테스트 진행
-- 3. 테스트 완료 후 정리:
--    SELECT public.clear_all_test_rank_data();
-- 또는 특정 게임만:
--    SELECT public.clear_test_rank_data_by_game('게임ID');
-- 또는 특정 세션만:
--    SELECT public.clear_test_rank_session('세션ID');
