/**
 * 🏆 통합 게임 엔진 - 모든 서비스 연동
 * 보안, 성능, 오프라인, 분석 기능 통합
 */

'use client';

import SecureAIService from './SecureAIService';
import OfflineGameEngine from './OfflineGameEngine';
import GameAnalyticsService from './GameAnalyticsService';
import EnhancedGameDatabaseService from './EnhancedGameDatabaseService';
import { getGameContextManager, GameContext } from './GameContextManager';

class IntegratedGameEngine {
  constructor(config = {}) {
    this.config = {
      enableOfflineMode: true,
      enableAnalytics: true,
      enableSecureAI: true,
      enableBatchProcessing: true,
      aiRequestTimeout: 30000,
      maxRetries: 3,
      debugMode: false,
      ...config,
    };

    // 상태 관리
    this.gameState = {
      sessionId: null,
      gameId: null,
      playerId: null,
      gameType: null,
      isOnline: navigator?.onLine ?? true,
      score: 0,
      level: 1,
      lives: 3,
      powerUps: [],
      variables: new Map(),
      history: [],
    };

    // 서비스 인스턴스들
    this.services = {};

    // 게임 컨텍스트 매니저
    this.contextManager = getGameContextManager();

    // 초기화
    this.initializeServices();
    this.setupEventHandlers();
    this.setupContextIntegration();

    this.log('🚀 통합 게임 엔진 초기화됨');
  }

  // 서비스 초기화
  async initializeServices() {
    try {
      // 보안 AI 서비스
      if (this.config.enableSecureAI) {
        this.services.ai = new SecureAIService({
          timeout: this.config.aiRequestTimeout,
          maxRetries: this.config.maxRetries,
        });
        this.log('🔒 보안 AI 서비스 초기화됨');
      }

      // 오프라인 엔진
      if (this.config.enableOfflineMode) {
        this.services.offline = new OfflineGameEngine();
        this.log('📱 오프라인 엔진 초기화됨');
      }

      // 분석 서비스
      if (this.config.enableAnalytics) {
        this.services.analytics = new GameAnalyticsService({
          enableConsoleLog: this.config.debugMode,
        });
        this.log('📊 분석 서비스 초기화됨');
      }

      // 데이터베이스 서비스
      if (this.config.enableBatchProcessing) {
        this.services.database = new EnhancedGameDatabaseService();
        this.log('💾 향상된 데이터베이스 서비스 초기화됨');
      }
    } catch (error) {
      console.error('❌ 서비스 초기화 오류:', error);
      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'service_initialization' });
      }
    }
  }

  // 이벤트 핸들러 설정
  setupEventHandlers() {
    // 네트워크 상태 변경
    if (this.services.offline) {
      this.services.offline.on('networkChange', ({ online }) => {
        this.gameState.isOnline = online;
        this.log(online ? '🌐 온라인 모드' : '📱 오프라인 모드');

        if (this.services.analytics) {
          this.services.analytics.trackUserAction('network_change', { online });
        }
      });

      // 오프라인 데이터 동기화 완료
      this.services.offline.on('syncComplete', ({ eventsSynced }) => {
        this.log('🔄 동기화 완료:', eventsSynced, '개 이벤트');

        if (this.services.analytics) {
          this.services.analytics.trackGameEvent('sync_complete', { eventsSynced });
        }
      });
    }
  }

  // 게임 세션 시작
  async startGameSession(gameType, gameId, playerId) {
    try {
      this.gameState.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.gameState.gameId = gameId;
      this.gameState.playerId = playerId;
      this.gameState.gameType = gameType;
      this.gameState.sessionStartTime = Date.now();

      // 🧠 컨텍스트 매니저에 게임 세션 정보 설정
      this.contextManager.setGameState('sessionId', this.gameState.sessionId);
      this.contextManager.setGameState('gameId', gameId);
      this.contextManager.setGameState('gameType', gameType);
      this.contextManager.setGameState('currentLevel', 1);
      this.contextManager.setGameState('totalScore', 0);

      // 플레이어 생성
      if (playerId) {
        this.contextManager.createPlayer(playerId, {
          sessionId: this.gameState.sessionId,
          gameType,
          startTime: Date.now(),
        });
      }

      // 세션 시작 이벤트 로깅
      this.contextManager.logEvent('session_start', {
        gameType,
        gameId,
        playerId,
        sessionId: this.gameState.sessionId,
      });

      // 분석 추적
      if (this.services.analytics) {
        this.services.analytics.trackGameEvent('session_start', {
          gameType,
          gameId,
          playerId,
          sessionId: this.gameState.sessionId,
        });
      }

      // 오프라인에서 게임 상태 로드 시도
      if (this.services.offline && !this.gameState.isOnline) {
        const savedState = await this.services.offline.loadGameState(gameId);
        if (savedState) {
          this.gameState = { ...this.gameState, ...savedState };

          // 복원된 상태를 컨텍스트에 반영
          if (savedState.score !== undefined) {
            this.contextManager.setPlayerData(playerId, 'score', savedState.score);
          }
          if (savedState.level !== undefined) {
            this.contextManager.setGameState('currentLevel', savedState.level);
          }

          this.log('📂 오프라인에서 게임 상태 복원됨');
        }
      }

      this.log('🎮 게임 세션 시작:', this.gameState.sessionId);
      return this.gameState.sessionId;
    } catch (error) {
      console.error('❌ 게임 세션 시작 오류:', error);

      // 컨텍스트에 오류 로깅
      this.contextManager.logEvent('session_start_error', {
        gameType,
        gameId,
        playerId,
        error: error.message,
      });

      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'start_game_session' });
      }
      throw error;
    }
  }

  // 컨텍스트 통합 설정
  setupContextIntegration() {
    // 게임 상태 변화를 컨텍스트 매니저와 동기화
    this.contextManager.addContextListener(changeData => {
      // 분석 서비스에 컨텍스트 변화 알림
      if (this.services.analytics) {
        this.services.analytics.trackGameEvent('context_change', changeData);
      }

      // 게임 상태와 컨텍스트 매니저 동기화
      if (changeData.type === 'gameState') {
        this.gameState[changeData.key] = changeData.newValue;
      }
    });

    // 초기 게임 상태를 컨텍스트에 설정
    this.contextManager.setGameState('sessionId', this.gameState.sessionId);
    this.contextManager.setGameState('gameId', this.gameState.gameId);
    this.contextManager.setGameState('isOnline', this.gameState.isOnline);

    this.log('🔗 컨텍스트 통합 설정 완료');
  }

  // AI 코드 생성 (보안 및 오프라인 지원, 컨텍스트 인식)
  async generateCode(prompt, context = {}) {
    const startTime = Date.now();

    try {
      // 성능 추적 시작
      if (this.services.analytics) {
        this.services.analytics.trackPerformance('ai_request_start', startTime);
      }

      // 🧠 현재 게임 컨텍스트를 AI 프롬프트에 포함
      const gameContext = this.contextManager.generateAIContext();
      const enrichedPrompt = this.enrichPromptWithContext(prompt, gameContext, context);

      let result = null;

      // 오프라인 상태에서 캐시 확인
      if (!this.gameState.isOnline && this.services.offline) {
        result = await this.services.offline.getCachedAIResponse(enrichedPrompt, 'any');
        if (result) {
          this.log('📂 오프라인 캐시에서 AI 응답 사용');

          if (this.services.analytics) {
            this.services.analytics.trackAIRequest('cached', prompt, Date.now() - startTime, true);
          }

          return result;
        }
      }

      // 온라인 상태에서 보안 AI 서비스 사용
      if (this.gameState.isOnline && this.services.ai) {
        result = await this.services.ai.generateCode(enrichedPrompt, {
          ...context,
          gameContext: gameContext,
        });

        const responseTime = Date.now() - startTime;

        // 응답 캐싱
        if (this.services.offline) {
          await this.services.offline.cacheAIResponse(enrichedPrompt, result, 'secure');
        }

        // AI 요청을 컨텍스트에 로깅
        this.contextManager.logEvent('ai_code_generation', {
          prompt: prompt.substring(0, 100),
          responseTime,
          success: true,
          contextUsed: true,
        });

        // 분석 추적
        if (this.services.analytics) {
          this.services.analytics.trackAIRequest('secure', prompt, responseTime, true);
          this.services.analytics.trackPerformance('ai_response_time', responseTime);
        }

        this.log('🤖 AI 코드 생성 성공 (컨텍스트 포함):', responseTime, 'ms');
        return result;
      }

      // AI 서비스 사용 불가능한 경우
      throw new Error('AI 서비스를 사용할 수 없습니다 (오프라인 상태이며 캐시된 응답 없음)');
    } catch (error) {
      const responseTime = Date.now() - startTime;

      console.error('❌ AI 코드 생성 오류:', error);

      // 오류를 컨텍스트에 로깅
      this.contextManager.logEvent('ai_code_generation_error', {
        prompt: prompt.substring(0, 100),
        error: error.message,
        responseTime,
      });

      if (this.services.analytics) {
        this.services.analytics.trackAIRequest('error', prompt, responseTime, false);
        this.services.analytics.trackError(error, {
          context: 'ai_code_generation',
          prompt: prompt.substring(0, 100),
        });
      }

      throw error;
    }
  }

  // AI 프롬프트에 게임 컨텍스트 추가
  enrichPromptWithContext(originalPrompt, gameContext, additionalContext = {}) {
    const contextInfo = [];

    // 게임 기본 정보
    if (gameContext.summary) {
      contextInfo.push(`현재 게임 상황: ${gameContext.summary}`);
    }

    // 플레이어 정보
    const playerCount = Object.keys(gameContext.players).length;
    if (playerCount > 0) {
      contextInfo.push(`플레이어 ${playerCount}명 활성화`);

      // 주요 플레이어 정보
      for (const [playerId, data] of Object.entries(gameContext.players)) {
        if (data.score !== undefined) {
          contextInfo.push(`${playerId}: ${data.score}점`);
        }
      }
    }

    // 중요한 변수들
    const importantVars = [];
    for (const [name, variable] of Object.entries(gameContext.variables)) {
      if (variable.type === 'static' || variable.description) {
        importantVars.push(`${name}: ${variable.value} (${variable.description})`);
      }
    }

    if (importantVars.length > 0) {
      contextInfo.push(`게임 변수: ${importantVars.join(', ')}`);
    }

    // 최근 이벤트
    if (gameContext.recentEvents && gameContext.recentEvents.length > 0) {
      const recentEventTypes = gameContext.recentEvents
        .slice(-3)
        .map(e => e.type)
        .join(', ');
      contextInfo.push(`최근 이벤트: ${recentEventTypes}`);
    }

    // 컨텍스트가 있으면 프롬프트에 추가
    if (contextInfo.length > 0) {
      return `
게임 컨텍스트:
${contextInfo.join('\n')}

사용자 요청:
${originalPrompt}

위 게임 컨텍스트를 고려하여 요청을 처리해주세요.`;
    }

    return originalPrompt;
  }

  // 점수 업데이트 (배치 처리 및 오프라인 지원, 컨텍스트 연동)
  async updateScore(scoreChange, reason = 'game_action') {
    try {
      const oldScore = this.gameState.score;
      this.gameState.score += scoreChange;

      // 🧠 컨텍스트 매니저에 점수 업데이트 알림
      if (this.gameState.playerId) {
        this.contextManager.updateScore(this.gameState.playerId, scoreChange, reason);
      }

      // 게임 상태도 업데이트
      this.contextManager.setGameState('totalScore', this.gameState.score);

      const scoreEvent = {
        sessionId: this.gameState.sessionId,
        gameId: this.gameState.gameId,
        playerId: this.gameState.playerId,
        scoreChange,
        newScore: this.gameState.score,
        reason,
        timestamp: Date.now(),
      };

      // 온라인 상태에서 배치 처리
      if (this.gameState.isOnline && this.services.database) {
        await this.services.database.batchUpdateScore([scoreEvent]);
      } else if (this.services.offline) {
        // 오프라인에서 큐에 추가
        await this.services.offline.queueScoreEvent(scoreEvent);
      }

      // 분석 추적
      if (this.services.analytics) {
        this.services.analytics.trackGameEvent('score_update', {
          oldScore,
          newScore: this.gameState.score,
          change: scoreChange,
          reason,
        });
      }

      this.log(
        '🎯 점수 업데이트:',
        oldScore,
        '->',
        this.gameState.score,
        `(${scoreChange > 0 ? '+' : ''}${scoreChange})`
      );
      return this.gameState.score;
    } catch (error) {
      console.error('❌ 점수 업데이트 오류:', error);

      // 컨텍스트에 오류 로깅
      this.contextManager.logEvent('score_update_error', {
        scoreChange,
        reason,
        error: error.message,
      });

      if (this.services.analytics) {
        this.services.analytics.trackError(error, {
          context: 'score_update',
          scoreChange,
          currentScore: this.gameState.score,
        });
      }

      throw error;
    }
  }

  // 게임 상태 저장 (오프라인 지원)
  async saveGameState() {
    try {
      const stateToSave = {
        ...this.gameState,
        lastSaved: Date.now(),
      };

      // 온라인/오프라인에 따라 다른 저장 방식
      if (this.gameState.isOnline && this.services.database) {
        await this.services.database.saveGameState(stateToSave);
        this.log('💾 게임 상태 온라인 저장됨');
      } else if (this.services.offline) {
        await this.services.offline.saveGameState(stateToSave);
        this.log('📱 게임 상태 오프라인 저장됨');
      }

      // 분석 추적
      if (this.services.analytics) {
        this.services.analytics.trackGameEvent('state_save', {
          online: this.gameState.isOnline,
          gameId: this.gameState.gameId,
        });
      }

      return stateToSave;
    } catch (error) {
      console.error('❌ 게임 상태 저장 오류:', error);

      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'save_game_state' });
      }

      throw error;
    }
  }

  // 게임 상태 로드
  async loadGameState(gameId) {
    try {
      let loadedState = null;

      // 온라인 상태에서 데이터베이스에서 로드
      if (this.gameState.isOnline && this.services.database) {
        loadedState = await this.services.database.loadGameState(gameId);
        this.log('🌐 온라인에서 게임 상태 로드됨');
      } else if (this.services.offline) {
        // 오프라인에서 로컬 저장소에서 로드
        loadedState = await this.services.offline.loadGameState(gameId);
        this.log('📱 오프라인에서 게임 상태 로드됨');
      }

      if (loadedState) {
        this.gameState = { ...this.gameState, ...loadedState };

        // 분석 추적
        if (this.services.analytics) {
          this.services.analytics.trackGameEvent('state_load', {
            online: this.gameState.isOnline,
            gameId,
          });
        }
      }

      return loadedState;
    } catch (error) {
      console.error('❌ 게임 상태 로드 오류:', error);

      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'load_game_state' });
      }

      throw error;
    }
  }

  // 게임 변수 설정
  setGameVariable(key, value) {
    const oldValue = this.gameState.variables.get(key);
    this.gameState.variables.set(key, value);

    // 분석 추적
    if (this.services.analytics) {
      this.services.analytics.trackGameEvent('variable_change', {
        key,
        oldValue,
        newValue: value,
      });
    }

    this.log('🔧 게임 변수 설정:', key, '=', value);
  }

  // 게임 변수 조회
  getGameVariable(key, defaultValue = null) {
    return this.gameState.variables.get(key) ?? defaultValue;
  }

  // 레벨 업
  async levelUp() {
    try {
      const oldLevel = this.gameState.level;
      this.gameState.level++;

      // 🧠 컨텍스트 매니저에 레벨업 알림
      if (this.gameState.playerId) {
        this.contextManager.levelUp(this.gameState.playerId);
      }
      this.contextManager.setGameState('currentLevel', this.gameState.level);

      // 분석 추적
      if (this.services.analytics) {
        this.services.analytics.trackGameEvent('level_up', {
          oldLevel,
          newLevel: this.gameState.level,
          score: this.gameState.score,
        });
      }

      // 상태 저장
      await this.saveGameState();

      this.log('🆙 레벨업!', oldLevel, '->', this.gameState.level);
      return this.gameState.level;
    } catch (error) {
      console.error('❌ 레벨업 오류:', error);

      // 컨텍스트에 오류 로깅
      this.contextManager.logEvent('level_up_error', {
        currentLevel: this.gameState.level,
        error: error.message,
      });

      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'level_up' });
      }

      throw error;
    }
  }

  // 파워업 획득
  addPowerUp(powerUpType, duration = null) {
    const powerUp = {
      type: powerUpType,
      acquiredAt: Date.now(),
      duration,
      expiresAt: duration ? Date.now() + duration : null,
    };

    this.gameState.powerUps.push(powerUp);

    // 분석 추적
    if (this.services.analytics) {
      this.services.analytics.trackGameEvent('power_up_acquired', {
        type: powerUpType,
        duration,
      });
    }

    this.log('⚡ 파워업 획득:', powerUpType);
    return powerUp;
  }

  // 만료된 파워업 정리
  cleanupExpiredPowerUps() {
    const now = Date.now();
    const initialCount = this.gameState.powerUps.length;

    this.gameState.powerUps = this.gameState.powerUps.filter(powerUp => {
      if (powerUp.expiresAt && powerUp.expiresAt <= now) {
        // 분석 추적
        if (this.services.analytics) {
          this.services.analytics.trackGameEvent('power_up_expired', {
            type: powerUp.type,
            duration: now - powerUp.acquiredAt,
          });
        }
        return false;
      }
      return true;
    });

    const removedCount = initialCount - this.gameState.powerUps.length;
    if (removedCount > 0) {
      this.log('🧹 만료된 파워업 정리:', removedCount, '개');
    }
  }

  // 게임 세션 종료
  async endGameSession() {
    try {
      const sessionDuration = Date.now() - (this.gameState.sessionStartTime || Date.now());

      // 세션 분석
      if (this.services.analytics) {
        const sessionAnalysis = this.services.analytics.analyzeGameSession({
          finalScore: this.gameState.score,
          finalLevel: this.gameState.level,
          totalSteps: this.gameState.history.length,
          completedSteps: this.gameState.history.filter(h => h.success).length,
          powerUpsUsed: this.gameState.powerUps.length,
        });

        this.services.analytics.trackGameEvent('session_end', {
          sessionDuration,
          finalScore: this.gameState.score,
          analysis: sessionAnalysis,
        });
      }

      // 최종 상태 저장
      await this.saveGameState();

      this.log('🏁 게임 세션 종료. 시간:', sessionDuration, 'ms, 점수:', this.gameState.score);
      return {
        sessionDuration,
        finalScore: this.gameState.score,
        finalLevel: this.gameState.level,
      };
    } catch (error) {
      console.error('❌ 게임 세션 종료 오류:', error);

      if (this.services.analytics) {
        this.services.analytics.trackError(error, { context: 'end_game_session' });
      }

      throw error;
    }
  }

  // 실시간 대시보드 데이터
  getDashboardData() {
    const dashboardData = {
      gameState: { ...this.gameState },
      services: {},
      context: {},
    };

    // 🧠 게임 컨텍스트 정보 추가
    if (this.contextManager) {
      dashboardData.context = {
        aiContext: this.contextManager.generateAIContext(),
        allPlayers: this.contextManager.getAllPlayerData(this.gameState.playerId),
        allVariables: this.contextManager.getAllVariables(),
        recentEvents: this.contextManager.gameEvents.slice(-5),
        summary: this.contextManager.generateGameSummary(),
      };
    }

    // 각 서비스의 대시보드 데이터 수집
    if (this.services.analytics) {
      dashboardData.services.analytics = this.services.analytics.getDashboardData();
    }

    if (this.services.offline) {
      dashboardData.services.offline = {
        isOnline: this.gameState.isOnline,
        syncQueueLength: this.services.offline.syncQueue?.length || 0,
      };
    }

    return dashboardData;
  }

  // 디버그 정보 출력
  getDebugInfo() {
    return {
      gameState: this.gameState,
      services: Object.keys(this.services),
      config: this.config,
      performance: this.services.analytics?.getPerformanceSummary(),
      errors: this.services.analytics?.errorLog?.slice(-5), // 최근 5개 오류
    };
  }

  // 로그 출력
  log(...args) {
    if (this.config.debugMode) {
      console.log('[IntegratedGameEngine]', ...args);
    }
  }
}

export default IntegratedGameEngine;

// Provide a named export for compatibility with older import styles
export { IntegratedGameEngine };
