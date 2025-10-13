"use client"

import { supabase } from '../supabase'

export const MESSAGE_LIMIT = 30

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

export async function fetchRecentMessages({
  limit = MESSAGE_LIMIT,
  sessionId = null,
  matchInstanceId = null,
} = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, 500))
  const { data, error } = await supabase.rpc('fetch_rank_chat_threads', {
    p_limit: cappedLimit,
    p_session_id: sessionId,
    p_match_instance_id: matchInstanceId,
  })

  if (error) {
    throw error
  }

  if (!data || typeof data !== 'object') {
    return {
      messages: [],
      viewerRole: null,
      sessionId: sessionId || null,
      matchInstanceId: matchInstanceId || null,
      gameId: null,
    }
  }

  const messages = Array.isArray(data.messages) ? data.messages : []

  return {
    messages,
    viewerRole: data.viewerRole || null,
    sessionId: data.sessionId || sessionId || null,
    matchInstanceId: data.matchInstanceId || matchInstanceId || null,
    gameId: data.gameId || null,
  }
}

export async function insertMessage(payload, context = {}) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (!text) {
    throw new Error('메시지가 비어 있습니다.')
  }

  const scope = payload?.scope || 'global'
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : null
  const { data, error } = await supabase.rpc('send_rank_chat_message', {
    p_scope: scope,
    p_text: text,
    p_session_id: context.sessionId || null,
    p_match_instance_id: context.matchInstanceId || null,
    p_game_id: context.gameId || null,
    p_room_id: context.roomId || null,
    p_hero_id: payload?.hero_id || null,
    p_target_hero_id: payload?.target_hero_id || null,
    p_target_role: payload?.target_role || null,
    p_metadata: metadata,
  })

  if (error) {
    throw error
  }

  return data || null
}

export function subscribeToMessages({
  onInsert,
  channelName = 'rank-chat-stream',
  sessionId = null,
  matchInstanceId = null,
} = {}) {
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
