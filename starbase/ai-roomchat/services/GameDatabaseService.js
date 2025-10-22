/**
 * 🎮 게임 데이터베이스 서비스
 * FlexibleGameEngine과 Supabase 연동을 위한 서비스 클래스
 */

import { supabase } from '../lib/supabase';

export class GameDatabaseService {
  
  // =========================================
  //  🎯 게임 프로젝트 관리
  // =========================================
  
  /**
   * 새 게임 프로젝트 생성
   */
  static async createProject(projectData) {
    try {
      const { data, error } = await supabase.rpc('create_game_project', {
        project_name: projectData.name,
        project_type: projectData.type || 'text_game',
        initial_settings: projectData.settings || {}
      });
      
      if (error) throw error;
      return { success: true, projectId: data };
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 사용자의 게임 프로젝트 목록 조회
   */
  static async getUserProjects(userId) {
    try {
      const { data, error } = await supabase
        .from('game_projects')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return { success: true, projects: data };
    } catch (error) {
      console.error('프로젝트 목록 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 프로젝트 정보 업데이트
   */
  static async updateProject(projectId, updates) {
    try {
      const { data, error } = await supabase
        .from('game_projects')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
        .select();
      
      if (error) throw error;
      return { success: true, project: data[0] };
    } catch (error) {
      console.error('프로젝트 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  // =========================================
  //  📁 프로젝트 파일 관리
  // =========================================
  
  /**
   * 프로젝트 파일 생성/업데이트
   */
  static async saveProjectFile(projectId, filePath, fileType, content) {
    try {
      const { data, error } = await supabase
        .from('project_files')
        .upsert({
          project_id: projectId,
          file_path: filePath,
          file_type: fileType,
          content: content,
          size_bytes: new Blob([content]).size,
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (error) throw error;
      return { success: true, file: data[0] };
    } catch (error) {
      console.error('파일 저장 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 프로젝트 파일 목록 조회
   */
  static async getProjectFiles(projectId) {
    try {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('file_path');
      
      if (error) throw error;
      return { success: true, files: data };
    } catch (error) {
      console.error('파일 목록 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 특정 파일 내용 조회
   */
  static async getProjectFile(projectId, filePath) {
    try {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('file_path', filePath)
        .order('version', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      return { 
        success: true, 
        file: data.length > 0 ? data[0] : null 
      };
    } catch (error) {
      console.error('파일 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  // =========================================
  //  🎮 게임 세션 관리 (FlexibleGameEngine 연동)
  // =========================================
  
  /**
   * 게임 세션 시작
   */
  static async startGameSession(projectId, initialData = {}) {
    try {
      const { data, error } = await supabase.rpc('start_game_session', {
        p_project_id: projectId,
        initial_data: initialData
      });
      
      if (error) throw error;
      return { success: true, sessionId: data };
    } catch (error) {
      console.error('게임 세션 시작 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 점수 업데이트 (FlexibleGameEngine의 updateScore와 연동)
   */
  static async updateScore(sessionId, eventType, scoreChange, reason = null, turnNumber = null) {
    try {
      const { data, error } = await supabase.rpc('update_game_score', {
        p_session_id: sessionId,
        p_event_type: eventType,
        p_score_change: scoreChange,
        p_reason: reason,
        p_turn_number: turnNumber
      });
      
      if (error) throw error;
      return { success: true, result: data };
    } catch (error) {
      console.error('점수 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 게임 종료 (FlexibleGameEngine의 endGame과 연동)
   */
  static async endGameSession(sessionId, result = 'manual', endReason = 'manual') {
    try {
      const { data, error } = await supabase.rpc('end_game_session', {
        p_session_id: sessionId,
        p_result: result,
        p_end_reason: endReason
      });
      
      if (error) throw error;
      return { success: true, result: data };
    } catch (error) {
      console.error('게임 종료 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 현재 활성 세션 조회
   */
  static async getActiveSession(projectId, userId) {
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .in('status', ['waiting', 'active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      return { 
        success: true, 
        session: data.length > 0 ? data[0] : null 
      };
    } catch (error) {
      console.error('활성 세션 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 세션 데이터 업데이트 (게임 변수, 상태 등)
   */
  static async updateSessionData(sessionId, sessionData = null, persistentData = null, gameVariables = null) {
    try {
      const updates = {
        updated_at: new Date().toISOString()
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
  
  /**
   * 점수 이벤트 히스토리 조회
   */
  static async getScoreHistory(sessionId) {
    try {
      const { data, error } = await supabase
        .from('score_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at');
      
      if (error) throw error;
      return { success: true, events: data };
    } catch (error) {
      console.error('점수 히스토리 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  // =========================================
  //  🤖 AI API 관리
  // =========================================
  
  /**
   * 사용자의 AI API 설정 조회
   */
  static async getUserAIConfigs(userId) {
    try {
      const { data, error } = await supabase
        .from('ai_api_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('enabled', true)
        .order('provider');
      
      if (error) throw error;
      return { success: true, configs: data };
    } catch (error) {
      console.error('AI 설정 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * AI API 설정 저장/업데이트
   */
  static async saveAIConfig(configData) {
    try {
      const { data, error } = await supabase
        .from('ai_api_configs')
        .upsert({
          user_id: configData.userId,
          provider: configData.provider,
          model_name: configData.modelName,
          api_key_encrypted: configData.apiKeyEncrypted,
          endpoint_url: configData.endpointUrl,
          enabled: configData.enabled !== false,
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (error) throw error;
      return { success: true, config: data[0] };
    } catch (error) {
      console.error('AI 설정 저장 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * API 테스트 결과 업데이트
   */
  static async updateAPITestResult(configId, status, errorMessage = null) {
    try {
      const { error } = await supabase.rpc('update_api_test_result', {
        p_config_id: configId,
        p_status: status,
        p_error_message: errorMessage
      });
      
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('API 테스트 결과 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * AI 도우미 사용 로그 기록
   */
  static async logAIAssistantUsage(logData) {
    try {
      const { data, error } = await supabase
        .from('ai_assistant_logs')
        .insert({
          user_id: logData.userId,
          project_id: logData.projectId,
          provider: logData.provider,
          model_name: logData.modelName,
          programming_language: logData.programmingLanguage,
          user_message: logData.userMessage,
          ai_response: logData.aiResponse,
          generated_code: logData.generatedCode,
          execution_success: logData.executionSuccess,
          execution_result: logData.executionResult,
          execution_error: logData.executionError,
          response_time_ms: logData.responseTimeMs,
          tokens_used: logData.tokensUsed,
          cost_estimate: logData.costEstimate
        })
        .select();
      
      if (error) throw error;
      return { success: true, log: data[0] };
    } catch (error) {
      console.error('AI 사용 로그 기록 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  // =========================================
  //  📊 통계 및 분석
  // =========================================
  
  /**
   * 사용자 게임 통계 조회
   */
  static async getUserGameStats(userId) {
    try {
      // 프로젝트 통계
      const { data: projectStats, error: projectError } = await supabase
        .from('game_projects')
        .select('project_type, status, play_count, likes_count')
        .eq('user_id', userId);
      
      if (projectError) throw projectError;
      
      // 세션 통계
      const { data: sessionStats, error: sessionError } = await supabase
        .from('game_sessions')
        .select('status, result, current_score, duration_seconds')
        .eq('user_id', userId);
      
      if (sessionError) throw sessionError;
      
      // AI 사용 통계
      const { data: aiStats, error: aiError } = await supabase
        .from('ai_assistant_logs')
        .select('provider, programming_language, execution_success')
        .eq('user_id', userId);
      
      if (aiError) throw aiError;
      
      return { 
        success: true, 
        stats: {
          projects: projectStats,
          sessions: sessionStats,
          aiUsage: aiStats
        }
      };
    } catch (error) {
      console.error('사용자 통계 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 인기 프로젝트 조회
   */
  static async getPopularProjects(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('game_projects')
        .select('id, name, description, project_type, play_count, likes_count, user_id')
        .eq('is_public', true)
        .order('play_count', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return { success: true, projects: data };
    } catch (error) {
      console.error('인기 프로젝트 조회 실패:', error);
      return { success: false, error: error.message };
    }
  }
  
  // =========================================
  //  🔄 실시간 업데이트
  // =========================================
  
  /**
   * 게임 세션 실시간 구독
   */
  static subscribeToGameSession(sessionId, onUpdate) {
    return supabase
      .channel(`game_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`
        },
        onUpdate
      )
      .subscribe();
  }
  
  /**
   * 점수 이벤트 실시간 구독
   */
  static subscribeToScoreEvents(sessionId, onScoreUpdate) {
    return supabase
      .channel(`score_events_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'score_events',
          filter: `session_id=eq.${sessionId}`
        },
        onScoreUpdate
      )
      .subscribe();
  }
  
  /**
   * 프로젝트 파일 변경 실시간 구독
   */
  static subscribeToProjectFiles(projectId, onFileUpdate) {
    return supabase
      .channel(`project_files_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_files',
          filter: `project_id=eq.${projectId}`
        },
        onFileUpdate
      )
      .subscribe();
  }
}

export default GameDatabaseService;