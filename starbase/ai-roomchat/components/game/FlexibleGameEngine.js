// components/game/FlexibleGameEngine.js
// 🎮 유연한 게임 엔진 - 프롬프트 로직과 점수 시스템 분리
// 수퍼베이스 데이터베이스 연동 지원

'use client'

import { useState, useCallback, useEffect } from 'react'
import GameDatabaseService from '../../services/GameDatabaseService'

// 🎯 게임 상태 타입
export const GAME_STATES = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  PAUSED: 'paused',
  FINISHED: 'finished'
}

// 🏆 점수 변동 타입
export const SCORE_EVENTS = {
  WIN: 'win',
  LOSE: 'lose',
  DRAW: 'draw',
  QUIT: 'quit',
  ACHIEVEMENT: 'achievement',
  PENALTY: 'penalty',
  BONUS: 'bonus'
}

// 🎮 유연한 게임 엔진
export class FlexibleGameEngine {
  constructor(config = {}) {
    this.gameId = config.gameId || `game_${Date.now()}`
    this.playerId = config.playerId || `player_${Date.now()}`
    this.projectId = config.projectId || null // 수퍼베이스 프로젝트 ID
    this.sessionId = null // 데이터베이스 세션 ID
    this.enableDatabase = config.enableDatabase !== false // 기본적으로 DB 사용
    this.currentTurn = 0 // 턴 카운터
    
    // 게임 상태
    this.gameState = {
      status: GAME_STATES.WAITING,
      startTime: null,
      endTime: null,
      sessionData: {},
      persistentData: {},
      variables: new Map(),
      score: config.initialScore || 0,
      metadata: {}
    }
    
    // 설정
    this.config = {
      // 점수 규칙
      scoreRules: {
        [SCORE_EVENTS.WIN]: 100,
        [SCORE_EVENTS.LOSE]: -50,
        [SCORE_EVENTS.DRAW]: 10,
        [SCORE_EVENTS.QUIT]: -25,
        [SCORE_EVENTS.ACHIEVEMENT]: 50,
        [SCORE_EVENTS.PENALTY]: -10,
        [SCORE_EVENTS.BONUS]: 25
      },
      
      // 게임 종료 조건들
      endConditions: {
        maxTurns: null,
        timeLimit: null,
        scoreThreshold: null,
        customConditions: []
      },
      
      // 변수 관리
      variablePersistence: {
        session: [], // 세션에서만 유지
        game: [], // 같은 게임 타입이면 유지
        permanent: [] // 영구 저장
      },
      
      // 확장성
      enablePromptLogic: true, // 프롬프트/노드 시스템 사용 여부
      enableCustomServer: false, // 외부 서버 연동 여부
      
      ...config
    }
    
    // 이벤트 핸들러
    this.eventHandlers = new Map()
    
    // 점수 변동 기록
    this.scoreHistory = []
  }

  // 🚀 게임 시작
  async startGame(initialData = {}) {
    if (this.gameState.status !== GAME_STATES.WAITING) {
      throw new Error('게임이 이미 시작되었습니다')
    }
    
    this.gameState.status = GAME_STATES.ACTIVE
    this.gameState.startTime = Date.now()
    this.gameState.sessionData = { ...initialData }
    
    // 데이터베이스 세션 시작 (활성화된 경우)
    if (this.enableDatabase && this.projectId) {
      try {
        const sessionResult = await GameDatabaseService.startGameSession(
          this.projectId, 
          initialData
        )
        
        if (sessionResult.success) {
          this.sessionId = sessionResult.sessionId
          console.log('🎮 데이터베이스 게임 세션 시작됨:', this.sessionId)
        } else {
          console.warn('⚠️ 데이터베이스 세션 시작 실패:', sessionResult.error)
        }
      } catch (error) {
        console.error('❌ 데이터베이스 연결 오류:', error)
      }
    }
    
    // 영구 데이터 로드
    await this.loadPersistentData()
    
    this.emit('gameStarted', {
      gameId: this.gameId,
      playerId: this.playerId,
      sessionId: this.sessionId,
      startTime: this.gameState.startTime,
      initialData
    })
    
    return true
  }

  // 📊 점수 업데이트 (게임 로직과 분리된 핵심 기능)
  async updateScore(event, amount = null, reason = '') {
    if (this.gameState.status !== GAME_STATES.ACTIVE) {
      return false
    }
    
    // 턴 증가
    this.currentTurn++
    
    // 점수 변동량 계산
    const scoreChange = amount !== null ? amount : this.config.scoreRules[event] || 0
    const oldScore = this.gameState.score
    this.gameState.score += scoreChange
    
    // 점수 변동 기록
    const scoreRecord = {
      timestamp: Date.now(),
      event,
      oldScore,
      newScore: this.gameState.score,
      change: scoreChange,
      reason,
      turn: this.currentTurn
    }
    
    this.scoreHistory.push(scoreRecord)
    
    // 데이터베이스에 점수 변동 저장 (활성화된 경우)
    if (this.enableDatabase && this.sessionId) {
      try {
        const dbResult = await GameDatabaseService.updateScore(
          this.sessionId,
          event,
          scoreChange,
          reason,
          this.currentTurn
        )
        
        if (dbResult.success) {
          // 데이터베이스에서 게임 종료 판정이 있으면 처리
          if (dbResult.result?.game_ended) {
            console.log('🏁 데이터베이스에서 게임 종료 조건 감지됨')
            await this.endGame('database_condition', dbResult.result)
            return scoreRecord
          }
        } else {
          console.warn('⚠️ 데이터베이스 점수 업데이트 실패:', dbResult.error)
        }
      } catch (error) {
        console.error('❌ 점수 업데이트 DB 오류:', error)
      }
    }
    
    this.emit('scoreChanged', scoreRecord)
    
    // 점수 기반 게임 종료 체크
    await this.checkEndConditions()
    
    return scoreRecord
  }

  // 🏁 게임 종료 (승패와 점수는 별개)
  async endGame(reason = 'manual', finalData = {}) {
    if (this.gameState.status !== GAME_STATES.ACTIVE) {
      return false
    }
    
    this.gameState.status = GAME_STATES.FINISHED
    this.gameState.endTime = Date.now()
    this.gameState.metadata.endReason = reason
    this.gameState.metadata.finalData = finalData
    
    // 결과 계산
    let result = 'manual'
    if (reason === 'scoreThreshold' && this.gameState.score >= (this.config.endConditions.scoreThreshold || 1000)) {
      result = 'win'
    } else if (reason === 'timeLimit') {
      result = 'timeout'
    }
    
    const gameResult = {
      gameId: this.gameId,
      playerId: this.playerId,
      sessionId: this.sessionId,
      duration: this.gameState.endTime - this.gameState.startTime,
      finalScore: this.gameState.score,
      scoreHistory: this.scoreHistory,
      reason,
      result,
      finalData
    }
    
    // 데이터베이스에 게임 종료 저장 (활성화된 경우)
    if (this.enableDatabase && this.sessionId) {
      try {
        const dbResult = await GameDatabaseService.endGameSession(
          this.sessionId,
          result,
          reason
        )
        
        if (dbResult.success) {
          console.log('🏁 데이터베이스 게임 세션 종료됨:', dbResult.result)
          gameResult.dbResult = dbResult.result
        } else {
          console.warn('⚠️ 데이터베이스 게임 종료 실패:', dbResult.error)
        }
      } catch (error) {
        console.error('❌ 게임 종료 DB 오류:', error)
      }
    }
    
    // 영구 데이터 저장
    await this.savePersistentData()
    
    this.emit('gameEnded', gameResult)
    
    return gameResult
  }

  // 🔄 게임 상태 변경 (일시정지/재개)
  changeGameState(newState) {
    const oldState = this.gameState.status
    this.gameState.status = newState
    
    this.emit('gameStateChanged', {
      oldState,
      newState,
      timestamp: Date.now()
    })
  }

  // 📦 변수 관리 (세션별/게임별/영구)
  async setVariable(key, value, persistence = 'session') {
    this.gameState.variables.set(key, {
      value,
      persistence,
      timestamp: Date.now()
    })
    
    // 데이터베이스 세션 데이터 업데이트 (활성화된 경우)
    if (this.enableDatabase && this.sessionId && persistence !== 'local') {
      try {
        const variablesObj = Object.fromEntries(this.gameState.variables)
        await GameDatabaseService.updateSessionData(
          this.sessionId,
          persistence === 'session' ? this.gameState.sessionData : null,
          persistence === 'permanent' ? this.gameState.persistentData : null,
          variablesObj
        )
      } catch (error) {
        console.error('❌ 변수 DB 업데이트 오류:', error)
      }
    }
    
    this.emit('variableChanged', { key, value, persistence })
  }

  getVariable(key, defaultValue = null) {
    const variable = this.gameState.variables.get(key)
    return variable ? variable.value : defaultValue
  }

  // 💾 영구 데이터 관리
  async loadPersistentData() {
    try {
      // 데이터베이스에서 활성 세션 조회 (활성화된 경우)
      if (this.enableDatabase && this.projectId && this.playerId) {
        try {
          const activeSession = await GameDatabaseService.getActiveSession(
            this.projectId, 
            this.playerId
          )
          
          if (activeSession.success && activeSession.session) {
            const session = activeSession.session
            console.log('🔄 활성 세션 복원:', session.id)
            
            // 세션 상태 복원
            this.sessionId = session.id
            this.gameState.score = session.current_score
            this.currentTurn = session.current_turn || 0
            this.gameState.sessionData = session.session_data || {}
            this.gameState.persistentData = session.persistent_data || {}
            
            // 게임 변수 복원
            if (session.game_variables) {
              Object.entries(session.game_variables).forEach(([key, variable]) => {
                this.gameState.variables.set(key, variable)
              })
            }
            
            // 상태에 따라 게임 상태 설정
            if (session.status === 'active') {
              this.gameState.status = GAME_STATES.ACTIVE
              this.gameState.startTime = new Date(session.started_at).getTime()
            }
          }
        } catch (error) {
          console.error('❌ 데이터베이스 세션 복원 오류:', error)
        }
      }
      
      // 로컬스토리지 백업 (데이터베이스 실패 시)
      if (typeof window === 'undefined') return
      
      // 게임별 데이터 로드
      const gameData = localStorage.getItem(`game_${this.gameId}_persistent`)
      if (gameData) {
        const parsed = JSON.parse(gameData)
        // 데이터베이스 데이터가 없는 경우만 사용
        if (!this.gameState.persistentData || Object.keys(this.gameState.persistentData).length === 0) {
          this.gameState.persistentData = parsed
        }
      }
      
      // 영구 변수 로드
      for (const key of this.config.variablePersistence.permanent) {
        const saved = localStorage.getItem(`var_${key}`)
        if (saved && !this.gameState.variables.has(key)) {
          await this.setVariable(key, JSON.parse(saved), 'permanent')
        }
      }
      
    } catch (error) {
      console.error('영구 데이터 로드 실패:', error)
    }
  }

  async savePersistentData() {
    try {
      // 데이터베이스에 영구 데이터 저장 (활성화된 경우)
      if (this.enableDatabase && this.sessionId) {
        try {
          const variablesObj = Object.fromEntries(this.gameState.variables)
          await GameDatabaseService.updateSessionData(
            this.sessionId,
            this.gameState.sessionData,
            this.gameState.persistentData,
            variablesObj
          )
        } catch (error) {
          console.error('❌ 데이터베이스 영구 데이터 저장 오류:', error)
        }
      }
      
      // 로컬스토리지 백업
      if (typeof window === 'undefined') return
      
      // 게임별 데이터 저장
      localStorage.setItem(`game_${this.gameId}_persistent`, JSON.stringify(this.gameState.persistentData))
      
      // 영구 변수 저장
      this.gameState.variables.forEach((variable, key) => {
        if (variable.persistence === 'permanent') {
          localStorage.setItem(`var_${key}`, JSON.stringify(variable.value))
        }
      })
      
    } catch (error) {
      console.error('영구 데이터 저장 실패:', error)
    }
  }

  // ⚡ 조건 체크
  async checkEndConditions() {
    const conditions = this.config.endConditions
    
    // 점수 임계값
    if (conditions.scoreThreshold !== null) {
      if (this.gameState.score >= conditions.scoreThreshold) {
        await this.endGame('scoreThreshold', { threshold: conditions.scoreThreshold })
        return true
      }
    }
    
    // 턴 제한
    if (conditions.maxTurns !== null) {
      if (this.currentTurn >= conditions.maxTurns) {
        await this.endGame('maxTurns', { turns: this.currentTurn })
        return true
      }
    }
    
    // 시간 제한
    if (conditions.timeLimit !== null) {
      const elapsed = Date.now() - this.gameState.startTime
      if (elapsed >= conditions.timeLimit) {
        await this.endGame('timeLimit', { elapsed })
        return true
      }
    }
    
    // 커스텀 조건들
    for (const condition of conditions.customConditions) {
      if (typeof condition === 'function' && condition(this)) {
        await this.endGame('customCondition', { condition: condition.name })
        return true
      }
    }
    
    return false
  }

  // 🎭 이벤트 시스템
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }

  off(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`이벤트 핸들러 오류 (${eventType}):`, error)
        }
      })
    }
  }

  // 📈 게임 통계
  async getGameStats() {
    const basicStats = {
      gameId: this.gameId,
      playerId: this.playerId,
      projectId: this.projectId,
      sessionId: this.sessionId,
      status: this.gameState.status,
      currentScore: this.gameState.score,
      currentTurn: this.currentTurn,
      duration: this.gameState.startTime ? Date.now() - this.gameState.startTime : 0,
      scoreChanges: this.scoreHistory.length,
      variables: Object.fromEntries(this.gameState.variables),
      config: this.config,
      enableDatabase: this.enableDatabase
    }
    
    // 데이터베이스에서 상세 통계 조회 (활성화된 경우)
    if (this.enableDatabase && this.sessionId) {
      try {
        const scoreHistory = await GameDatabaseService.getScoreHistory(this.sessionId)
        if (scoreHistory.success) {
          basicStats.dbScoreHistory = scoreHistory.events
        }
      } catch (error) {
        console.error('❌ 데이터베이스 통계 조회 오류:', error)
      }
    }
    
    return basicStats
  }
  
  // 🔄 실시간 구독 설정
  setupDatabaseSubscriptions() {
    if (!this.enableDatabase || !this.sessionId) {
      return null
    }
    
    // 게임 세션 변경 구독
    const sessionSubscription = GameDatabaseService.subscribeToGameSession(
      this.sessionId,
      (payload) => {
        console.log('🔄 세션 업데이트:', payload)
        this.emit('sessionUpdated', payload)
      }
    )
    
    // 점수 이벤트 구독
    const scoreSubscription = GameDatabaseService.subscribeToScoreEvents(
      this.sessionId,
      (payload) => {
        console.log('📊 점수 이벤트:', payload)
        this.emit('scoreEventReceived', payload)
      }
    )
    
    return {
      session: sessionSubscription,
      score: scoreSubscription
    }
  }
  
  // 🎯 데이터베이스 연동 설정 변경
  setDatabaseEnabled(enabled, projectId = null) {
    this.enableDatabase = enabled
    if (projectId) {
      this.projectId = projectId
    }
    
    console.log(`🎮 데이터베이스 연동 ${enabled ? '활성화' : '비활성화'}됨`)
    
    if (enabled && projectId) {
      // 실시간 구독 설정
      const subscriptions = this.setupDatabaseSubscriptions()
      this.dbSubscriptions = subscriptions
    } else if (this.dbSubscriptions) {
      // 구독 해제
      Object.values(this.dbSubscriptions).forEach(sub => {
        if (sub && sub.unsubscribe) {
          sub.unsubscribe()
        }
      })
      this.dbSubscriptions = null
    }
  }

  // 🔄 상태 복원 (세션 재연결용)
  restoreState(savedState) {
    Object.assign(this.gameState, savedState.gameState)
    this.scoreHistory = savedState.scoreHistory || []
    this.config = { ...this.config, ...savedState.config }
    
    this.emit('stateRestored', { savedState })
  }

  // 💾 상태 내보내기
  exportState() {
    return {
      gameId: this.gameId,
      playerId: this.playerId,
      gameState: this.gameState,
      scoreHistory: this.scoreHistory,
      config: this.config,
      timestamp: Date.now()
    }
  }
}

// 🎯 게임 팩토리 - 다양한 게임 타입 지원
export class GameFactory {
  static createBattleGame(config = {}) {
    return new FlexibleGameEngine({
      enableDatabase: true, // 배틀 게임은 기본적으로 DB 사용
      ...config,
      scoreRules: {
        [SCORE_EVENTS.WIN]: 150,
        [SCORE_EVENTS.LOSE]: -75,
        [SCORE_EVENTS.DRAW]: 25,
        [SCORE_EVENTS.ACHIEVEMENT]: 100, // 특별 달성
        [SCORE_EVENTS.PENALTY]: -30, // 규칙 위반
        ...config.scoreRules
      },
      endConditions: {
        scoreThreshold: 1000, // 1000점 달성 시 승리
        maxTurns: 50, // 최대 50턴
        ...config.endConditions
      }
    })
  }

  static createSurvivalGame(config = {}) {
    return new FlexibleGameEngine({
      enableDatabase: true,
      ...config,
      scoreRules: {
        [SCORE_EVENTS.WIN]: 50, // 라운드 생존
        [SCORE_EVENTS.LOSE]: -100, // 사망
        [SCORE_EVENTS.BONUS]: 10, // 시간 보너스
        [SCORE_EVENTS.ACHIEVEMENT]: 75, // 특별 생존 보너스
        ...config.scoreRules
      },
      endConditions: {
        timeLimit: 300000, // 5분 제한
        scoreThreshold: 500, // 생존 목표 점수
        ...config.endConditions
      }
    })
  }

  static createPuzzleGame(config = {}) {
    return new FlexibleGameEngine({
      enableDatabase: true,
      ...config,
      scoreRules: {
        [SCORE_EVENTS.WIN]: 200, // 퍼즐 해결
        [SCORE_EVENTS.PENALTY]: -20, // 잘못된 시도
        [SCORE_EVENTS.BONUS]: 50, // 빠른 해결 보너스
        [SCORE_EVENTS.ACHIEVEMENT]: 150, // 완벽한 해결
        ...config.scoreRules
      },
      endConditions: {
        maxTurns: 30, // 최대 시도 횟수
        timeLimit: 600000, // 10분 제한
        ...config.endConditions
      }
    })
  }

  static createTextGame(config = {}) {
    return new FlexibleGameEngine({
      enableDatabase: config.enableDatabase !== false, // 텍스트 게임은 선택적 DB 사용
      ...config,
      scoreRules: {
        [SCORE_EVENTS.WIN]: 100,
        [SCORE_EVENTS.LOSE]: -50,
        [SCORE_EVENTS.DRAW]: 25,
        [SCORE_EVENTS.ACHIEVEMENT]: 80,
        [SCORE_EVENTS.BONUS]: 30,
        [SCORE_EVENTS.PENALTY]: -15,
        ...config.scoreRules
      },
      endConditions: {
        scoreThreshold: 500, // 기본 목표 점수
        maxTurns: 100, // 충분한 턴 수
        ...config.endConditions
      }
    })
  }

  static createRPGGame(config = {}) {
    return new FlexibleGameEngine({
      enableDatabase: true, // RPG는 반드시 DB 사용
      ...config,
      scoreRules: {
        [SCORE_EVENTS.WIN]: 300, // 퀘스트 완료
        [SCORE_EVENTS.LOSE]: -100, // 실패/죽음
        [SCORE_EVENTS.ACHIEVEMENT]: 250, // 특별 업적
        [SCORE_EVENTS.BONUS]: 50, // 경험치 보너스
        [SCORE_EVENTS.PENALTY]: -25, // 패널티
        ...config.scoreRules
      },
      endConditions: {
        scoreThreshold: 2000, // 높은 목표 점수
        timeLimit: 1800000, // 30분 제한
        ...config.endConditions
      },
      variablePersistence: {
        session: ['currentHp', 'currentMp', 'inventory'],
        game: ['level', 'exp', 'skills'],
        permanent: ['totalScore', 'achievements', 'unlocks'],
        ...config.variablePersistence
      }
    })
  }

  // 🎨 커스텀 게임 생성 헬퍼
  static createCustomGame(gameType, customConfig = {}) {
    const baseConfigs = {
      text_game: this.createTextGame,
      battle_game: this.createBattleGame,
      puzzle_game: this.createPuzzleGame,
      rpg_game: this.createRPGGame,
      survival_game: this.createSurvivalGame
    }

    const factory = baseConfigs[gameType]
    if (factory) {
      return factory(customConfig)
    } else {
      // 기본 텍스트 게임으로 폴백
      console.warn(`알 수 없는 게임 타입: ${gameType}, 텍스트 게임으로 생성됨`)
      return this.createTextGame(customConfig)
    }
  }

  // 🎯 프로젝트 기반 게임 생성 (데이터베이스 프로젝트와 연동)
  static async createFromProject(projectId, userId, additionalConfig = {}) {
    try {
      // 데이터베이스에서 프로젝트 정보 가져오기 (실제로는 GameDatabaseService 사용)
      const projectResult = await GameDatabaseService.getUserProjects(userId)
      
      if (!projectResult.success) {
        throw new Error('프로젝트 로딩 실패: ' + projectResult.error)
      }

      const project = projectResult.projects.find(p => p.id === projectId)
      if (!project) {
        throw new Error('프로젝트를 찾을 수 없습니다')
      }

      // 프로젝트 설정 기반으로 게임 엔진 구성
      const gameConfig = {
        projectId: projectId,
        playerId: userId,
        gameId: `project_${projectId}_${Date.now()}`,
        enableDatabase: true,
        scoreRules: project.score_rules || {},
        endConditions: project.end_conditions || {},
        initialScore: project.score_rules?.initial_score || 0,
        ...additionalConfig
      }

      // 프로젝트 타입에 따라 게임 생성
      return this.createCustomGame(project.project_type, gameConfig)

    } catch (error) {
      console.error('프로젝트 기반 게임 생성 실패:', error)
      // 폴백으로 기본 게임 생성
      return this.createTextGame({
        projectId,
        playerId: userId,
        enableDatabase: false,
        ...additionalConfig
      })
    }
  }
}

export default FlexibleGameEngine