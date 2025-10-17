"use client"

import { supabase } from '@/lib/supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeUuid(value) {
  if (!value && value !== 0) {
    return null
  }
  const token = String(value).trim()
  if (!token || !UUID_PATTERN.test(token)) {
    return null
  }
  return token
}

export async function fetchChatDashboard({ limit = 24 } = {}) {
  const { data, error } = await supabase.rpc('fetch_chat_dashboard', {
    p_limit: Math.max(8, Math.min(limit || 24, 120)),
  })

  if (error) {
    throw error
  }

  return data || {
    heroes: [],
    rooms: [],
    publicRooms: [],
    sessions: [],
    contacts: [],
  }
}

export async function fetchChatRooms({ search = '', limit = 24 } = {}) {
  const { data, error } = await supabase.rpc('fetch_chat_rooms', {
    p_search: search && search.trim() ? search.trim() : null,
    p_limit: Math.max(5, Math.min(limit || 24, 120)),
  })

  if (error) {
    throw error
  }

  return data || { joined: [], available: [] }
}

export async function markChatRoomRead({ roomId, messageId = null } = {}) {
  const normalizedRoomId = normalizeUuid(roomId)
  if (!normalizedRoomId) {
    return { ok: false, skipped: true, reason: 'invalid_room_id' }
  }

  const normalizedMessageId = normalizeUuid(messageId)

  const { data, error } = await supabase.rpc('mark_chat_room_read', {
    p_room_id: normalizedRoomId,
    p_message_id: normalizedMessageId,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}

export async function createChatRoom(payload) {
  const options = payload || {}
  const name = typeof options.name === 'string' ? options.name.trim() : ''
  if (!name) {
    throw new Error('방 이름을 입력해 주세요.')
  }

  const { data, error } = await supabase.rpc('create_chat_room', {
    p_name: name,
    p_description:
      typeof options.description === 'string' ? options.description.trim() : '',
    p_visibility:
      typeof options.visibility === 'string' ? options.visibility.trim() : 'private',
    p_capacity: Number.isFinite(options.capacity) ? options.capacity : 20,
    p_allow_ai: options.allowAi !== false,
    p_require_approval: options.requireApproval === true,
    p_hero_id: options.heroId || null,
  })

  if (error) {
    throw error
  }

  return data
}

export async function joinChatRoom({ roomId, heroId = null }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('join_chat_room', {
    p_room_id: roomId,
    p_hero_id: heroId,
  })

  if (error) {
    throw error
  }

  return data
}

export async function leaveChatRoom({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('leave_chat_room', {
    p_room_id: roomId,
  })

  if (error) {
    throw error
  }

  return !!data
}

export async function deleteChatRoom({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('delete_chat_room', {
    p_room_id: roomId,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}

export async function manageChatRoomRole({
  roomId,
  targetOwnerId,
  action,
  durationMinutes = null,
  reason = null,
}) {
  if (!roomId || !targetOwnerId || !action) {
    throw new Error('roomId, targetOwnerId, action이 필요합니다.')
  }

  const duration = Number.isFinite(durationMinutes) ? Math.max(1, Math.floor(durationMinutes)) : null

  const { data, error } = await supabase.rpc('manage_chat_room_role', {
    p_room_id: roomId,
    p_target_owner: targetOwnerId,
    p_action: action,
    p_duration_minutes: duration,
    p_reason: typeof reason === 'string' ? reason.trim() || null : null,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}

export async function fetchChatRoomBans({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_bans', {
    p_room_id: roomId,
  })

  if (error) {
    throw error
  }

  return (data?.bans && Array.isArray(data.bans) ? data.bans : []).map((ban) => ({
    ...ban,
    expires_at: ban?.expires_at || null,
    owner_name: ban?.owner_name || null,
    owner_email: ban?.owner_email || null,
  }))
}

export async function updateChatRoomBan({ roomId, ownerId, durationMinutes = null, reason = null }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }
  if (!ownerId) {
    throw new Error('ownerId가 필요합니다.')
  }

  const payload = {
    p_room_id: roomId,
    p_owner_id: ownerId,
    p_duration_minutes:
      durationMinutes === null || durationMinutes === undefined ? null : Number(durationMinutes),
    p_reason: reason ?? null,
  }

  const { data, error } = await supabase.rpc('update_chat_room_ban', payload)

  if (error) {
    throw error
  }

  return data?.ban || null
}

export async function fetchChatRoomAnnouncements({
  roomId,
  limit = 20,
  cursor = null,
}) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_announcements', {
    p_room_id: roomId,
    p_limit: Math.max(5, Math.min(limit || 20, 100)),
    p_cursor: cursor || null,
  })

  if (error) {
    throw error
  }

  return {
    announcements: Array.isArray(data?.announcements) ? data.announcements : [],
    pinned: data?.pinned || null,
    hasMore: Boolean(data?.hasMore),
  }
}

export async function fetchChatRoomAnnouncementDetail({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_announcement_detail', {
    p_announcement_id: announcementId,
  })

  if (error) {
    throw error
  }

  return {
    announcement: data?.announcement || null,
    comments: Array.isArray(data?.comments) ? data.comments : [],
  }
}

export async function createChatRoomAnnouncement({ roomId, content, pinned = false }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) {
    throw new Error('공지 내용을 입력해 주세요.')
  }

  const { data, error } = await supabase.rpc('create_chat_room_announcement', {
    p_room_id: roomId,
    p_content: text,
    p_pinned: pinned === true,
  })

  if (error) {
    throw error
  }

  return data?.announcement || null
}

export async function deleteChatRoomAnnouncement({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('delete_chat_room_announcement', {
    p_announcement_id: announcementId,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}

export async function toggleChatRoomAnnouncementReaction({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('toggle_chat_room_announcement_reaction', {
    p_announcement_id: announcementId,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}

export async function createChatRoomAnnouncementComment({ announcementId, content }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.')
  }

  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) {
    throw new Error('댓글을 입력해 주세요.')
  }

  const { data, error } = await supabase.rpc('create_chat_room_announcement_comment', {
    p_announcement_id: announcementId,
    p_content: text,
  })

  if (error) {
    throw error
  }

  return data?.comment || null
}

export async function fetchChatRoomStats({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_stats', {
    p_room_id: roomId,
  })

  if (error) {
    throw error
  }

  return data?.stats || {}
}

export async function fetchChatMemberPreferences({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('fetch_chat_member_preferences', {
    p_room_id: roomId,
  })

  if (error) {
    throw error
  }

  return data?.preferences || null
}

export async function saveChatMemberPreferences({ roomId, preferences = {} }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('upsert_chat_member_preferences', {
    p_room_id: roomId,
    p_preferences: preferences,
  })

  if (error) {
    throw error
  }

  return data?.preferences || null
}

export async function updateChatRoomSettings({ roomId, settings = {} }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('update_chat_room_settings', {
    p_room_id: roomId,
    p_settings: settings,
  })

  if (error) {
    throw error
  }

  return data?.settings || null
}
