"use client"

import { supabase } from '@/lib/supabase'

const DEFAULT_EVENTS = ['INSERT', 'UPDATE', 'DELETE']

function normaliseEvent(event) {
  if (!event) return null
  const token = String(event).trim().toUpperCase()
  return token ? token : null
}

function normaliseTopic(topic) {
  if (!topic) return null
  const trimmed = String(topic).trim()
  if (!trimmed) return null
  return trimmed.startsWith('topic:') ? trimmed.slice(6) : trimmed
}

function buildEqFilter(column, value) {
  if (!column) return null
  if (value === null || value === undefined) return null
  const token = String(value).trim()
  if (!token) return null
  return `${column}=eq.${token}`
}

function describeMessageTopic(segments) {
  if (!segments.length) {
    return [{ table: 'messages', filter: null }]
  }

  const [qualifier, rawValue] = segments
  switch (qualifier) {
    case 'global':
      return [{ table: 'messages', filter: null }]
    case 'scope':
      return [{ table: 'messages', filter: buildEqFilter('scope', rawValue) }]
    case 'channel':
      return [{ table: 'messages', filter: buildEqFilter('channel_type', rawValue) }]
    case 'session':
      return [{ table: 'messages', filter: buildEqFilter('session_id', rawValue) }]
    case 'match':
      return [{ table: 'messages', filter: buildEqFilter('match_instance_id', rawValue) }]
    case 'game':
      return [{ table: 'messages', filter: buildEqFilter('game_id', rawValue) }]
    case 'room':
      return [
        { table: 'messages', filter: buildEqFilter('chat_room_id', rawValue) },
        { table: 'messages', filter: buildEqFilter('room_id', rawValue) },
      ].filter((descriptor) => descriptor.filter)
    case 'owner': {
      const filter = buildEqFilter('owner_id', rawValue)
      const targetFilter = buildEqFilter('target_owner_id', rawValue)
      return [
        { table: 'messages', filter },
        { table: 'messages', filter: targetFilter },
      ].filter((descriptor) => descriptor.filter)
    }
    case 'target-owner':
      return [{ table: 'messages', filter: buildEqFilter('target_owner_id', rawValue) }]
    case 'hero': {
      const filter = buildEqFilter('hero_id', rawValue)
      const targetFilter = buildEqFilter('target_hero_id', rawValue)
      return [
        { table: 'messages', filter },
        { table: 'messages', filter: targetFilter },
      ].filter((descriptor) => descriptor.filter)
    }
    case 'target-hero':
      return [{ table: 'messages', filter: buildEqFilter('target_hero_id', rawValue) }]
    case 'thread':
      return [{ table: 'messages', filter: buildEqFilter('thread_hint', rawValue) }]
    case 'user':
      return [{ table: 'messages', filter: buildEqFilter('user_id', rawValue) }]
    default:
      return [{ table: 'messages', filter: null }]
  }
}

function describeRankQueueTopic(segments) {
  if (!segments.length) return [{ table: 'rank_queue_tickets', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'queue':
      return [{ table: 'rank_queue_tickets', filter: buildEqFilter('queue_id', value) }]
    case 'ticket':
      return [{ table: 'rank_queue_tickets', filter: buildEqFilter('id', value) }]
    case 'owner':
      return [{ table: 'rank_queue_tickets', filter: buildEqFilter('owner_id', value) }]
    case 'game':
      return [{ table: 'rank_queue_tickets', filter: buildEqFilter('game_id', value) }]
    case 'room':
      return [{ table: 'rank_queue_tickets', filter: buildEqFilter('room_id', value) }]
    default:
      return [{ table: 'rank_queue_tickets', filter: null }]
  }
}

function describeRankRoomsTopic(segments) {
  if (!segments.length) return [{ table: 'rank_rooms', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'game':
      return [{ table: 'rank_rooms', filter: buildEqFilter('game_id', value) }]
    case 'room':
      return [{ table: 'rank_rooms', filter: buildEqFilter('id', value) }]
    case 'owner':
      return [{ table: 'rank_rooms', filter: buildEqFilter('owner_id', value) }]
    default:
      return [{ table: 'rank_rooms', filter: null }]
  }
}

function describeRankSessionsTopic(segments) {
  if (!segments.length) return [{ table: 'rank_sessions', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'game':
      return [{ table: 'rank_sessions', filter: buildEqFilter('game_id', value) }]
    case 'session':
      return [{ table: 'rank_sessions', filter: buildEqFilter('id', value) }]
    case 'owner':
      return [{ table: 'rank_sessions', filter: buildEqFilter('owner_id', value) }]
    case 'room':
      return [{ table: 'rank_sessions', filter: buildEqFilter('room_id', value) }]
    case 'match':
      return [{ table: 'rank_sessions', filter: buildEqFilter('match_instance_id', value) }]
    default:
      return [{ table: 'rank_sessions', filter: null }]
  }
}

function describeRankSessionMetaTopic(segments) {
  if (!segments.length) return [{ table: 'rank_session_meta', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'session':
      return [{ table: 'rank_session_meta', filter: buildEqFilter('session_id', value) }]
    case 'owner':
      return [{ table: 'rank_session_meta', filter: buildEqFilter('occupant_owner_id', value) }]
    default:
      return [{ table: 'rank_session_meta', filter: null }]
  }
}

function describeRankMatchRosterTopic(segments) {
  if (!segments.length) return [{ table: 'rank_match_roster', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'game':
      return [{ table: 'rank_match_roster', filter: buildEqFilter('game_id', value) }]
    case 'match':
      return [{ table: 'rank_match_roster', filter: buildEqFilter('match_instance_id', value) }]
    case 'room':
      return [{ table: 'rank_match_roster', filter: buildEqFilter('room_id', value) }]
    case 'owner':
      return [{ table: 'rank_match_roster', filter: buildEqFilter('owner_id', value) }]
    case 'session':
      return [{ table: 'rank_match_roster', filter: buildEqFilter('session_id', value) }]
    default:
      return [{ table: 'rank_match_roster', filter: null }]
  }
}

function describeRankTurnsTopic(segments) {
  if (!segments.length) return [{ table: 'rank_turns', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'session':
      return [{ table: 'rank_turns', filter: buildEqFilter('session_id', value) }]
    case 'match':
      return [{ table: 'rank_turns', filter: buildEqFilter('match_instance_id', value) }]
    default:
      return [{ table: 'rank_turns', filter: null }]
  }
}

function describeRankTurnStateEventsTopic(segments) {
  if (!segments.length) return [{ table: 'rank_turn_state_events', filter: null }]
  const [qualifier, value] = segments
  switch (qualifier) {
    case 'session':
      return [{ table: 'rank_turn_state_events', filter: buildEqFilter('session_id', value) }]
    case 'match':
      return [{ table: 'rank_turn_state_events', filter: buildEqFilter('match_instance_id', value) }]
    default:
      return [{ table: 'rank_turn_state_events', filter: null }]
  }
}

function parseTopicDescriptors(topic) {
  const raw = normaliseTopic(topic)
  if (!raw) return []
  const segments = raw.split(':').filter(Boolean)
  if (!segments.length) return []
  const root = segments.shift()

  switch (root) {
    case 'messages':
      return describeMessageTopic(segments)
    case 'rank_queue_tickets':
      return describeRankQueueTopic(segments)
    case 'rank_rooms':
      return describeRankRoomsTopic(segments)
    case 'rank_sessions':
      return describeRankSessionsTopic(segments)
    case 'rank_session_meta':
      return describeRankSessionMetaTopic(segments)
    case 'rank_match_roster':
      return describeRankMatchRosterTopic(segments)
    case 'rank_turns':
      return describeRankTurnsTopic(segments)
    case 'rank_turn_state_events':
      return describeRankTurnStateEventsTopic(segments)
    default:
      return []
  }
}

function normaliseChangePayload(payload, topic, fallbackEvent) {
  const eventType = normaliseEvent(payload?.eventType || payload?.event || fallbackEvent) || 'INSERT'
  return {
    topic,
    eventType,
    event: eventType,
    schema: payload?.schema || payload?.schema_name || null,
    table: payload?.table || payload?.table_name || null,
    new: payload?.new ?? null,
    old: payload?.old ?? null,
    record: payload?.new ?? null,
    payload,
    commit_timestamp: payload?.commit_timestamp || null,
  }
}

export function subscribeToBroadcastTopic(topic, handler, options = {}) {
  const descriptors = parseTopicDescriptors(topic)
  if (!descriptors.length) {
    console.warn('[realtime] 지원되지 않는 토픽으로 인해 구독을 건너뜁니다.', { topic })
    return () => {}
  }

  const events = Array.from(
    new Set((Array.isArray(options.events) ? options.events : [options.events]).map(normaliseEvent).filter(Boolean)),
  )
  const effectiveEvents = events.length ? events : DEFAULT_EVENTS
  const safeHandler = typeof handler === 'function' ? handler : () => {}
  const channelName = `pg:${normaliseTopic(topic)}:${Math.random().toString(36).slice(2, 10)}`
  const channel = supabase.channel(channelName)

  descriptors.forEach(({ table, filter }) => {
    effectiveEvents.forEach((eventName) => {
      const params = {
        event: eventName,
        schema: 'public',
        table,
      }
      if (filter) {
        params.filter = filter
      }

      channel.on('postgres_changes', params, (payload) => {
        try {
          safeHandler(normaliseChangePayload(payload, topic, eventName))
        } catch (error) {
          console.error('[realtime] 변경 이벤트 핸들러 실행 중 오류가 발생했습니다.', error)
        }
      })
    })
  })

  channel.subscribe((status, err) => {
    if (typeof options.onStatus === 'function') {
      try {
        options.onStatus(status, {
          topic,
          error: err || null,
          params: channel.params || null,
          connectionState:
            typeof channel.socket?.connectionState === 'function'
              ? channel.socket.connectionState()
              : null,
        })
      } catch (error) {
        console.warn('[realtime] 상태 콜백 실행 중 오류가 발생했습니다.', error)
      }
    }

    if (status === 'CHANNEL_ERROR') {
      console.error('[realtime] Postgres 변경 채널 구독 중 오류가 발생했습니다.', { topic, error: err || null })
    }

    if (status === 'TIMED_OUT') {
      console.error('[realtime] Postgres 변경 채널 구독이 제한 시간 내에 완료되지 않았습니다.', {
        topic,
        error: err || null,
      })
    }

    if (status === 'CLOSED') {
      console.info('[realtime] Postgres 변경 채널이 종료되었습니다.', { topic })
    }
  })

  return () => {
    try {
      channel.unsubscribe()
    } catch (error) {
      console.warn('[realtime] Postgres 채널 구독 해제 중 오류가 발생했습니다.', { topic, error })
    }

    try {
      supabase.removeChannel(channel)
    } catch (error) {
      console.warn('[realtime] Postgres 채널 제거 중 오류가 발생했습니다.', { topic, error })
    }
  }
}

export function subscribeToBroadcastTopics(topics, handler, options = {}) {
  const uniqueTopics = Array.from(new Set((Array.isArray(topics) ? topics : [topics]).filter(Boolean)))
  const unsubscribers = uniqueTopics.map((topic) => subscribeToBroadcastTopic(topic, handler, options))

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe()
        } catch (error) {
          console.warn('[realtime] Postgres 채널 정리 중 오류가 발생했습니다.', error)
        }
      }
    })
  }
}

export async function ensureRealtimeAuth() {
  // Postgres 변경 구독에는 별도의 인증 토큰 동기화가 필요하지 않습니다.
  return null
}
