/**
 * 📊 실시간 게임 분석 및 모니터링 서비스
 * 성능, 사용자 행동, 오류 추적
 */

'use client'

class GameAnalyticsService {
  constructor(config = {}) {
    this.config = {
      batchSize: 50,
      flushInterval: 30000, // 30초
      enableConsoleLog: true,
      enablePerformanceTracking: true,
      enableErrorTracking: true,
      enableUserBehaviorTracking: true,
      ...config
    }
    
    this.eventQueue = []
    this.sessionData = this.initSession()
    this.performanceMetrics = new Map()
    this.userActions = []
    this.errorLog = []
    
    // 자동 전송 설정
    this.setupAutoFlush()
    
    // 성능 모니터링 설정
    this.setupPerformanceTracking()
    
    // 오류 추적 설정
    this.setupErrorTracking()
    
    // 페이지 이벤트 추적
    this.setupPageTracking()
  }
  
  // 세션 초기화
  initSession() {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const sessionData = {
      sessionId,
      startTime: Date.now(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      connection: this.getConnectionInfo(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer
    }
    
    this.log('🎯 새 세션 시작:', sessionData)
    return sessionData
  }
  
  // 네트워크 연결 정보
  getConnectionInfo() {
    if ('connection' in navigator) {
      const conn = navigator.connection
      return {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData
      }
    }
    return null
  }
  
  // 게임 이벤트 추적
  trackGameEvent(eventType, data = {}) {
    const event = {
      type: 'game_event',
      eventType,
      sessionId: this.sessionData.sessionId,
      timestamp: Date.now(),
      data,
      url: window.location.href,
      userId: this.getCurrentUserId()
    }
    
    this.addToQueue(event)
    this.log('🎮 게임 이벤트:', eventType, data)
  }
  
  // 사용자 행동 추적
  trackUserAction(action, context = {}) {
    if (!this.config.enableUserBehaviorTracking) return
    
    const actionEvent = {
      type: 'user_action',
      action,
      sessionId: this.sessionData.sessionId,
      timestamp: Date.now(),
      context,
      url: window.location.href,
      userId: this.getCurrentUserId()
    }
    
    this.userActions.push(actionEvent)
    this.addToQueue(actionEvent)
    this.log('👤 사용자 행동:', action, context)
  }
  
  // 성능 메트릭 추적
  trackPerformance(metricName, value, unit = 'ms') {
    if (!this.config.enablePerformanceTracking) return
    
    const performanceEvent = {
      type: 'performance_metric',
      metricName,
      value,
      unit,
      sessionId: this.sessionData.sessionId,
      timestamp: Date.now(),
      url: window.location.href
    }
    
    // 메트릭 통계 업데이트
    this.updateMetricStats(metricName, value)
    
    this.addToQueue(performanceEvent)
    this.log('📊 성능 메트릭:', metricName, `${value}${unit}`)
  }
  
  // 메트릭 통계 업데이트
  updateMetricStats(metricName, value) {
    if (!this.performanceMetrics.has(metricName)) {
      this.performanceMetrics.set(metricName, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: []
      })
    }
    
    const stats = this.performanceMetrics.get(metricName)
    stats.count++
    stats.sum += value
    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)
    stats.values.push(value)
    
    // 최근 100개 값만 유지
    if (stats.values.length > 100) {
      stats.values = stats.values.slice(-100)
    }
  }
  
  // 오류 추적
  trackError(error, context = {}) {
    if (!this.config.enableErrorTracking) return
    
    const errorEvent = {
      type: 'error',
      message: error.message || String(error),
      stack: error.stack,
      sessionId: this.sessionData.sessionId,
      timestamp: Date.now(),
      context,
      url: window.location.href,
      userId: this.getCurrentUserId(),
      userAgent: navigator.userAgent
    }
    
    this.errorLog.push(errorEvent)
    this.addToQueue(errorEvent)
    this.log('❌ 오류 추적:', error, context)
    
    // 심각한 오류는 즉시 전송
    if (this.isCriticalError(error)) {
      this.flushEvents()
    }
  }
  
  // 심각한 오류 판단
  isCriticalError(error) {
    const criticalPatterns = [
      /database/i,
      /network/i,
      /timeout/i,
      /authentication/i,
      /permission/i
    ]
    
    return criticalPatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.stack)
    )
  }
  
  // AI 요청 추적
  trackAIRequest(provider, prompt, responseTime, success, model = null) {
    const aiEvent = {
      type: 'ai_request',
      provider,
      promptLength: prompt.length,
      responseTime,
      success,
      model,
      sessionId: this.sessionData.sessionId,
      timestamp: Date.now(),
      userId: this.getCurrentUserId()
    }
    
    this.addToQueue(aiEvent)
    this.log('🤖 AI 요청:', provider, `${responseTime}ms`, success ? '✅' : '❌')
  }
  
  // 페이지 성능 추적
  trackPagePerformance() {
    if (typeof window.performance !== 'undefined') {
      const navigation = performance.getEntriesByType('navigation')[0]
      if (navigation) {
        this.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.fetchStart)
        this.trackPerformance('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.fetchStart)
        this.trackPerformance('first_byte_time', navigation.responseStart - navigation.fetchStart)
      }
      
      // Core Web Vitals
      this.trackCoreWebVitals()
    }
  }
  
  // Core Web Vitals 추적
  trackCoreWebVitals() {
    // Largest Contentful Paint (LCP)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries()
      const lastEntry = entries[entries.length - 1]
      this.trackPerformance('lcp', lastEntry.startTime)
    }).observe({ entryTypes: ['largest-contentful-paint'] })
    
    // First Input Delay (FID)
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        this.trackPerformance('fid', entry.processingStart - entry.startTime)
      }
    }).observe({ entryTypes: ['first-input'] })
    
    // Cumulative Layout Shift (CLS)
    let clsValue = 0
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value
        }
      }
      this.trackPerformance('cls', clsValue * 1000) // 1000을 곱해 더 읽기 쉬운 단위로
    }).observe({ entryTypes: ['layout-shift'] })
  }
  
  // 게임 세션 분석
  analyzeGameSession(gameData) {
    const analysis = {
      sessionDuration: Date.now() - this.sessionData.startTime,
      totalEvents: this.eventQueue.filter(e => e.type === 'game_event').length,
      userActions: this.userActions.length,
      errors: this.errorLog.length,
      averageResponseTime: this.calculateAverageResponseTime(),
      performanceSummary: this.getPerformanceSummary(),
      gameSpecific: {
        ...gameData,
        completionRate: this.calculateCompletionRate(gameData),
        engagementScore: this.calculateEngagementScore()
      }
    }
    
    this.trackGameEvent('session_analysis', analysis)
    return analysis
  }
  
  // 평균 응답 시간 계산
  calculateAverageResponseTime() {
    const aiRequests = this.eventQueue.filter(e => e.type === 'ai_request')
    if (aiRequests.length === 0) return 0
    
    const totalTime = aiRequests.reduce((sum, req) => sum + req.responseTime, 0)
    return totalTime / aiRequests.length
  }
  
  // 성능 요약
  getPerformanceSummary() {
    const summary = {}
    
    for (const [metricName, stats] of this.performanceMetrics.entries()) {
      summary[metricName] = {
        average: stats.sum / stats.count,
        min: stats.min,
        max: stats.max,
        count: stats.count,
        median: this.calculateMedian(stats.values)
      }
    }
    
    return summary
  }
  
  // 중앙값 계산
  calculateMedian(values) {
    if (values.length === 0) return 0
    
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
      return sorted[mid]
    }
  }
  
  // 완료율 계산
  calculateCompletionRate(gameData) {
    if (!gameData.totalSteps || gameData.totalSteps === 0) return 0
    return (gameData.completedSteps / gameData.totalSteps) * 100
  }
  
  // 참여도 점수 계산
  calculateEngagementScore() {
    const sessionTime = Date.now() - this.sessionData.startTime
    const actionRate = this.userActions.length / (sessionTime / 60000) // 분당 액션 수
    const eventRate = this.eventQueue.length / (sessionTime / 60000) // 분당 이벤트 수
    
    // 0-100 점수로 정규화
    const engagementScore = Math.min(100, (actionRate * 10) + (eventRate * 5))
    return Math.round(engagementScore)
  }
  
  // 큐에 이벤트 추가
  addToQueue(event) {
    this.eventQueue.push(event)
    
    // 배치 크기 도달 시 즉시 전송
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flushEvents()
    }
  }
  
  // 이벤트 전송
  async flushEvents() {
    if (this.eventQueue.length === 0) return
    
    const eventsToSend = [...this.eventQueue]
    this.eventQueue = []
    
    try {
      const response = await fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionData.sessionId,
          events: eventsToSend,
          sessionData: this.sessionData
        })
      })
      
      if (response.ok) {
        this.log('📤 분석 데이터 전송 성공:', eventsToSend.length, '개 이벤트')
      } else {
        console.warn('⚠️ 분석 데이터 전송 실패')
        // 실패한 이벤트들을 다시 큐에 추가
        this.eventQueue.unshift(...eventsToSend)
      }
      
    } catch (error) {
      console.error('❌ 분석 데이터 전송 오류:', error)
      // 실패한 이벤트들을 다시 큐에 추가
      this.eventQueue.unshift(...eventsToSend)
    }
  }
  
  // 자동 전송 설정
  setupAutoFlush() {
    // 정기적으로 이벤트 전송
    setInterval(() => {
      this.flushEvents()
    }, this.config.flushInterval)
    
    // 페이지 종료 시 전송
    window.addEventListener('beforeunload', () => {
      if (this.eventQueue.length > 0) {
        // 동기적으로 전송 (페이지 종료 전에)
        navigator.sendBeacon('/api/analytics/events', JSON.stringify({
          sessionId: this.sessionData.sessionId,
          events: this.eventQueue,
          sessionData: this.sessionData
        }))
      }
    })
  }
  
  // 성능 모니터링 설정
  setupPerformanceTracking() {
    if (!this.config.enablePerformanceTracking) return
    
    // 페이지 로드 성능 추적
    window.addEventListener('load', () => {
      setTimeout(() => this.trackPagePerformance(), 0)
    })
    
    // 리소스 로딩 모니터링
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.duration > 1000) { // 1초 이상 걸린 리소스
          this.trackPerformance('slow_resource_load', entry.duration)
        }
      }
    }).observe({ entryTypes: ['resource'] })
  }
  
  // 오류 추적 설정
  setupErrorTracking() {
    if (!this.config.enableErrorTracking) return
    
    // JavaScript 오류
    window.addEventListener('error', (event) => {
      this.trackError(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      })
    })
    
    // Promise rejection 오류
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(new Error(`Unhandled Promise Rejection: ${event.reason}`), {
        type: 'unhandledrejection'
      })
    })
  }
  
  // 페이지 이벤트 추적
  setupPageTracking() {
    // 페이지 방문
    this.trackUserAction('page_view', {
      url: window.location.href,
      title: document.title
    })
    
    // 클릭 추적
    document.addEventListener('click', (event) => {
      const element = event.target
      this.trackUserAction('click', {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        text: element.textContent?.substring(0, 50)
      })
    })
    
    // 스크롤 추적
    let scrollTimeout
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
        this.trackUserAction('scroll', {
          scrollPercent: Math.round(scrollPercent)
        })
      }, 1000)
    })
  }
  
  // 현재 사용자 ID 가져오기
  getCurrentUserId() {
    // Supabase 세션에서 사용자 ID 추출
    try {
      const session = localStorage.getItem('supabase.auth.token')
      if (session) {
        const parsed = JSON.parse(session)
        return parsed.user?.id
      }
    } catch (error) {
      // 조용히 무시
    }
    return null
  }
  
  // 로그 출력
  log(...args) {
    if (this.config.enableConsoleLog) {
      console.log('[GameAnalytics]', ...args)
    }
  }
  
  // 실시간 대시보드 데이터 생성
  getDashboardData() {
    return {
      session: {
        ...this.sessionData,
        duration: Date.now() - this.sessionData.startTime,
        eventsCount: this.eventQueue.length
      },
      performance: this.getPerformanceSummary(),
      errors: this.errorLog.length,
      userActions: this.userActions.length,
      engagement: this.calculateEngagementScore(),
      recentEvents: this.eventQueue.slice(-10) // 최근 10개 이벤트
    }
  }
}

export default GameAnalyticsService