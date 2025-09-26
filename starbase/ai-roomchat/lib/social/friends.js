'use client'

import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export const EMPTY_REQUESTS = { incoming: [], outgoing: [] }

async function queryFriendships(viewerId) {
  const { data, error } = await withTable(supabase, 'friendships', (table) =>
    supabase
      .from(table)
      .select('id,user_id_a,user_id_b,since,created_at')
      .or(`user_id_a.eq.${viewerId},user_id_b.eq.${viewerId}`),
  )

  if (error) throw error
  return Array.isArray(data) ? data : []
}

async function queryPendingRequests(viewerId) {
  const { data, error } = await withTable(supabase, 'friend_requests', (table) =>
    supabase
      .from(table)
      .select('id,requester_id,addressee_id,status,message,created_at,updated_at')
      .eq('status', 'pending')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
  )

  if (error) throw error
  return Array.isArray(data) ? data : []
}

async function fetchHeroesByOwner(ownerIds) {
  if (!ownerIds?.length) return new Map()
  const unique = Array.from(new Set(ownerIds.filter(Boolean)))
  if (!unique.length) return new Map()

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id,updated_at,created_at')
      .in('owner_id', unique)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false }),
  )

  if (error) throw error

  const directory = new Map()
  for (const hero of data || []) {
    if (!hero?.owner_id) continue
    if (!directory.has(hero.owner_id)) {
      directory.set(hero.owner_id, hero)
    }
  }
  return directory
}

function mapFriendships(rows, heroDirectory, viewerId) {
  return rows.map((row) => {
    const partnerOwnerId = row.user_id_a === viewerId ? row.user_id_b : row.user_id_a
    const hero = partnerOwnerId ? heroDirectory.get(partnerOwnerId) : null
    const createdAt = row.since || row.created_at || new Date().toISOString()

    return {
      friendshipId: row.id,
      friendOwnerId: partnerOwnerId,
      friendHeroId: hero?.id || null,
      friendHeroName: hero?.name || '이름 미확인',
      friendHeroAvatar: hero?.image_url || null,
      createdAt,
      online: false,
      currentHeroId: hero?.id || null,
      currentHeroName: hero?.name || '이름 미확인',
      currentHeroAvatar: hero?.image_url || null,
      currentPage: 'unknown',
      lastSeenAt: createdAt,
    }
  })
}

function mapRequests(rows, heroDirectory, viewerId) {
  if (!rows.length) return EMPTY_REQUESTS

  const incoming = []
  const outgoing = []

  for (const row of rows) {
    const isIncoming = row.addressee_id === viewerId
    const partnerOwnerId = isIncoming ? row.requester_id : row.addressee_id
    const hero = partnerOwnerId ? heroDirectory.get(partnerOwnerId) : null
    const entry = {
      id: row.id,
      status: row.status,
      message: row.message || '',
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      direction: isIncoming ? 'incoming' : 'outgoing',
      partnerOwnerId,
      partnerHeroId: hero?.id || null,
      partnerHeroName: hero?.name || '이름 미확인',
      partnerHeroAvatar: hero?.image_url || null,
      requesterId: row.requester_id,
      addresseeId: row.addressee_id,
    }

    if (isIncoming) {
      incoming.push(entry)
    } else {
      outgoing.push(entry)
    }
  }

  const sorter = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
  incoming.sort(sorter)
  outgoing.sort(sorter)

  return { incoming, outgoing }
}

export async function loadFriendSnapshot(viewerId) {
  const [friendRows, requestRows] = await Promise.all([
    queryFriendships(viewerId),
    queryPendingRequests(viewerId),
  ])

  const ownerIds = new Set()
  for (const row of friendRows) {
    const partnerOwnerId = row.user_id_a === viewerId ? row.user_id_b : row.user_id_a
    if (partnerOwnerId) ownerIds.add(partnerOwnerId)
  }
  for (const row of requestRows) {
    const partnerOwnerId = row.requester_id === viewerId ? row.addressee_id : row.requester_id
    if (partnerOwnerId) ownerIds.add(partnerOwnerId)
  }

  let heroDirectory = new Map()
  if (ownerIds.size) {
    try {
      heroDirectory = await fetchHeroesByOwner(Array.from(ownerIds))
    } catch (error) {
      console.error(error)
    }
  }

  return {
    friends: mapFriendships(friendRows, heroDirectory, viewerId),
    requests: mapRequests(requestRows, heroDirectory, viewerId),
  }
}

export async function requestFriendshipByHero({ viewerId, heroId }) {
  const trimmed = (heroId || '').trim()
  if (!trimmed) {
    throw new Error('캐릭터 ID를 입력하세요.')
  }

  const { data: hero, error: heroError } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select('id,name,image_url,owner_id')
      .eq('id', trimmed)
      .single(),
  )

  if (heroError || !hero) {
    throw new Error('해당 캐릭터를 찾을 수 없습니다.')
  }

  if (hero.owner_id === viewerId) {
    throw new Error('자신의 캐릭터는 친구로 추가할 수 없습니다.')
  }

  const { error } = await withTable(supabase, 'friend_requests', (table) =>
    supabase
      .from(table)
      .insert({
        requester_id: viewerId,
        addressee_id: hero.owner_id,
        status: 'pending',
        message: null,
      })
      .select('id')
      .single(),
  )

  if (error) {
    if (error.code === '23505') {
      throw new Error('이미 대기 중인 친구 요청이 있습니다.')
    }
    throw new Error(error.message || '친구 요청을 보내지 못했습니다.')
  }
}

export async function deleteFriendshipByOwner({ viewerId, friendOwnerId }) {
  if (!friendOwnerId) {
    throw new Error('친구 정보를 찾을 수 없습니다.')
  }

  const { error } = await withTable(supabase, 'friendships', (table) =>
    supabase
      .from(table)
      .delete()
      .or(
        `and(user_id_a.eq.${viewerId},user_id_b.eq.${friendOwnerId}),and(user_id_a.eq.${friendOwnerId},user_id_b.eq.${viewerId})`,
      ),
  )

  if (error) {
    throw new Error(error.message || '친구를 삭제하지 못했습니다.')
  }
}

async function callRequestRpc(fn, { requestId, actorId, failureMessage }) {
  const { error } = await supabase.rpc(fn, {
    p_request_id: requestId,
    p_actor: actorId,
  })

  if (error) {
    throw new Error(error.message || failureMessage)
  }
}

export async function acceptFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  await callRequestRpc('accept_friend_request', {
    requestId,
    actorId,
    failureMessage: '친구 요청을 수락하지 못했습니다.',
  })
}

export async function declineFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  await callRequestRpc('decline_friend_request', {
    requestId,
    actorId,
    failureMessage: '친구 요청을 거절하지 못했습니다.',
  })
}

export async function cancelFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  await callRequestRpc('cancel_friend_request', {
    requestId,
    actorId,
    failureMessage: '친구 요청을 취소하지 못했습니다.',
  })
}
