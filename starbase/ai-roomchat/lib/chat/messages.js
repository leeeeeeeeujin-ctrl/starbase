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

export async function insertMessage(payload) {
  const { error } = await withTable(supabase, 'messages', (table) =>
    supabase.from(table).insert(payload),
  )

  if (error) {
    throw error
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
