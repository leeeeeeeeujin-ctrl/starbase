"use client"

import { supabase } from '@/lib/supabase'

let realtimeToken = null
let authPromise = null

async function ensureRealtimeAuth() {
  if (authPromise) {
    return authPromise
  }

  authPromise = (async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        throw error
      }

      const token = session?.access_token || null

      if (token !== realtimeToken) {
        await supabase.realtime.setAuth(token || null)
        realtimeToken = token
      }
    } finally {
      authPromise = null
    }
  })()

  return authPromise
}

function normalizeBroadcastPayload(payload, topic) {
  const basePayload = payload?.payload && typeof payload.payload === 'object' ? payload.payload : payload || {}
  const eventTypeRaw = payload?.event || payload?.type || basePayload?.event || ''
  const eventType = eventTypeRaw ? String(eventTypeRaw).toUpperCase() : 'INSERT'
  const schema = basePayload?.schema || basePayload?.schema_name || null
  const table = basePayload?.table || basePayload?.table_name || null
  const commitTimestamp =
    basePayload?.commit_timestamp || basePayload?.commitTimestamp || basePayload?.timestamp || null
  const newRecord = basePayload?.new || basePayload?.record || null
  const oldRecord = basePayload?.old || null

  return {
    topic,
    eventType,
    event: eventType,
    schema,
    table,
    new: newRecord,
    old: oldRecord,
    record: newRecord,
    payload: basePayload,
    commit_timestamp: commitTimestamp,
    raw: payload,
  }
}

export function subscribeToBroadcastTopic(
  topic,
  handler,
  { events = ['INSERT', 'UPDATE', 'DELETE'], ack = false, privateChannel = true, onStatus } = {},
) {
  if (!topic) {
    return () => {}
  }

  const channelConfig = { broadcast: { ack } }
  if (privateChannel) {
    channelConfig.private = true
  }

  const channel = supabase.channel(topic, { config: channelConfig })

  const safeHandler = typeof handler === 'function' ? handler : () => {}
  const normalizedEvents = Array.from(new Set((Array.isArray(events) ? events : [events]).filter(Boolean)))

  normalizedEvents.forEach((event) => {
    const eventName = typeof event === 'string' && event.trim() ? event.trim().toUpperCase() : 'INSERT'
    channel.on('broadcast', { event: eventName }, (payload) => {
      safeHandler(normalizeBroadcastPayload(payload, topic))
    })
  })

  ensureRealtimeAuth()
    .then(() =>
      channel.subscribe((status) => {
        if (typeof onStatus === 'function') {
          onStatus(status, { topic })
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[realtime] 채널 구독 중 오류가 발생했습니다.', { topic })
        }
      }),
    )
    .catch((error) => {
      console.error('[realtime] 인증 토큰을 갱신하지 못했습니다.', { error, topic })
      if (typeof onStatus === 'function') {
        onStatus('CHANNEL_ERROR', { topic, error })
      }
    })

  return () => {
    try {
      channel.unsubscribe()
    } catch (error) {
      console.warn('[realtime] 채널 구독을 해제하지 못했습니다.', { error, topic })
    }
    supabase.removeChannel(channel)
  }
}

export function subscribeToBroadcastTopics(topics, handler, options = {}) {
  if (!Array.isArray(topics) || !topics.length) {
    return () => {}
  }

  const uniqueTopics = Array.from(new Set(topics.filter((topic) => typeof topic === 'string' && topic.trim().length)))
  if (!uniqueTopics.length) {
    return () => {}
  }

  const unsubscribers = uniqueTopics.map((topic) => subscribeToBroadcastTopic(topic, handler, options))

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe()
        }
      } catch (error) {
        console.warn('[realtime] 다중 채널 구독 해제 중 오류가 발생했습니다.', { error, topic })
      }
    })
  }
}

