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

let sharedMessageChannel = null
let sharedChannelSubscribed = false
let sharedSubscriberCount = 0

function getOrCreateMessageChannel() {
  if (!sharedMessageChannel) {
    sharedMessageChannel = supabase.channel('realtime:public:messages')
    sharedChannelSubscribed = false
  }

  return sharedMessageChannel
}

function subscribeSharedChannel(channel, filters, handler) {
  if (!channel || !filters.length) {
    return () => {}
  }

  const listeners = []
  const wrappedHandler = (payload, listenerState) => {
    if (!listenerState.active) {
      return
    }

    if (typeof handler === 'function' && payload?.new) {
      handler(payload.new)
    }
  }

  filters.forEach((filter) => {
    const signature = `${filter}`.trim()
    if (!signature) {
      return
    }

    const listenerState = { active: true }
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: signature },
      (payload) => wrappedHandler(payload, listenerState),
    )

    listeners.push(listenerState)
  })

  if (!sharedChannelSubscribed) {
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('채팅 실시간 채널을 구독하지 못했습니다.', {
          channel: channel.topic,
          filters,
        })
      }
    })

    sharedChannelSubscribed = true
  }

  sharedSubscriberCount += 1

  return () => {
    listeners.forEach((listenerState) => {
      listenerState.active = false
    })

    sharedSubscriberCount = Math.max(sharedSubscriberCount - 1, 0)

    if (sharedSubscriberCount === 0 && sharedMessageChannel) {
      try {
        sharedMessageChannel.unsubscribe()
        supabase.removeChannel(sharedMessageChannel)
      } catch (error) {
        console.error('채팅 실시간 채널을 해제하지 못했습니다.', error)
      } finally {
        sharedMessageChannel = null
        sharedChannelSubscribed = false
      }
    }
  }
}

export function subscribeToMessages({
  onInsert,
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  heroId = null,
  ownerId = null,
  userId = null,
} = {}) {
  const handler = typeof onInsert === 'function' ? onInsert : () => {}
  const channel = getOrCreateMessageChannel()
  const filters = []
  const normalizedOwnerId = ownerId || userId || null
  const normalizedHeroId = heroId || null

  filters.push('channel_type=eq.lobby')
  filters.push('channel_type=eq.system')
  filters.push('channel_type=eq.main')
  filters.push('channel_type=eq.role')
  filters.push('channel_type=eq.whisper')

  if (sessionId) {
    filters.push(`session_id=eq.${sessionId}`)
  }

  if (matchInstanceId) {
    filters.push(`match_instance_id=eq.${matchInstanceId}`)
  }

  if (gameId) {
    filters.push(`game_id=eq.${gameId}`)
  }

  if (roomId) {
    filters.push(`room_id=eq.${roomId}`)
  }

  if (normalizedOwnerId) {
    filters.push(`owner_id=eq.${normalizedOwnerId}`)
    filters.push(`target_owner_id=eq.${normalizedOwnerId}`)
  }

  if (normalizedHeroId) {
    filters.push(`hero_id=eq.${normalizedHeroId}`)
    filters.push(`target_hero_id=eq.${normalizedHeroId}`)
  }

  const uniqueFilters = Array.from(new Set(filters.filter(Boolean)))

  if (!uniqueFilters.length) {
    return () => {}
  }

  return subscribeSharedChannel(channel, uniqueFilters, handler)
}
