"use client"

import { supabase } from '@/lib/supabase'

let realtimeToken = null
let authPromise = null
const channelRegistry = new Map()

const BROADCAST_PREFIXES = ['topic:', 'broadcast:', 'realtime:']

function normalizeTopicName(topic) {
  if (!topic) return null
  const trimmed = String(topic).trim()
  if (!trimmed) return null

  const lowered = trimmed.toLowerCase()
  const hasPrefix = BROADCAST_PREFIXES.some((prefix) => lowered.startsWith(prefix))

  if (hasPrefix) {
    return trimmed
  }

  return `topic:${trimmed}`
}

export async function ensureRealtimeAuth() {
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

function normalizeBroadcastPayload(payload, topic, fallbackEvent) {
  const basePayload = payload?.payload && typeof payload.payload === 'object' ? payload.payload : payload || {}
  const eventTypeRaw = payload?.event || payload?.type || basePayload?.event || ''
  const fallback = fallbackEvent ? String(fallbackEvent).toUpperCase() : 'INSERT'
  const eventType = eventTypeRaw ? String(eventTypeRaw).toUpperCase() : fallback
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
  const normalizedTopic = normalizeTopicName(topic)
  if (!normalizedTopic) {
    return () => {}
  }

  const safeHandler = typeof handler === 'function' ? handler : () => {}
  const normalizedEvents = Array.from(new Set((Array.isArray(events) ? events : [events]).filter(Boolean)))

  let entry = channelRegistry.get(normalizedTopic)
  if (!entry) {
    const channelOptions = {
      config: {
        private: privateChannel,
        broadcast: {
          ack: ack || false,
        },
      },
    }

    const channel = supabase.channel(normalizedTopic, channelOptions)
    entry = {
      channel,
      refCount: 0,
      statusHandlers: new Set(),
      lastStatus: null,
      lastError: null,
      subscriptionPromise: null,
    }
    channelRegistry.set(normalizedTopic, entry)

    const subscribeToChannel = async () => {
      try {
        await ensureRealtimeAuth()
        await new Promise((resolve, reject) => {
          const subscription = channel.subscribe((status, err) => {
            const normalizedStatus = status || 'CHANNEL_ERROR'
            const context = {
              topic: normalizedTopic,
              error: err || null,
              params: channel.params || null,
              connectionState:
                typeof channel.socket?.connectionState === 'function'
                  ? channel.socket.connectionState()
                  : null,
            }

            entry.lastStatus = normalizedStatus
            entry.lastError = err || null

            entry.statusHandlers.forEach((listener) => {
              try {
                listener(normalizedStatus, context)
              } catch (error) {
                console.warn('[realtime] 상태 콜백 실행 중 오류가 발생했습니다.', error)
              }
            })

            if (normalizedStatus === 'SUBSCRIBED') {
              resolve(subscription)
              return
            }

            if (normalizedStatus === 'TIMED_OUT') {
              const timeoutError =
                err || new Error('Supabase realtime channel subscription timed out.')
              console.error('[realtime] 채널 구독이 제한 시간 내에 완료되지 않았습니다.', {
                ...context,
              })
              reject(timeoutError)
              return
            }

            if (normalizedStatus === 'CHANNEL_ERROR') {
              console.error('[realtime] 채널 구독 중 오류가 발생했습니다.', {
                ...context,
              })
              reject(err || new Error('Supabase realtime channel returned CHANNEL_ERROR.'))
              return
            }

            if (normalizedStatus === 'CLOSED') {
              console.warn('[realtime] 채널이 서버에 의해 종료되었습니다.', {
                ...context,
              })
              reject(err || new Error('Supabase realtime channel closed before subscribing.'))
            }
          })
        })
      } catch (error) {
        entry.lastStatus = 'CHANNEL_ERROR'
        entry.lastError = error
        entry.statusHandlers.forEach((listener) => {
          try {
            listener('CHANNEL_ERROR', { topic: normalizedTopic, error })
          } catch (handlerError) {
            console.warn('[realtime] 상태 콜백 오류를 처리하지 못했습니다.', handlerError)
          }
        })
        throw error
      }
    }

    entry.subscriptionPromise = subscribeToChannel()
  }

  entry.refCount += 1

  let statusHandler = null
  if (typeof onStatus === 'function') {
    statusHandler = (status, context) => onStatus(status, context)
    entry.statusHandlers.add(statusHandler)
    if (entry.lastStatus) {
      try {
        onStatus(entry.lastStatus, {
          topic: normalizedTopic,
          error: entry.lastError,
          params: entry.channel?.params || null,
          connectionState:
            typeof entry.channel?.socket?.connectionState === 'function'
              ? entry.channel.socket.connectionState()
              : null,
        })
      } catch (error) {
        console.warn('[realtime] 상태 핸들러 실행에 실패했습니다.', error)
      }
    }
  }

  const listeners = []

  normalizedEvents.forEach((event) => {
    const eventName = typeof event === 'string' && event.trim() ? event.trim().toUpperCase() : 'INSERT'
    const listenerState = { active: true }
    const listener = (payload) => {
      if (!listenerState.active) return
      safeHandler(normalizeBroadcastPayload(payload, normalizedTopic, eventName))
    }
    entry.channel.on('broadcast', { event: eventName }, listener)
    listeners.push({ listener, state: listenerState })
  })

  if (entry.subscriptionPromise) {
    entry.subscriptionPromise.catch((error) => {
      console.error('[realtime] 채널 구독에 실패했습니다.', { error, topic: normalizedTopic })
    })
  }

  return () => {
    listeners.forEach(({ state }) => {
      state.active = false
    })

    if (statusHandler) {
      entry.statusHandlers.delete(statusHandler)
    }
    entry.refCount = Math.max(0, entry.refCount - 1)

    if (entry.refCount === 0) {
      channelRegistry.delete(normalizedTopic)
      try {
        entry.channel.unsubscribe()
      } catch (error) {
        console.warn('[realtime] 채널 구독을 해제하지 못했습니다.', { error, topic: normalizedTopic })
      }
      supabase.removeChannel(entry.channel)
    }
  }
}

export function subscribeToBroadcastTopics(topics, handler, options = {}) {
  if (!Array.isArray(topics) || !topics.length) {
    return () => {}
  }

  const uniqueTopics = Array.from(
    new Set(topics.map((topic) => normalizeTopicName(topic)).filter((topic) => typeof topic === 'string' && topic.trim().length)),
  )
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

