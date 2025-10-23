/**
 * 🧠 게임 컨텍스트 매니저
 * AI가 게임 상태를 자동으로 인식하고 활용할 수 있는 시스템
 */

'use client';

class GameContextManager {
  constructor() {
    this.gameState = new Map();
    this.playerData = new Map();
    this.gameVariables = new Map();
    this.gameEvents = [];
    this.contextListeners = new Set();

    // 실시간 모니터링 설정
    this.setupRealtimeMonitoring();

    console.log('🧠 GameContextManager 초기화됨');
  }

  // ========================================
  // 📊 게임 상태 관리
  // ========================================

  // 게임 상태 설정
  setGameState(key, value) {
    const oldValue = this.gameState.get(key);
    this.gameState.set(key, value);

    // 변경 이벤트 발생
    this.notifyContextChange({
      type: 'gameState',
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    });

    console.log(`🎮 게임 상태 업데이트: ${key} = ${value}`);
  }

  // 게임 상태 조회
  getGameState(key, defaultValue = null) {
    return this.gameState.get(key) ?? defaultValue;
  }

  // 모든 게임 상태 조회
  getAllGameStates() {
    return Object.fromEntries(this.gameState);
  }

  // ========================================
  // 👤 플레이어 데이터 관리
  // ========================================

  // 플레이어 데이터 설정
  setPlayerData(playerId, key, value) {
    if (!this.playerData.has(playerId)) {
      this.playerData.set(playerId, new Map());
    }

    const playerMap = this.playerData.get(playerId);
    const oldValue = playerMap.get(key);
    playerMap.set(key, value);

    // 변경 이벤트 발생
    this.notifyContextChange({
      type: 'playerData',
      playerId,
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    });

    console.log(`👤 플레이어 데이터 업데이트: ${playerId}.${key} = ${value}`);
  }

  // 플레이어 데이터 조회
  getPlayerData(playerId, key, defaultValue = null) {
    const playerMap = this.playerData.get(playerId);
    return playerMap ? (playerMap.get(key) ?? defaultValue) : defaultValue;
  }

  // 모든 플레이어 데이터 조회
  getAllPlayerData(playerId) {
    const playerMap = this.playerData.get(playerId);
    return playerMap ? Object.fromEntries(playerMap) : {};
  }

  // ========================================
  // 🔧 게임 변수 관리
  // ========================================

  // 게임 변수 설정 (AI가 인식할 수 있는 전역 변수)
  setVariable(name, value, description = '', type = 'dynamic') {
    const oldVariable = this.gameVariables.get(name);

    const variable = {
      name,
      value,
      description,
      type, // 'static', 'dynamic', 'computed'
      lastUpdated: Date.now(),
      updateCount: oldVariable ? oldVariable.updateCount + 1 : 1,
    };

    this.gameVariables.set(name, variable);

    // AI가 인식할 수 있도록 전역에도 설정
    if (typeof window !== 'undefined') {
      window[`game_${name}`] = value;
    }

    // 변경 이벤트 발생
    this.notifyContextChange({
      type: 'variable',
      name,
      oldValue: oldVariable?.value,
      newValue: value,
      description,
      timestamp: Date.now(),
    });

    console.log(`🔧 게임 변수 설정: ${name} = ${value} (${description})`);
  }

  // 게임 변수 조회
  getVariable(name, defaultValue = null) {
    const variable = this.gameVariables.get(name);
    return variable ? variable.value : defaultValue;
  }

  // 모든 게임 변수 조회
  getAllVariables() {
    const result = {};
    for (const [name, variable] of this.gameVariables) {
      result[name] = variable;
    }
    return result;
  }

  // ========================================
  // 🤖 AI 컨텍스트 생성
  // ========================================

  // AI가 이해할 수 있는 현재 게임 컨텍스트 생성
  generateAIContext() {
    const context = {
      timestamp: Date.now(),

      // 기본 게임 정보
      gameInfo: {
        ...this.getAllGameStates(),
        totalPlayers: this.playerData.size,
        gameVariableCount: this.gameVariables.size,
        recentEventsCount: this.gameEvents.length,
      },

      // 플레이어 정보
      players: {},

      // 게임 변수들
      variables: {},

      // 최근 이벤트들 (최근 10개)
      recentEvents: this.gameEvents.slice(-10),

      // 게임 상태 요약
      summary: this.generateGameSummary(),
    };

    // 플레이어 데이터 추가
    for (const [playerId, playerMap] of this.playerData) {
      context.players[playerId] = Object.fromEntries(playerMap);
    }

    // 변수 데이터 추가
    for (const [name, variable] of this.gameVariables) {
      context.variables[name] = {
        value: variable.value,
        description: variable.description,
        type: variable.type,
      };
    }

    return context;
  }

  // 게임 상태 요약 생성
  generateGameSummary() {
    const summary = [];

    // 게임 기본 상태
    const gameType = this.getGameState('gameType');
    if (gameType) {
      summary.push(`게임 유형: ${gameType}`);
    }

    const currentLevel = this.getGameState('currentLevel', 1);
    summary.push(`현재 레벨: ${currentLevel}`);

    const totalScore = this.getGameState('totalScore', 0);
    if (totalScore > 0) {
      summary.push(`총 점수: ${totalScore}`);
    }

    // 플레이어 상태
    if (this.playerData.size > 0) {
      summary.push(`활성 플레이어: ${this.playerData.size}명`);
    }

    // 주요 변수들
    const importantVars = [];
    for (const [name, variable] of this.gameVariables) {
      if (variable.type === 'static' || variable.updateCount > 5) {
        importantVars.push(`${name}: ${variable.value}`);
      }
    }

    if (importantVars.length > 0) {
      summary.push(`주요 변수: ${importantVars.join(', ')}`);
    }

    return summary.join(' | ');
  }

  // ========================================
  // 📝 이벤트 로깅
  // ========================================

  // 게임 이벤트 로깅
  logEvent(type, data = {}) {
    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      gameState: { ...this.getAllGameStates() },
    };

    this.gameEvents.push(event);

    // 최대 1000개 이벤트만 유지
    if (this.gameEvents.length > 1000) {
      this.gameEvents = this.gameEvents.slice(-1000);
    }

    // 실시간 이벤트 알림
    this.notifyContextChange({
      type: 'event',
      event,
      timestamp: Date.now(),
    });

    console.log(`📝 이벤트 로깅: ${type}`, data);
  }

  // ========================================
  // 🔍 스마트 쿼리 시스템
  // ========================================

  // AI가 자연어로 게임 상태를 쿼리할 수 있는 시스템
  queryGameState(question) {
    const context = this.generateAIContext();
    const lowerQuestion = question.toLowerCase();

    // 일반적인 쿼리 패턴 처리
    const queries = {
      // 점수 관련
      점수: () => {
        const scores = [];
        for (const [playerId, data] of this.playerData) {
          const score = data.get('score') || 0;
          scores.push(`${playerId}: ${score}점`);
        }
        return scores.length > 0 ? scores.join(', ') : '점수 정보 없음';
      },

      // 레벨 관련
      레벨: () => {
        return `현재 레벨: ${this.getGameState('currentLevel', 1)}`;
      },

      // 플레이어 관련
      플레이어: () => {
        return `활성 플레이어 ${this.playerData.size}명`;
      },

      // 게임 상태
      상태: () => {
        return this.generateGameSummary();
      },

      // 최근 이벤트
      이벤트: () => {
        const recentEvents = this.gameEvents.slice(-5);
        return recentEvents.map(e => `${e.type}: ${JSON.stringify(e.data)}`).join('\n');
      },
    };

    // 패턴 매칭으로 쿼리 처리
    for (const [pattern, handler] of Object.entries(queries)) {
      if (lowerQuestion.includes(pattern)) {
        return handler();
      }
    }

    // 기본 응답
    return {
      question,
      context: context.summary,
      suggestion: '더 구체적인 질문을 해주세요. 예: "현재 점수는?", "플레이어 상태는?"',
    };
  }

  // ========================================
  // 🔄 실시간 모니터링
  // ========================================

  // 실시간 모니터링 설정
  setupRealtimeMonitoring() {
    // DOM 변화 감지
    if (typeof window !== 'undefined' && window.MutationObserver) {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          // 게임 관련 DOM 요소 변화 감지
          if (mutation.target.id && mutation.target.id.startsWith('game')) {
            this.logEvent('dom_change', {
              elementId: mutation.target.id,
              type: mutation.type,
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-score', 'data-level', 'data-player'],
      });
    }

    // 주기적 상태 스냅샷
    setInterval(() => {
      this.logEvent('periodic_snapshot', {
        gameStates: this.getAllGameStates(),
        playerCount: this.playerData.size,
        variableCount: this.gameVariables.size,
      });
    }, 30000); // 30초마다
  }

  // ========================================
  // 🔔 이벤트 리스너 시스템
  // ========================================

  // 컨텍스트 변경 리스너 추가
  addContextListener(listener) {
    this.contextListeners.add(listener);
  }

  // 컨텍스트 변경 리스너 제거
  removeContextListener(listener) {
    this.contextListeners.delete(listener);
  }

  // 컨텍스트 변경 알림
  notifyContextChange(changeData) {
    for (const listener of this.contextListeners) {
      try {
        listener(changeData);
      } catch (error) {
        console.error('컨텍스트 리스너 오류:', error);
      }
    }
  }

  // ========================================
  // 💾 데이터 직렬화/역직렬화
  // ========================================

  // 전체 컨텍스트를 JSON으로 내보내기
  exportContext() {
    return {
      gameState: Object.fromEntries(this.gameState),
      playerData: Object.fromEntries(
        Array.from(this.playerData.entries()).map(([id, data]) => [id, Object.fromEntries(data)])
      ),
      gameVariables: Object.fromEntries(this.gameVariables),
      recentEvents: this.gameEvents.slice(-100), // 최근 100개만
      timestamp: Date.now(),
    };
  }

  // JSON에서 컨텍스트 가져오기
  importContext(contextData) {
    if (contextData.gameState) {
      this.gameState = new Map(Object.entries(contextData.gameState));
    }

    if (contextData.playerData) {
      this.playerData = new Map(
        Object.entries(contextData.playerData).map(([id, data]) => [
          id,
          new Map(Object.entries(data)),
        ])
      );
    }

    if (contextData.gameVariables) {
      this.gameVariables = new Map(Object.entries(contextData.gameVariables));
    }

    if (contextData.recentEvents) {
      this.gameEvents = contextData.recentEvents;
    }

    console.log('📥 게임 컨텍스트 가져오기 완료');
  }

  // ========================================
  // 🎯 편의 메서드들
  // ========================================

  // 플레이어 생성
  createPlayer(playerId, initialData = {}) {
    this.playerData.set(
      playerId,
      new Map(
        Object.entries({
          id: playerId,
          createdAt: Date.now(),
          score: 0,
          level: 1,
          lives: 3,
          ...initialData,
        })
      )
    );

    this.logEvent('player_created', { playerId, initialData });
    console.log(`👤 플레이어 생성: ${playerId}`);
  }

  // 플레이어 제거
  removePlayer(playerId) {
    if (this.playerData.delete(playerId)) {
      this.logEvent('player_removed', { playerId });
      console.log(`👤 플레이어 제거: ${playerId}`);
    }
  }

  // 점수 업데이트
  updateScore(playerId, scoreChange, reason = 'unknown') {
    const currentScore = this.getPlayerData(playerId, 'score', 0);
    const newScore = currentScore + scoreChange;

    this.setPlayerData(playerId, 'score', newScore);
    this.logEvent('score_update', {
      playerId,
      oldScore: currentScore,
      newScore,
      change: scoreChange,
      reason,
    });
  }

  // 레벨 업
  levelUp(playerId) {
    const currentLevel = this.getPlayerData(playerId, 'level', 1);
    const newLevel = currentLevel + 1;

    this.setPlayerData(playerId, 'level', newLevel);
    this.logEvent('level_up', {
      playerId,
      oldLevel: currentLevel,
      newLevel,
    });

    console.log(`🆙 레벨업: ${playerId} (${currentLevel} → ${newLevel})`);
  }

  // 게임 리셋
  resetGame() {
    this.gameState.clear();
    this.playerData.clear();
    this.gameVariables.clear();
    this.gameEvents = [];

    this.logEvent('game_reset', {});
    console.log('🔄 게임 리셋');
  }
}

// 전역 인스턴스 (싱글톤)
let globalGameContextManager = null;

// 전역 컨텍스트 매니저 가져오기
export function getGameContextManager() {
  if (!globalGameContextManager) {
    globalGameContextManager = new GameContextManager();
  }
  return globalGameContextManager;
}

// 편의 함수들
export const GameContext = {
  // 게임 상태
  setState: (key, value) => getGameContextManager().setGameState(key, value),
  getState: (key, defaultValue) => getGameContextManager().getGameState(key, defaultValue),

  // 플레이어 데이터
  setPlayer: (id, key, value) => getGameContextManager().setPlayerData(id, key, value),
  getPlayer: (id, key, defaultValue) =>
    getGameContextManager().getPlayerData(id, key, defaultValue),

  // 변수
  setVar: (name, value, description) =>
    getGameContextManager().setVariable(name, value, description),
  getVar: (name, defaultValue) => getGameContextManager().getVariable(name, defaultValue),

  // 이벤트
  log: (type, data) => getGameContextManager().logEvent(type, data),

  // AI 쿼리
  query: question => getGameContextManager().queryGameState(question),

  // 컨텍스트 생성
  getAIContext: () => getGameContextManager().generateAIContext(),

  // 플레이어 관리
  createPlayer: (id, data) => getGameContextManager().createPlayer(id, data),
  removePlayer: id => getGameContextManager().removePlayer(id),
  updateScore: (id, change, reason) => getGameContextManager().updateScore(id, change, reason),
  levelUp: id => getGameContextManager().levelUp(id),
};

export default GameContextManager;
