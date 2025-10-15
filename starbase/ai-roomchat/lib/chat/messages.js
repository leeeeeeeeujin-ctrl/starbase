"use client"

import { supabase } from '../supabase'
import { ensureRealtimeAuth } from '../realtime/auth'
import { createDraftyFromText, inspectDrafty } from './drafty'

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
  chatRoomId = null,
  scope = null,
} = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, 500))
  const { data, error } = await supabase.rpc('fetch_rank_chat_threads', {
    p_limit: cappedLimit,
    p_session_id: sessionId,
    p_match_instance_id: matchInstanceId,
    p_chat_room_id: chatRoomId,
    p_scope: scope || null,
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
    chatRoomId: chatRoomId || null,
  }
}

export async function insertMessage(payload, context = {}) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (!text) {
    throw new Error('메시지가 비어 있습니다.')
  }

  const scope = payload?.scope || 'global'
  const draftyDoc = createDraftyFromText(text)
  const summary = inspectDrafty(draftyDoc)
  const metadataBase = payload?.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {}
  metadataBase.drafty = metadataBase.drafty || draftyDoc
  metadataBase.plain_text = metadataBase.plain_text || summary.plainText || text
  if (!metadataBase.summary) {
    metadataBase.summary = {
      has_links: summary.hasLinks,
      has_mentions: summary.hasMentions,
      has_hashtags: summary.hasHashtags,
    }
  }

  const { data, error } = await supabase.rpc('send_rank_chat_message', {
    p_scope: scope,
    p_text: text,
    p_session_id: context.sessionId || null,
    p_match_instance_id: context.matchInstanceId || null,
    p_game_id: context.gameId || null,
    p_room_id: context.roomId || null,
    p_chat_room_id: context.chatRoomId || null,
    p_hero_id: payload?.hero_id || null,
    p_target_hero_id: payload?.target_hero_id || null,
    p_target_role: payload?.target_role || null,
    p_metadata: metadataBase,
  })

  if (error) {
    throw error
  }

  return data || null
}

function toComparable(value) {
  if (value === null || value === undefined) {
    return null
  }
  const token = String(value).trim()
  return token.length ? token.toLowerCase() : null
}

function listIncludesIdentifier(list, identifier) {
  if (!identifier) return false
  if (!Array.isArray(list) || !list.length) return false
  const target = toComparable(identifier)
  if (!target) return false
  return list.some((entry) => toComparable(entry) === target)
}

function messageMatchesContext(record, context) {
  if (!record) {
    return false
  }

  const {
    scope,
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    chatRoomId,
    heroId,
    ownerId,
    userId,
  } = context

  const recordScope = toComparable(record.scope)
  const recordSession = toComparable(record.session_id)
  const recordMatch = toComparable(record.match_instance_id)
  const recordGame = toComparable(record.game_id)
  const recordRoom = toComparable(record.room_id)
  const recordChatRoom = toComparable(record.chat_room_id)
  const recordHero = toComparable(record.hero_id)
  const recordTargetHero = toComparable(record.target_hero_id)
  const recordOwner = toComparable(record.owner_id)
  const recordTargetOwner = toComparable(record.target_owner_id)
  const recordUser = toComparable(record.user_id)
  const viewerScope = toComparable(scope)
  const viewerSession = toComparable(sessionId)
  const viewerMatch = toComparable(matchInstanceId)
  const viewerGame = toComparable(gameId)
  const viewerRoom = toComparable(roomId)
  const viewerChatRoom = toComparable(chatRoomId)
  const viewerHero = toComparable(heroId)
  const viewerOwner = toComparable(ownerId)
  const viewerUser = toComparable(userId)

  const matchesScope = !viewerScope || viewerScope === recordScope
  const matchesSession = !viewerSession || viewerSession === recordSession
  const matchesMatch = !viewerMatch || viewerMatch === recordMatch
  const matchesGame = !viewerGame || viewerGame === recordGame
  const matchesRoom = !viewerRoom || viewerRoom === recordRoom
  const matchesChatRoom = !viewerChatRoom || viewerChatRoom === recordChatRoom

  const visibility = Array.isArray(record.visible_owner_ids)
    ? record.visible_owner_ids
    : []
  const visibilityAllowsViewer =
    !visibility.length ||
    (viewerOwner && listIncludesIdentifier(visibility, viewerOwner)) ||
    (viewerUser && listIncludesIdentifier(visibility, viewerUser))

  const heroAllowed =
    !viewerHero ||
    recordHero === viewerHero ||
    recordTargetHero === viewerHero ||
    visibilityAllowsViewer

  const ownerAllowed =
    !viewerOwner ||
    recordOwner === viewerOwner ||
    recordTargetOwner === viewerOwner ||
    visibilityAllowsViewer

  const userAllowed =
    !viewerUser || recordUser === viewerUser || visibilityAllowsViewer

  return (
    matchesScope &&
    matchesSession &&
    matchesMatch &&
    matchesGame &&
    matchesRoom &&
    matchesChatRoom &&
    heroAllowed &&
    ownerAllowed &&
    userAllowed &&
    visibilityAllowsViewer
  )
}

export function subscribeToMessages({
  onInsert,
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  chatRoomId = null,
  scope = null,
  heroId = null,
  ownerId = null,
  userId = null,
  channelName = null,
} = {}) {
  const handler = typeof onInsert === 'function' ? onInsert : () => {}

  const context = {
    scope,
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    chatRoomId,
    heroId,
    ownerId,
    userId,
  }

  ensureRealtimeAuth()

  const topic = channelName
    ? String(channelName)
    : `pgchanges_messages_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const channel = supabase.channel(topic)

  const forwardChange = (payload) => {
    if (!payload || !payload.new) {
      return
    }

    const record = payload.new
    if (!messageMatchesContext(record, context)) {
      return
    }

    try {
      handler(record, payload)
    } catch (error) {
      console.error('[realtime] 메시지 핸들러 실행 중 오류가 발생했습니다.', error)
    }
  }

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    forwardChange,
  )
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'messages' },
    forwardChange,
  )

  let active = true

  try {
    const subscription = channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] 메시지 채널 상태 이상이 감지되었습니다.', {
          topic,
          status,
          error: err || null,
        })
      }

      if (status === 'CLOSED') {
        console.info('[realtime] 메시지 채널이 종료되었습니다.', { topic })
      }
    })

    if (subscription && typeof subscription.catch === 'function') {
      subscription.catch((error) => {
        console.error('[realtime] 메시지 채널 구독에 실패했습니다.', { topic, error })
      })
    }
  } catch (error) {
    console.error('[realtime] 메시지 채널을 구독하지 못했습니다.', { topic, error })
  }

  return () => {
    if (!active) {
      return
    }
    active = false

    try {
      channel.unsubscribe()
    } catch (error) {
      console.warn('[realtime] 메시지 채널 구독 해제에 실패했습니다.', { topic: channelName, error })
    }

    try {
      supabase.removeChannel(channel)
    } catch (error) {
      console.warn('[realtime] 메시지 채널 제거 중 오류가 발생했습니다.', { topic: channelName, error })
    }
  }
}
