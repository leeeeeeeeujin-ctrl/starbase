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

function toChannelSuffix(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

function registerChannel({ prefix, key, filter, handler, registry }) {
  if (!filter) return null

  const signature = `${filter}`.trim()
  if (!signature || registry.filters.has(signature)) {
    return null
  }

  registry.filters.add(signature)

  const suffix = toChannelSuffix(key || signature)
  const channel = supabase
    .channel(`${prefix}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: signature },
      (payload) => {
        if (typeof handler === 'function' && payload?.new) {
          handler(payload.new)
        }
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('채팅 실시간 채널을 구독하지 못했습니다.', {
          prefix,
          key: suffix,
          filter: signature,
        })
      }
    })

  registry.channels.push(channel)
  return channel
}

export function subscribeToMessages({
  onInsert,
  channelName = 'rank-chat-stream',
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  heroId = null,
  ownerId = null,
  userId = null,
} = {}) {
  const handler = typeof onInsert === 'function' ? onInsert : () => {}
  const prefix = channelName || 'rank-chat-stream'
  const registry = { channels: [], filters: new Set() }

  const normalizedOwnerId = ownerId || userId || null
  const normalizedHeroId = heroId || null

  registerChannel({
    prefix,
    key: 'lobby',
    filter: 'channel_type=eq.lobby',
    handler,
    registry,
  })

  registerChannel({
    prefix,
    key: 'system',
    filter: 'channel_type=eq.system',
    handler,
    registry,
  })

  if (sessionId) {
    registerChannel({
      prefix,
      key: `session-${sessionId}`,
      filter: `session_id=eq.${sessionId}`,
      handler,
      registry,
    })
  }

  if (matchInstanceId) {
    registerChannel({
      prefix,
      key: `match-${matchInstanceId}`,
      filter: `match_instance_id=eq.${matchInstanceId}`,
      handler,
      registry,
    })
  }

  if (gameId) {
    registerChannel({
      prefix,
      key: `game-${gameId}`,
      filter: `game_id=eq.${gameId}`,
      handler,
      registry,
    })
  }

  if (roomId) {
    registerChannel({
      prefix,
      key: `room-${roomId}`,
      filter: `room_id=eq.${roomId}`,
      handler,
      registry,
    })
  }

  if (normalizedOwnerId) {
    registerChannel({
      prefix,
      key: `owner-${normalizedOwnerId}`,
      filter: `owner_id=eq.${normalizedOwnerId}`,
      handler,
      registry,
    })

    registerChannel({
      prefix,
      key: `target-owner-${normalizedOwnerId}`,
      filter: `target_owner_id=eq.${normalizedOwnerId}`,
      handler,
      registry,
    })
  }

  if (normalizedHeroId) {
    registerChannel({
      prefix,
      key: `hero-${normalizedHeroId}`,
      filter: `hero_id=eq.${normalizedHeroId}`,
      handler,
      registry,
    })

    registerChannel({
      prefix,
      key: `target-hero-${normalizedHeroId}`,
      filter: `target_hero_id=eq.${normalizedHeroId}`,
      handler,
      registry,
    })
  }

  return () => {
    for (const channel of registry.channels) {
      try {
        supabase.removeChannel(channel)
      } catch (error) {
        console.error('채팅 실시간 채널을 해제하지 못했습니다.', error)
      }
    }
  }
}
