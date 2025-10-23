/**
 * ⚡ 성능 최적화된 게임 엔진
 * 배치 처리로 DB 호출 최소화, 메모리 캐싱 활용
 */

'use client';

import GameDatabaseService from '../../services/GameDatabaseService';

// 배치 처리 매니저
class BatchProcessor {
  constructor() {
    this.scoreQueue = new Map(); // sessionId -> scoreEvents[]
    this.batchTimeout = null;
    this.batchInterval = 2000; // 2초마다 배치 처리
    this.maxBatchSize = 10; // 최대 10개씩 배치
  }

  // 점수 이벤트 큐에 추가
  addScoreEvent(sessionId, scoreEvent) {
    if (!this.scoreQueue.has(sessionId)) {
      this.scoreQueue.set(sessionId, []);
    }

    this.scoreQueue.get(sessionId).push(scoreEvent);

    // 큐가 가득 찬 세션이 있으면 즉시 처리
    if (this.scoreQueue.get(sessionId).length >= this.maxBatchSize) {
      this.processBatchForSession(sessionId);
    } else {
      // 아니면 타이머 설정
      this.scheduleBatchProcessing();
    }
  }

  // 배치 처리 스케줄링
  scheduleBatchProcessing() {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(() => {
      this.processAllBatches();
      this.batchTimeout = null;
    }, this.batchInterval);
  }

  // 특정 세션의 배치 처리
  async processBatchForSession(sessionId) {
    const events = this.scoreQueue.get(sessionId);
    if (!events || events.length === 0) return;

    try {
      // 배치로 점수 이벤트 처리
      await GameDatabaseService.batchUpdateScore(sessionId, events);

      // 큐에서 제거
      this.scoreQueue.delete(sessionId);

      console.log(`✅ 배치 처리 완료: ${sessionId} (${events.length}개 이벤트)`);
    } catch (error) {
      console.error('❌ 배치 처리 실패:', error);
      // 실패한 이벤트는 다시 시도하거나 로그에 기록
    }
  }

  // 모든 세션의 배치 처리
  async processAllBatches() {
    const sessionIds = Array.from(this.scoreQueue.keys());

    await Promise.allSettled(sessionIds.map(sessionId => this.processBatchForSession(sessionId)));
  }

  // 강제 플러시 (게임 종료 시 등)
  async flushAll() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    await this.processAllBatches();
  }
}

// 메모리 캐시 매니저
class GameCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5분 캐시
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const cached = this.cache.get(key);

    if (!cached) return null;

    // 만료 체크
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

// 최적화된 FlexibleGameEngine
export class OptimizedGameEngine {
  constructor(config = {}) {
    // 기존 FlexibleGameEngine의 모든 속성
    this.gameId = config.gameId || `game_${Date.now()}`;
    this.playerId = config.playerId || `player_${Date.now()}`;
    this.projectId = config.projectId || null;
    this.sessionId = null;
    this.enableDatabase = config.enableDatabase !== false;
    this.currentTurn = 0;

    // 성능 최적화 컴포넌트들
    this.batchProcessor = new BatchProcessor();
    this.cache = new GameCache();
    this.pendingOperations = new Set(); // 중복 요청 방지

    // 로컬 상태 (캐시 역할)
    this.localGameState = {
      status: 'waiting',
      score: config.initialScore || 0,
      variables: new Map(),
      sessionData: {},
      persistentData: {},
    };

    // 설정
    this.config = {
      scoreRules: {
        win: 100,
        lose: -50,
        achievement: 150,
        bonus: 25,
        penalty: -10,
        ...config.scoreRules,
      },
      endConditions: {
        maxTurns: null,
        timeLimit: null,
        scoreThreshold: null,
        ...config.endConditions,
      },
      // 성능 관련 설정
      performance: {
        batchInterval: 2000, // 배치 처리 간격
        maxBatchSize: 10, // 최대 배치 크기
        cacheTimeout: 300000, // 캐시 만료 시간 (5분)
        enableLocalCache: true,
        enableBatchProcessing: true,
        ...config.performance,
      },
    };

    // 이벤트 핸들러
    this.eventHandlers = new Map();
    this.scoreHistory = [];
  }

  // 🚀 최적화된 게임 시작
  async startGame(initialData = {}) {
    const operationId = `start_${this.gameId}`;

    // 중복 요청 방지
    if (this.pendingOperations.has(operationId)) {
      console.warn('게임 시작이 이미 진행 중입니다');
      return false;
    }

    this.pendingOperations.add(operationId);

    try {
      this.localGameState.status = 'active';
      this.localGameState.sessionData = { ...initialData };

      // 데이터베이스 세션 시작 (비동기)
      if (this.enableDatabase && this.projectId) {
        const sessionResult = await GameDatabaseService.startGameSession(
          this.projectId,
          initialData
        );

        if (sessionResult.success) {
          this.sessionId = sessionResult.sessionId;
          console.log('🎮 DB 세션 시작:', this.sessionId);
        }
      }

      this.emit('gameStarted', {
        gameId: this.gameId,
        sessionId: this.sessionId,
        startTime: Date.now(),
        initialData,
      });

      return true;
    } catch (error) {
      console.error('게임 시작 오류:', error);
      throw error;
    } finally {
      this.pendingOperations.delete(operationId);
    }
  }

  // ⚡ 최적화된 점수 업데이트 (배치 처리)
  async updateScore(event, amount = null, reason = '') {
    if (this.localGameState.status !== 'active') {
      return false;
    }

    // 1. 로컬 상태 즉시 업데이트 (반응성)
    const scoreChange = amount !== null ? amount : this.config.scoreRules[event] || 0;
    const oldScore = this.localGameState.score;
    this.localGameState.score += scoreChange;
    this.currentTurn++;

    const scoreRecord = {
      timestamp: Date.now(),
      event,
      oldScore,
      newScore: this.localGameState.score,
      change: scoreChange,
      reason,
      turn: this.currentTurn,
    };

    this.scoreHistory.push(scoreRecord);

    // 2. 즉시 UI 업데이트를 위한 이벤트 발생
    this.emit('scoreChanged', scoreRecord);

    // 3. 데이터베이스 업데이트는 배치로 처리 (성능)
    if (this.enableDatabase && this.sessionId && this.config.performance.enableBatchProcessing) {
      this.batchProcessor.addScoreEvent(this.sessionId, {
        event_type: event,
        score_change: scoreChange,
        old_score: oldScore,
        new_score: this.localGameState.score,
        reason,
        turn_number: this.currentTurn,
        timestamp: scoreRecord.timestamp,
      });
    } else if (this.enableDatabase && this.sessionId) {
      // 배치 처리가 비활성화되면 즉시 처리
      try {
        await GameDatabaseService.updateScore(
          this.sessionId,
          event,
          scoreChange,
          reason,
          this.currentTurn
        );
      } catch (error) {
        console.error('점수 업데이트 DB 오류:', error);
      }
    }

    // 4. 종료 조건 체크 (로컬 상태 기반)
    await this.checkEndConditions();

    return scoreRecord;
  }

  // 💾 최적화된 변수 관리 (캐싱)
  async setVariable(key, value, persistence = 'session') {
    this.localGameState.variables.set(key, {
      value,
      persistence,
      timestamp: Date.now(),
    });

    // 캐시 업데이트
    if (this.config.performance.enableLocalCache) {
      this.cache.set(`var_${key}`, { value, persistence });
    }

    // 데이터베이스 업데이트는 디바운스 처리
    this.debounceVariableUpdate();

    this.emit('variableChanged', { key, value, persistence });
  }

  getVariable(key, defaultValue = null) {
    // 1. 로컬 상태에서 먼저 확인
    const localVar = this.localGameState.variables.get(key);
    if (localVar) {
      return localVar.value;
    }

    // 2. 캐시에서 확인
    if (this.config.performance.enableLocalCache) {
      const cached = this.cache.get(`var_${key}`);
      if (cached) {
        return cached.value;
      }
    }

    return defaultValue;
  }

  // 변수 업데이트 디바운싱
  debounceVariableUpdate() {
    if (this.variableUpdateTimeout) {
      clearTimeout(this.variableUpdateTimeout);
    }

    this.variableUpdateTimeout = setTimeout(async () => {
      if (this.enableDatabase && this.sessionId) {
        try {
          const variablesObj = Object.fromEntries(this.localGameState.variables);
          await GameDatabaseService.updateSessionData(
            this.sessionId,
            this.localGameState.sessionData,
            this.localGameState.persistentData,
            variablesObj
          );
        } catch (error) {
          console.error('변수 DB 업데이트 오류:', error);
        }
      }
    }, 1000); // 1초 디바운스
  }

  // 🏁 최적화된 게임 종료 (강제 플러시)
  async endGame(reason = 'manual', finalData = {}) {
    if (this.localGameState.status !== 'active') {
      return false;
    }

    try {
      // 1. 로컬 상태 업데이트
      this.localGameState.status = 'finished';

      // 2. 배치 처리 강제 플러시
      if (this.config.performance.enableBatchProcessing) {
        await this.batchProcessor.flushAll();
      }

      // 3. 변수 업데이트 강제 실행
      if (this.variableUpdateTimeout) {
        clearTimeout(this.variableUpdateTimeout);
        this.debounceVariableUpdate();
      }

      // 4. 게임 종료 처리
      let result = 'manual';
      if (
        reason === 'scoreThreshold' &&
        this.localGameState.score >= (this.config.endConditions.scoreThreshold || 1000)
      ) {
        result = 'win';
      } else if (reason === 'timeLimit') {
        result = 'timeout';
      }

      const gameResult = {
        gameId: this.gameId,
        sessionId: this.sessionId,
        finalScore: this.localGameState.score,
        scoreHistory: this.scoreHistory,
        reason,
        result,
        finalData,
      };

      // 5. 데이터베이스에 최종 결과 저장
      if (this.enableDatabase && this.sessionId) {
        try {
          const dbResult = await GameDatabaseService.endGameSession(this.sessionId, result, reason);
          gameResult.dbResult = dbResult.result;
        } catch (error) {
          console.error('게임 종료 DB 오류:', error);
        }
      }

      this.emit('gameEnded', gameResult);

      // 6. 정리 작업
      this.cache.clear();

      return gameResult;
    } catch (error) {
      console.error('게임 종료 오류:', error);
      throw error;
    }
  }

  // 📊 최적화된 통계 조회 (캐싱)
  async getGameStats() {
    const cacheKey = `stats_${this.sessionId || this.gameId}`;

    // 캐시에서 먼저 확인
    if (this.config.performance.enableLocalCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        // 실시간 데이터만 업데이트
        cached.currentScore = this.localGameState.score;
        cached.currentTurn = this.currentTurn;
        cached.status = this.localGameState.status;
        return cached;
      }
    }

    // 기본 통계 생성
    const stats = {
      gameId: this.gameId,
      projectId: this.projectId,
      sessionId: this.sessionId,
      status: this.localGameState.status,
      currentScore: this.localGameState.score,
      currentTurn: this.currentTurn,
      scoreChanges: this.scoreHistory.length,
      variables: Object.fromEntries(this.localGameState.variables),
      config: this.config,
      performance: {
        batchQueueSize: this.batchProcessor.scoreQueue.size,
        cacheSize: this.cache.cache.size,
        pendingOperations: this.pendingOperations.size,
      },
    };

    // 캐시에 저장
    if (this.config.performance.enableLocalCache) {
      this.cache.set(cacheKey, stats);
    }

    return stats;
  }

  // 🔄 성능 최적화 설정 변경
  configurePerformance(newConfig) {
    Object.assign(this.config.performance, newConfig);

    // 배치 처리 설정 적용
    if (this.batchProcessor) {
      this.batchProcessor.batchInterval = this.config.performance.batchInterval;
      this.batchProcessor.maxBatchSize = this.config.performance.maxBatchSize;
    }

    // 캐시 설정 적용
    if (this.cache) {
      this.cache.cacheTimeout = this.config.performance.cacheTimeout;
    }

    console.log('🔧 성능 설정 업데이트:', newConfig);
  }

  // 이벤트 시스템 (기존과 동일)
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`이벤트 핸들러 오류 (${eventType}):`, error);
        }
      });
    }
  }

  // 조건 체크 (로컬 상태 기반)
  async checkEndConditions() {
    const conditions = this.config.endConditions;

    if (conditions.scoreThreshold !== null) {
      if (this.localGameState.score >= conditions.scoreThreshold) {
        await this.endGame('scoreThreshold', { threshold: conditions.scoreThreshold });
        return true;
      }
    }

    if (conditions.maxTurns !== null) {
      if (this.currentTurn >= conditions.maxTurns) {
        await this.endGame('maxTurns', { turns: this.currentTurn });
        return true;
      }
    }

    return false;
  }
}

export default OptimizedGameEngine;
