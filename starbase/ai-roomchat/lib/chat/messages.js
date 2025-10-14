"use client"

import { subscribeToBroadcastTopics } from '../realtime/broadcast'
import { supabase } from '../supabase'
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

function normalizeIdentifier(value) {
  if (value === null || value === undefined) {
    return null
  }

  const token = String(value).trim()
  return token.length ? token : null
}

function buildMessageTopics({
  sessionId,
  matchInstanceId,
  gameId,
  roomId,
  heroId,
  ownerId,
  userId,
}) {
  const topics = new Set()

  topics.add('messages:global')

  ;['lobby', 'system', 'main', 'role', 'whisper'].forEach((channelType) => {
    topics.add(`messages:channel:${channelType}`)
  })

  const normalizedSession = normalizeIdentifier(sessionId)
  const normalizedMatch = normalizeIdentifier(matchInstanceId)
  const normalizedGame = normalizeIdentifier(gameId)
  const normalizedRoom = normalizeIdentifier(roomId)
  const normalizedHero = normalizeIdentifier(heroId)
  const normalizedOwner = normalizeIdentifier(ownerId)
  const normalizedUser = normalizeIdentifier(userId)

  if (normalizedSession) {
    topics.add(`messages:session:${normalizedSession}`)
  }

  if (normalizedMatch) {
    topics.add(`messages:match:${normalizedMatch}`)
  }

  if (normalizedGame) {
    topics.add(`messages:game:${normalizedGame}`)
  }

  if (normalizedRoom) {
    topics.add(`messages:room:${normalizedRoom}`)
  }

  if (normalizedOwner) {
    topics.add(`messages:owner:${normalizedOwner}`)
    topics.add(`messages:target-owner:${normalizedOwner}`)
  }

  if (normalizedUser && normalizedUser !== normalizedOwner) {
    topics.add(`messages:user:${normalizedUser}`)
  }

  if (normalizedHero) {
    topics.add(`messages:hero:${normalizedHero}`)
    topics.add(`messages:target-hero:${normalizedHero}`)
  }

  return Array.from(topics)
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
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    heroId,
    ownerId,
    userId,
  } = context

  const recordSession = toComparable(record.session_id)
  const recordMatch = toComparable(record.match_instance_id)
  const recordGame = toComparable(record.game_id)
  const recordRoom = toComparable(record.room_id)
  const recordHero = toComparable(record.hero_id)
  const recordTargetHero = toComparable(record.target_hero_id)
  const recordOwner = toComparable(record.owner_id)
  const recordTargetOwner = toComparable(record.target_owner_id)
  const recordUser = toComparable(record.user_id)
  const viewerSession = toComparable(sessionId)
  const viewerMatch = toComparable(matchInstanceId)
  const viewerGame = toComparable(gameId)
  const viewerRoom = toComparable(roomId)
  const viewerHero = toComparable(heroId)
  const viewerOwner = toComparable(ownerId)
  const viewerUser = toComparable(userId)

  const matchesSession = !viewerSession || !recordSession || viewerSession === recordSession
  const matchesMatch = !viewerMatch || !recordMatch || viewerMatch === recordMatch
  const matchesGame = !viewerGame || !recordGame || viewerGame === recordGame
  const matchesRoom = !viewerRoom || !recordRoom || viewerRoom === recordRoom

  const heroAllowed =
    !viewerHero || recordHero === viewerHero || recordTargetHero === viewerHero

  const ownerAllowed =
    !viewerOwner || recordOwner === viewerOwner || recordTargetOwner === viewerOwner

  const userAllowed = !viewerUser || recordUser === viewerUser

  const visibility = Array.isArray(record.visible_owner_ids)
    ? record.visible_owner_ids
    : []
  const visibilityAllowed =
    !visibility.length ||
    (viewerOwner && listIncludesIdentifier(visibility, viewerOwner)) ||
    (viewerUser && listIncludesIdentifier(visibility, viewerUser))

  return (
    matchesSession &&
    matchesMatch &&
    matchesGame &&
    matchesRoom &&
    heroAllowed &&
    ownerAllowed &&
    userAllowed &&
    visibilityAllowed
  )
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
  const topics = buildMessageTopics({
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    heroId,
    ownerId,
    userId,
  })

  const context = {
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    heroId,
    ownerId,
    userId,
  }

  const unsubscribers = []

  unsubscribers.push(
    subscribeToBroadcastTopics(
      topics,
      (change) => {
        if (!change || change.eventType === 'DELETE') {
          return
        }

        const record = change.new
        if (record && typeof handler === 'function') {
          handler(record, change)
        }
      },
      { events: ['INSERT', 'UPDATE'], privateChannel: true },
    ),
  )

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe()
        } catch (error) {
          console.warn('[realtime] 메시지 구독 해제 중 오류가 발생했습니다.', error)
        }
      }
    })
  }
}
