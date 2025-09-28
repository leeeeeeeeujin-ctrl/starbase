"use client"

import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export const MESSAGE_LIMIT = 120

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

const MESSAGE_COLUMN_CANDIDATES = [
  '*',
  'id,created_at,text,scope,target_hero_id,hero_id,owner_id,user_id,username,avatar_url',
  'id,created_at,text,scope,hero_id,owner_id,username,avatar_url',
  'id,created_at,text,hero_id,owner_id,username',
  'id,created_at,text,username',
  'id,created_at,text',
]

export async function fetchRecentMessages({ limit = MESSAGE_LIMIT } = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, MESSAGE_LIMIT))
  let lastError = null

  for (const columnSet of MESSAGE_COLUMN_CANDIDATES) {
    const { data, error } = await withTable(supabase, 'messages', (table) =>
      supabase
        .from(table)
        .select(columnSet)
        .order('created_at', { ascending: true })
        .limit(cappedLimit),
    )

    if (!error) {
      return Array.isArray(data) ? data : []
    }

    lastError = error
    if (!isMissingColumnError(error)) {
      break
    }
  }

  if (lastError) {
    throw lastError
  }

  return []
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
