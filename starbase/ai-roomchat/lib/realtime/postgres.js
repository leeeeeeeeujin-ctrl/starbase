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

  if (typeof onStatus === 'function') {
    statusHandlers.add(onStatus)
  }

  let active = true
  let subscribed = false

  channel.on(
    'postgres_changes',
    {
      event: normalizedEvent === '*' ? '*' : normalizedEvent,
      schema,
      table,
      filter: filter && String(filter).trim().length ? filter : undefined,
    },
    (payload) => {
      if (!active) return
      try {
        safeHandler(payload)
      } catch (error) {
        console.warn('[realtime] Postgres 변경 이벤트 처리 중 오류가 발생했습니다.', error)
      }
    },
  )

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
    statusHandlers.clear()

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
