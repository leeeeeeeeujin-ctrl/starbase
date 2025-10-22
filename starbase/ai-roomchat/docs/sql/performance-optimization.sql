-- ⚡ 성능 최적화를 위한 배치 처리 SQL 함수들
-- docs/sql/performance-optimization.sql

-- 배치로 점수 이벤트 처리하는 함수
CREATE OR REPLACE FUNCTION batch_update_game_score(
  p_session_id UUID,
  p_score_events JSONB[],
  p_final_score INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_exists BOOLEAN;
  v_processed_count INTEGER := 0;
  v_event JSONB;
  v_current_score INTEGER;
  v_result JSONB;
BEGIN
  -- 1. 세션 존재 확인
  SELECT EXISTS(
    SELECT 1 FROM public.game_sessions 
    WHERE id = p_session_id AND user_id = auth.uid()
  ) INTO v_session_exists;
  
  IF NOT v_session_exists THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;
  
  -- 2. 현재 점수 가져오기
  SELECT current_score INTO v_current_score
  FROM public.game_sessions
  WHERE id = p_session_id;
  
  -- 3. 배치로 점수 이벤트 삽입
  FOR i IN 1..array_length(p_score_events, 1) LOOP
    v_event := p_score_events[i];
    
    INSERT INTO public.score_events (
      session_id,
      event_type,
      score_change,
      old_score,
      new_score,
      reason,
      turn_number,
      event_data,
      created_at
    ) VALUES (
      p_session_id,
      v_event->>'event_type',
      (v_event->>'score_change')::INTEGER,
      (v_event->>'old_score')::INTEGER,
      (v_event->>'new_score')::INTEGER,
      v_event->>'reason',
      (v_event->>'turn_number')::INTEGER,
      v_event->'event_data',
      to_timestamp((v_event->>'timestamp')::BIGINT / 1000)
    );
    
    v_processed_count := v_processed_count + 1;
  END LOOP;
  
  -- 4. 세션의 최종 점수 업데이트
  UPDATE public.game_sessions
  SET 
    current_score = p_final_score,
    current_turn = (SELECT MAX((event_data->>'turn_number')::INTEGER) FROM unnest(p_score_events) AS event_data),
    updated_at = NOW()
  WHERE id = p_session_id;
  
  -- 5. 결과 반환
  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'processed_events', v_processed_count,
    'old_score', v_current_score,
    'new_score', p_final_score,
    'score_change', p_final_score - v_current_score
  );
  
  RETURN v_result;
END;
$$;

-- 배치로 세션 변수 업데이트하는 함수
CREATE OR REPLACE FUNCTION batch_update_session_variables(
  p_session_updates JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update JSONB;
  v_processed_count INTEGER := 0;
  v_session_id UUID;
BEGIN
  -- 각 세션 업데이트 처리
  FOR i IN 1..array_length(p_session_updates, 1) LOOP
    v_update := p_session_updates[i];
    v_session_id := (v_update->>'session_id')::UUID;
    
    -- 권한 확인 및 업데이트
    UPDATE public.game_sessions
    SET 
      session_data = COALESCE(v_update->'session_data', session_data),
      persistent_data = COALESCE(v_update->'persistent_data', persistent_data),
      game_variables = COALESCE(v_update->'game_variables', game_variables),
      updated_at = NOW()
    WHERE id = v_session_id 
      AND user_id = auth.uid();
    
    IF FOUND THEN
      v_processed_count := v_processed_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed_sessions', v_processed_count,
    'total_requested', array_length(p_session_updates, 1)
  );
END;
$$;

-- 성능 통계 조회 함수
CREATE OR REPLACE FUNCTION get_performance_stats(
  p_time_range TEXT DEFAULT '24h'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_stats JSONB;
  v_session_stats JSONB;
  v_score_stats JSONB;
  v_ai_stats JSONB;
BEGIN
  -- 시간 범위 설정
  CASE p_time_range
    WHEN '1h' THEN v_start_time := NOW() - INTERVAL '1 hour';
    WHEN '24h' THEN v_start_time := NOW() - INTERVAL '24 hours';
    WHEN '7d' THEN v_start_time := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN v_start_time := NOW() - INTERVAL '30 days';
    ELSE v_start_time := NOW() - INTERVAL '24 hours';
  END CASE;
  
  -- 게임 세션 통계
  SELECT jsonb_build_object(
    'total_sessions', COUNT(*),
    'active_sessions', COUNT(*) FILTER (WHERE status = 'active'),
    'finished_sessions', COUNT(*) FILTER (WHERE status = 'finished'),
    'avg_duration_seconds', COALESCE(AVG(duration_seconds), 0),
    'avg_score', COALESCE(AVG(final_score), 0),
    'max_score', COALESCE(MAX(final_score), 0)
  ) INTO v_session_stats
  FROM public.game_sessions
  WHERE created_at >= v_start_time;
  
  -- 점수 이벤트 통계
  SELECT jsonb_build_object(
    'total_events', COUNT(*),
    'win_events', COUNT(*) FILTER (WHERE event_type = 'win'),
    'lose_events', COUNT(*) FILTER (WHERE event_type = 'lose'),
    'achievement_events', COUNT(*) FILTER (WHERE event_type = 'achievement'),
    'avg_score_change', COALESCE(AVG(score_change), 0),
    'events_per_minute', COALESCE(COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (NOW() - v_start_time)) / 60, 1), 0)
  ) INTO v_score_stats
  FROM public.score_events se
  JOIN public.game_sessions gs ON se.session_id = gs.id
  WHERE se.created_at >= v_start_time;
  
  -- AI 사용 통계
  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'successful_requests', COUNT(*) FILTER (WHERE execution_success = true),
    'failed_requests', COUNT(*) FILTER (WHERE execution_success = false),
    'avg_response_time_ms', COALESCE(AVG(response_time_ms), 0),
    'total_tokens_used', COALESCE(SUM(tokens_used), 0),
    'top_providers', (
      SELECT jsonb_agg(jsonb_build_object('provider', provider, 'count', cnt))
      FROM (
        SELECT provider, COUNT(*) as cnt
        FROM public.ai_assistant_logs
        WHERE created_at >= v_start_time
        GROUP BY provider
        ORDER BY cnt DESC
        LIMIT 5
      ) top_providers
    )
  ) INTO v_ai_stats
  FROM public.ai_assistant_logs
  WHERE created_at >= v_start_time;
  
  -- 전체 통계 조합
  v_stats := jsonb_build_object(
    'time_range', p_time_range,
    'start_time', v_start_time,
    'end_time', NOW(),
    'sessions', v_session_stats,
    'score_events', v_score_stats,
    'ai_usage', v_ai_stats,
    'database_performance', jsonb_build_object(
      'avg_query_time_ms', (
        SELECT COALESCE(AVG(total_time), 0)
        FROM pg_stat_statements
        WHERE calls > 0
        LIMIT 1
      )
    )
  );
  
  RETURN v_stats;
END;
$$;

-- 성능 최적화를 위한 인덱스들
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_score_events_session_created
ON public.score_events (session_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_sessions_user_status_created
ON public.game_sessions (user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_logs_user_created
ON public.ai_assistant_logs (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_logs_provider_created
ON public.ai_assistant_logs (provider, created_at DESC);

-- 세션 정리 함수 (오래된 세션 자동 정리)
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- 30일 이상 된 완료된 세션 삭제
  DELETE FROM public.game_sessions
  WHERE status = 'finished'
    AND ended_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- 로그도 함께 정리 (60일 이상)
  DELETE FROM public.ai_assistant_logs
  WHERE created_at < NOW() - INTERVAL '60 days';
  
  -- 점수 이벤트는 세션과 함께 CASCADE로 삭제됨
  
  RETURN v_deleted_count;
END;
$$;

-- 자동 정리 작업 스케줄링 (pg_cron 사용 시)
-- SELECT cron.schedule('cleanup-old-sessions', '0 2 * * *', 'SELECT cleanup_old_sessions();');

-- 배치 처리를 위한 임시 테이블
CREATE TABLE IF NOT EXISTS public.batch_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL,
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_queue_status_created
ON public.batch_processing_queue (status, created_at);

-- 배치 큐 처리 함수
CREATE OR REPLACE FUNCTION process_batch_queue(p_batch_size INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_batch_item RECORD;
BEGIN
  -- 대기 중인 항목들을 배치로 처리
  FOR v_batch_item IN
    SELECT id, operation_type, session_id, payload
    FROM public.batch_processing_queue
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- 처리 상태로 변경
      UPDATE public.batch_processing_queue
      SET status = 'processing', processed_at = NOW()
      WHERE id = v_batch_item.id;
      
      -- 작업 타입에 따라 처리
      CASE v_batch_item.operation_type
        WHEN 'score_update' THEN
          -- 점수 업데이트 처리
          PERFORM batch_update_game_score(
            v_batch_item.session_id,
            ARRAY[v_batch_item.payload],
            (v_batch_item.payload->>'new_score')::INTEGER
          );
        
        WHEN 'variable_update' THEN
          -- 변수 업데이트 처리
          PERFORM batch_update_session_variables(
            ARRAY[v_batch_item.payload]
          );
        
        ELSE
          RAISE EXCEPTION 'Unknown operation type: %', v_batch_item.operation_type;
      END CASE;
      
      -- 완료 상태로 변경
      UPDATE public.batch_processing_queue
      SET status = 'completed'
      WHERE id = v_batch_item.id;
      
      v_processed_count := v_processed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- 실패 처리
      UPDATE public.batch_processing_queue
      SET 
        status = 'failed',
        retry_count = retry_count + 1
      WHERE id = v_batch_item.id;
      
      v_failed_count := v_failed_count + 1;
      
      -- 로그 기록
      RAISE WARNING 'Batch processing failed for item %: %', v_batch_item.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed_count', v_processed_count,
    'failed_count', v_failed_count,
    'total_requested', p_batch_size
  );
END;
$$;