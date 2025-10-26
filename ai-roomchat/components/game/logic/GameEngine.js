/**
 * GameEngine - 핵심 게임 로직 엔진
 * 게임 상태 관리, 게임 루프, 게임 플로우 제어
 */
export default class GameEngine {
  constructor(options = {}) {
    this.options = {
      tickRate: 60, // 초당 틱 수
      ...options,
    };
    this.isRunning = false;
    this.isPaused = false;
    this.gameState = {
      phase: 'idle', // idle, preparing, running, paused, ended
      currentTurn: 0,
      startTime: null,
      elapsedTime: 0,
    };
    this.updateCallbacks = [];
    this.lastUpdateTime = 0;
    this.isInitialized = false;
  }

  /**
   * 게임 엔진 초기화
   */
  async initialize(initialState = {}) {
    try {
      this.gameState = {
        ...this.gameState,
        ...initialState,
        phase: 'idle',
      };

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[GameEngine] 초기화 실패:', error);
      return false;
    }
  }

  /**
   * 게임 시작
   */
  start() {
    if (!this.isInitialized) {
      console.warn('[GameEngine] 초기화되지 않은 상태에서 시작 시도');
      return false;
    }

    if (this.isRunning) {
      console.warn('[GameEngine] 이미 실행 중');
      return false;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.gameState.phase = 'running';
    this.gameState.startTime = Date.now();
    this.lastUpdateTime = Date.now();

    console.log('[GameEngine] 게임 시작');
    return true;
  }

  /**
   * 게임 일시정지
   */
  pause() {
    if (!this.isRunning) return;

    this.isPaused = true;
    this.gameState.phase = 'paused';
    console.log('[GameEngine] 게임 일시정지');
  }

  /**
   * 게임 재개
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.gameState.phase = 'running';
    this.lastUpdateTime = Date.now();
    console.log('[GameEngine] 게임 재개');
  }

  /**
   * 게임 정지
   */
  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.gameState.phase = 'ended';
    console.log('[GameEngine] 게임 종료');
  }

  /**
   * 게임 상태 업데이트
   */
  update() {
    if (!this.isRunning || this.isPaused) return;

    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // 초 단위
    this.lastUpdateTime = currentTime;

    // 경과 시간 업데이트
    if (this.gameState.startTime) {
      this.gameState.elapsedTime = (currentTime - this.gameState.startTime) / 1000;
    }

    // 등록된 업데이트 콜백 실행
    this.updateCallbacks.forEach(callback => {
      try {
        callback(deltaTime, this.gameState);
      } catch (error) {
        console.error('[GameEngine] 업데이트 콜백 오류:', error);
      }
    });

    return deltaTime;
  }

  /**
   * 업데이트 콜백 등록
   */
  onUpdate(callback) {
    if (typeof callback === 'function') {
      this.updateCallbacks.push(callback);
    }
  }

  /**
   * 업데이트 콜백 제거
   */
  offUpdate(callback) {
    this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
  }

  /**
   * 게임 상태 가져오기
   */
  getState() {
    return { ...this.gameState };
  }

  /**
   * 게임 상태 설정
   */
  setState(newState) {
    this.gameState = {
      ...this.gameState,
      ...newState,
    };
  }

  /**
   * 턴 진행
   */
  nextTurn() {
    this.gameState.currentTurn += 1;
    console.log(`[GameEngine] 턴 ${this.gameState.currentTurn} 시작`);
    return this.gameState.currentTurn;
  }

  /**
   * 게임 리셋
   */
  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.gameState = {
      phase: 'idle',
      currentTurn: 0,
      startTime: null,
      elapsedTime: 0,
    };
    this.lastUpdateTime = 0;
    console.log('[GameEngine] 게임 리셋');
  }

  /**
   * 실행 중 여부
   */
  isGameRunning() {
    return this.isRunning && !this.isPaused;
  }

  /**
   * 리소스 정리
   */
  cleanup() {
    this.stop();
    this.updateCallbacks = [];
    this.isInitialized = false;
  }
}
