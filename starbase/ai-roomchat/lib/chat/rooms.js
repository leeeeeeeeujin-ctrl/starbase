"use client"

import { supabase } from '@/lib/supabase'

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

export async function markChatRoomRead({ roomId, messageId = null }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.')
  }

  const { data, error } = await supabase.rpc('mark_chat_room_read', {
    p_room_id: roomId,
    p_message_id: messageId || null,
  })

  if (error) {
    throw error
  }

  return data || { ok: true }
}
