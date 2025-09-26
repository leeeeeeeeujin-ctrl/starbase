"use client"

import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export const MESSAGE_LIMIT = 200

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return user || null
}

export async function fetchRecentMessages({ limit = MESSAGE_LIMIT } = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, MESSAGE_LIMIT))

  const { data, error } = await withTable(supabase, 'messages', (table) =>
    supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .limit(cappedLimit),
  )

  if (error) {
    throw error
  }

  return Array.isArray(data) ? data : []
}

function isMissingColumnError(error) {
  if (!error) return false
  if (error.code === '42703') return true
  const merged = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (!merged.trim()) return false
  if (merged.includes('column') && merged.includes('does not exist')) return true
  if (merged.includes('column') && merged.includes('not exist')) return true
  if (merged.includes('missing required column')) return true
  return false
}

function buildLegacyPayload(payload) {
  const ownerId = payload.owner_id || payload.user_id || null
  return {
    owner_id: ownerId,
    username: payload.username,
    avatar_url: payload.avatar_url ?? null,
    text: payload.text,
  }
}

export async function insertMessage(payload) {
  const firstAttempt = await withTable(supabase, 'messages', (table) =>
    supabase.from(table).insert(payload),
  )

  if (!firstAttempt.error) {
    return
  }

  if (!isMissingColumnError(firstAttempt.error)) {
    throw firstAttempt.error
  }

  const legacyPayload = buildLegacyPayload(payload)
  const fallback = await withTable(supabase, 'messages', (table) =>
    supabase.from(table).insert(legacyPayload),
  )

  if (fallback.error) {
    throw fallback.error
  }
}

export function subscribeToMessages({ onInsert, channelName = 'messages-stream' }) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      if (typeof onInsert === 'function' && payload?.new) {
        onInsert(payload.new)
      }
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
