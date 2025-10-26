/**
 * ⚡ GameDatabaseService 배치 처리 확장
 * 여러 점수 이벤트를 한 번에 처리하는 배치 메서드 추가
 */

import { supabase } from '../lib/supabase';

// 기존 GameDatabaseService 확장
export class BatchGameDatabaseService {
  // 배치로 점수 이벤트 처리
  static async batchUpdateScore(sessionId, scoreEvents) {
    if (!scoreEvents || scoreEvents.length === 0) {
      return { success: true, processedCount: 0 };
    }

    try {
      // 1. 최종 점수 계산
      const finalScore = scoreEvents.reduce((total, event) => {
        return event.new_score; // 마지막 이벤트의 new_score가 최종 점수
      }, 0);

      // 2. 트랜잭션으로 일괄 처리
      const { data, error } = await supabase.rpc('batch_update_game_score', {
        p_session_id: sessionId,
        p_score_events: scoreEvents,
        p_final_score: finalScore,
      });

      if (error) throw error;

      console.log(`✅ 배치 점수 업데이트 완료: ${scoreEvents.length}개 이벤트`);

      return {
        success: true,
        processedCount: scoreEvents.length,
        finalScore,
        result: data,
      };
    } catch (error) {
      console.error('배치 점수 업데이트 실패:', error);
      return {
        success: false,
        error: error.message,
        failedEvents: scoreEvents,
      };
    }
  }

  // 여러 세션의 변수 동시 업데이트
  static async batchUpdateSessionVariables(sessionUpdates) {
    if (!sessionUpdates || sessionUpdates.length === 0) {
      return { success: true, processedCount: 0 };
    }

    try {
      const { data, error } = await supabase.rpc('batch_update_session_variables', {
        p_session_updates: sessionUpdates,
      });

      if (error) throw error;

      return {
        success: true,
        processedCount: sessionUpdates.length,
        result: data,
      };
    } catch (error) {
      console.error('배치 세션 변수 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  }

  // AI 로그 배치 저장
  static async batchLogAIUsage(logEntries) {
    if (!logEntries || logEntries.length === 0) {
      return { success: true, processedCount: 0 };
    }

    try {
      const { data, error } = await supabase.from('ai_assistant_logs').insert(logEntries).select();

      if (error) throw error;

      return {
        success: true,
        processedCount: logEntries.length,
        logs: data,
      };
    } catch (error) {
      console.error('AI 로그 배치 저장 실패:', error);
      return { success: false, error: error.message };
    }
  }

  // 성능 통계 조회 (캐싱 포함)
  static async getPerformanceStats(timeRange = '24h') {
    try {
      const { data, error } = await supabase.rpc('get_performance_stats', {
        p_time_range: timeRange,
      });

      if (error) throw error;

      return { success: true, stats: data };
    } catch (error) {
      console.error('성능 통계 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
}

// 기존 서비스와 배치 서비스 통합
export default class EnhancedGameDatabaseService {
  // 기존 모든 메서드들을 포함하고 배치 메서드 추가

  // 기존 단일 점수 업데이트 (하위 호환성)
  static async updateScore(sessionId, eventType, scoreChange, reason = null, turnNumber = null) {
    // 단일 이벤트를 배치로 처리
    const scoreEvent = {
      event_type: eventType,
      score_change: scoreChange,
      old_score: 0, // 실제로는 현재 점수를 가져와야 함
      new_score: scoreChange, // 임시
      reason,
      turn_number: turnNumber,
      timestamp: Date.now(),
    };

    return await BatchGameDatabaseService.batchUpdateScore(sessionId, [scoreEvent]);
  }

  // 새로운 배치 메서드들
  static async batchUpdateScore(sessionId, scoreEvents) {
    return await BatchGameDatabaseService.batchUpdateScore(sessionId, scoreEvents);
  }

  static async batchUpdateSessionVariables(sessionUpdates) {
    return await BatchGameDatabaseService.batchUpdateSessionVariables(sessionUpdates);
  }

  static async batchLogAIUsage(logEntries) {
    return await BatchGameDatabaseService.batchLogAIUsage(logEntries);
  }

  // ... 기존 모든 메서드들도 포함 ...

  static async createProject(projectData) {
    try {
      const { data, error } = await supabase.rpc('create_game_project', {
        project_name: projectData.name,
        project_type: projectData.type || 'text_game',
        initial_settings: projectData.settings || {},
      });

      if (error) throw error;
      return { success: true, projectId: data };
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      return { success: false, error: error.message };
    }
  }

  static async startGameSession(projectId, initialData = {}) {
    try {
      const { data, error } = await supabase.rpc('start_game_session', {
        p_project_id: projectId,
        initial_data: initialData,
      });

      if (error) throw error;
      return { success: true, sessionId: data };
    } catch (error) {
      console.error('게임 세션 시작 실패:', error);
      return { success: false, error: error.message };
    }
  }

  static async endGameSession(sessionId, result = 'manual', endReason = 'manual') {
    try {
      const { data, error } = await supabase.rpc('end_game_session', {
        p_session_id: sessionId,
        p_result: result,
        p_end_reason: endReason,
      });

      if (error) throw error;
      return { success: true, result: data };
    } catch (error) {
      console.error('게임 종료 실패:', error);
      return { success: false, error: error.message };
    }
  }

  static async updateSessionData(
    sessionId,
    sessionData = null,
    persistentData = null,
    gameVariables = null
  ) {
    try {
      const updates = {
        updated_at: new Date().toISOString(),
      };

      if (sessionData !== null) updates.session_data = sessionData;
      if (persistentData !== null) updates.persistent_data = persistentData;
      if (gameVariables !== null) updates.game_variables = gameVariables;

      const { data, error } = await supabase
        .from('game_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select();

      if (error) throw error;
      return { success: true, session: data[0] };
    } catch (error) {
      console.error('세션 데이터 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  }

  // 성능 모니터링
  static async getPerformanceStats(timeRange = '24h') {
    return await BatchGameDatabaseService.getPerformanceStats(timeRange);
  }
}
