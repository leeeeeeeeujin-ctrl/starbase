"use client"

import { supabase } from '@/lib/supabase'
import { ensureRealtimeAuth } from './broadcast'

let channelCounter = 0

function buildChannelName(schema, table) {
  const baseSchema = schema && String(schema).trim().length ? schema.trim() : 'public'
  const baseTable = table && String(table).trim().length ? table.trim() : 'unknown'
  channelCounter += 1
  return `postgres:${baseSchema}:${baseTable}:${channelCounter}`
}

function normalizeEventName(event) {
  if (!event) return '*'
  const trimmed = String(event).trim()
  return trimmed.length ? trimmed.toUpperCase() : '*'
}

export function subscribeToPostgresChanges({
  schema = 'public',
  table,
  event = '*',
  filter = null,
  filters = null,
  handler,
  onStatus,
} = {}) {
  if (!table) {
    return () => {}
  }

  const normalizedEvent = normalizeEventName(event)
  const safeHandler = typeof handler === 'function' ? handler : () => {}
  const channelName = buildChannelName(schema, table)
  const channel = supabase.channel(channelName)
  const statusHandlers = new Set()
  const delivered = new Map()

  const normalizeFilter = (value) => {
    if (value === null || value === undefined) {
      return null
    }

    const token = String(value).trim()
    return token.length ? token : null
  }

  const filterList = Array.isArray(filters) && filters?.length ? filters : [filter]
  const normalizedFilters = Array.from(
    new Set(filterList.map((item) => normalizeFilter(item)).filter((item) => item !== null)),
  )
  const filterEntries = normalizedFilters.length ? normalizedFilters : [null]

  if (typeof onStatus === 'function') {
    statusHandlers.add(onStatus)
  }

  let active = true
  let subscribed = false

  const listeners = []

  const shouldDeliver = (payload) => {
    if (!payload || typeof payload !== 'object') {
      return true
    }

    const record = payload.new || payload.record || null
    const eventType = payload.eventType || payload.type || normalizedEvent
    const identifier = record?.id || payload.commit_timestamp || payload.timestamp || null

    if (!identifier) {
      return true
    }

    const key = `${eventType || '*'}:${identifier}`
    const now = Date.now()
    const previous = delivered.get(key) || 0

    if (now - previous < 1000) {
      return false
    }

    delivered.set(key, now)
    if (delivered.size > 1024) {
      const threshold = now - 1000
      for (const [entryKey, timestamp] of delivered.entries()) {
        if (timestamp < threshold) {
          delivered.delete(entryKey)
        }
      }
    }

    return true
  }

  filterEntries.forEach((filterToken) => {
    const listenerState = { active: true }
    channel.on(
      'postgres_changes',
      {
        event: normalizedEvent === '*' ? '*' : normalizedEvent,
        schema,
        table,
        filter: filterToken || undefined,
      },
      (payload) => {
        if (!active || !listenerState.active) return
        if (!shouldDeliver(payload)) {
          return
        }
        try {
          safeHandler(payload)
        } catch (error) {
          console.warn('[realtime] Postgres 변경 이벤트 처리 중 오류가 발생했습니다.', error)
        }
      },
    )
    listeners.push(listenerState)
  })

  const subscribePromise = (async () => {
    try {
      await ensureRealtimeAuth()
      await new Promise((resolve, reject) => {
        channel.subscribe((status) => {
          if (statusHandlers.size) {
            statusHandlers.forEach((listener) => {
              try {
                listener(status, { channel: channelName })
              } catch (error) {
                console.warn('[realtime] Postgres 채널 상태 콜백 실행 중 오류가 발생했습니다.', error)
              }
            })
          }

          if (status === 'SUBSCRIBED') {
            subscribed = true
            resolve()
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error(`채널 구독에 실패했습니다: ${channelName}`))
          }
        })
      })
    } catch (error) {
      console.error('[realtime] Postgres 구독 중 오류가 발생했습니다.', error)
      throw error
    }
  })()

  subscribePromise.catch(() => {})

  return () => {
    if (!active) {
      return
    }
    active = false
    delivered.clear()
    statusHandlers.clear()

    listeners.forEach((listener) => {
      listener.active = false
    })

    try {
      if (subscribed) {
        channel.unsubscribe()
      }
    } catch (error) {
      console.warn('[realtime] Postgres 채널 구독 해제 중 오류가 발생했습니다.', error)
    }

    try {
      supabase.removeChannel(channel)
    } catch (error) {
      console.warn('[realtime] Postgres 채널 제거 중 오류가 발생했습니다.', error)
    }
  }
}
