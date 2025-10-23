/**
 * 📊 Analytics API - 게임 분석 데이터 수집 및 저장
 * 이벤트 배치 처리, 성능 분석, 사용자 행동 추적
 */

import { createServerSupabaseClient } from '@supabase/ssr'
import crypto from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Supabase 클라이언트 생성
    const supabase = createServerSupabaseClient({ req, res })

    const { sessionId, events, sessionData } = req.body

    if (!sessionId || !events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid request data' })
    }

    console.log(`📊 Analytics: ${events.length}개 이벤트 수신 (세션: ${sessionId})`)

    // 배치로 이벤트 처리
    const results = await processBatchEvents(supabase, sessionId, events, sessionData)

    res.status(200).json({
      success: true,
      processed: events.length,
      results
    })

  } catch (error) {
    console.error('❌ Analytics API 오류:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}

// 배치 이벤트 처리
async function processBatchEvents(supabase, sessionId, events, sessionData) {
  const results = {
    gameEvents: 0,
    userActions: 0,
    performanceMetrics: 0,
    errors: 0,
    aiRequests: 0
  }

  try {
    // 1. 세션 정보 저장/업데이트
    await upsertSession(supabase, sessionId, sessionData)

    // 2. 이벤트 타입별로 분류
    const eventsByType = classifyEvents(events)

    // 3. 각 타입별로 배치 저장
    if (eventsByType.game_events.length > 0) {
      await saveGameEvents(supabase, eventsByType.game_events)
      results.gameEvents = eventsByType.game_events.length
    }

    if (eventsByType.user_actions.length > 0) {
      await saveUserActions(supabase, eventsByType.user_actions)
      results.userActions = eventsByType.user_actions.length
    }

    if (eventsByType.performance_metrics.length > 0) {
      await savePerformanceMetrics(supabase, eventsByType.performance_metrics)
      results.performanceMetrics = eventsByType.performance_metrics.length
    }

    if (eventsByType.errors.length > 0) {
      await saveErrors(supabase, eventsByType.errors)
      results.errors = eventsByType.errors.length
    }

    if (eventsByType.ai_requests.length > 0) {
      await saveAIRequests(supabase, eventsByType.ai_requests)
      results.aiRequests = eventsByType.ai_requests.length
    }

    // 4. 실시간 통계 업데이트
    await updateRealtimeStats(supabase, sessionId, results)

    console.log('✅ 배치 이벤트 처리 완료:', results)
    return results

  } catch (error) {
    console.error('❌ 배치 이벤트 처리 오류:', error)
    throw error
  }
}

// 세션 정보 저장/업데이트
async function upsertSession(supabase, sessionId, sessionData) {
  const sessionRecord = {
    session_id: sessionId,
    user_agent: sessionData.userAgent,
    platform: sessionData.platform,
    language: sessionData.language,
    viewport_width: sessionData.viewport?.width,
    viewport_height: sessionData.viewport?.height,
    timezone: sessionData.timezone,
    referrer: sessionData.referrer,
    connection_info: sessionData.connection,
    start_time: new Date(sessionData.startTime),
    last_activity: new Date(),
    created_at: new Date()
  }

  const { error } = await supabase
    .from('analytics_sessions')
    .upsert(sessionRecord, { 
      onConflict: 'session_id',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('세션 저장 오류:', error)
    throw error
  }
}

// 이벤트 분류
function classifyEvents(events) {
  const classified = {
    game_events: [],
    user_actions: [],
    performance_metrics: [],
    errors: [],
    ai_requests: []
  }

  events.forEach(event => {
    switch (event.type) {
      case 'game_event':
        classified.game_events.push(event)
        break
      case 'user_action':
        classified.user_actions.push(event)
        break
      case 'performance_metric':
        classified.performance_metrics.push(event)
        break
      case 'error':
        classified.errors.push(event)
        break
      case 'ai_request':
        classified.ai_requests.push(event)
        break
    }
  })

  return classified
}

// 게임 이벤트 저장
async function saveGameEvents(supabase, events) {
  const gameEventRecords = events.map(event => ({
    session_id: event.sessionId,
    user_id: event.userId,
    event_type: event.eventType,
    event_data: event.data,
    url: event.url,
    timestamp: new Date(event.timestamp),
    created_at: new Date()
  }))

  const { error } = await supabase
    .from('analytics_game_events')
    .insert(gameEventRecords)

  if (error) {
    console.error('게임 이벤트 저장 오류:', error)
    throw error
  }
}

// 사용자 행동 저장
async function saveUserActions(supabase, actions) {
  const actionRecords = actions.map(action => ({
    session_id: action.sessionId,
    user_id: action.userId,
    action_type: action.action,
    action_context: action.context,
    url: action.url,
    timestamp: new Date(action.timestamp),
    created_at: new Date()
  }))

  const { error } = await supabase
    .from('analytics_user_actions')
    .insert(actionRecords)

  if (error) {
    console.error('사용자 행동 저장 오류:', error)
    throw error
  }
}

// 성능 메트릭 저장
async function savePerformanceMetrics(supabase, metrics) {
  const metricRecords = metrics.map(metric => ({
    session_id: metric.sessionId,
    metric_name: metric.metricName,
    metric_value: metric.value,
    metric_unit: metric.unit,
    url: metric.url,
    timestamp: new Date(metric.timestamp),
    created_at: new Date()
  }))

  const { error } = await supabase
    .from('analytics_performance_metrics')
    .insert(metricRecords)

  if (error) {
    console.error('성능 메트릭 저장 오류:', error)
    throw error
  }
}

// 오류 저장
async function saveErrors(supabase, errors) {
  const errorRecords = errors.map(error => ({
    session_id: error.sessionId,
    user_id: error.userId,
    error_message: error.message,
    error_stack: error.stack,
    error_context: error.context,
    url: error.url,
    user_agent: error.userAgent,
    timestamp: new Date(error.timestamp),
    created_at: new Date()
  }))

  const { error } = await supabase
    .from('analytics_errors')
    .insert(errorRecords)

  if (error) {
    console.error('오류 저장 실패:', error)
    throw error
  }
}

// AI 요청 저장
async function saveAIRequests(supabase, requests) {
  const requestRecords = requests.map(req => ({
    session_id: req.sessionId,
    user_id: req.userId,
    provider: req.provider,
    model: req.model,
    prompt_length: req.promptLength,
    response_time: req.responseTime,
    success: req.success,
    timestamp: new Date(req.timestamp),
    created_at: new Date()
  }))

  const { error } = await supabase
    .from('analytics_ai_requests')
    .insert(requestRecords)

  if (error) {
    console.error('AI 요청 저장 오류:', error)
    throw error
  }
}

// 실시간 통계 업데이트
async function updateRealtimeStats(supabase, sessionId, results) {
  try {
    // 오늘 날짜로 통계 키 생성
    const today = new Date().toISOString().split('T')[0]
    
    // 통계 업데이트 또는 생성
    const { data: existingStats } = await supabase
      .from('analytics_daily_stats')
      .select('*')
      .eq('date', today)
      .single()

    const statsUpdate = {
      date: today,
      total_sessions: existingStats ? existingStats.total_sessions + 1 : 1,
      total_events: (existingStats?.total_events || 0) + Object.values(results).reduce((sum, count) => sum + count, 0),
      game_events: (existingStats?.game_events || 0) + results.gameEvents,
      user_actions: (existingStats?.user_actions || 0) + results.userActions,
      performance_metrics: (existingStats?.performance_metrics || 0) + results.performanceMetrics,
      errors: (existingStats?.errors || 0) + results.errors,
      ai_requests: (existingStats?.ai_requests || 0) + results.aiRequests,
      updated_at: new Date()
    }

    if (existingStats) {
      // 기존 통계 업데이트
      const { error } = await supabase
        .from('analytics_daily_stats')
        .update(statsUpdate)
        .eq('date', today)

      if (error) throw error
    } else {
      // 새 통계 생성
      statsUpdate.created_at = new Date()
      const { error } = await supabase
        .from('analytics_daily_stats')
        .insert(statsUpdate)

      if (error) throw error
    }

    // 실시간 채널로 통계 브로드캐스트
    await supabase
      .channel('analytics_updates')
      .send({
        type: 'broadcast',
        event: 'stats_update',
        payload: {
          sessionId,
          results,
          dailyStats: statsUpdate
        }
      })

  } catch (error) {
    console.error('실시간 통계 업데이트 오류:', error)
    // 통계 업데이트 실패해도 메인 로직은 성공으로 처리
  }
}