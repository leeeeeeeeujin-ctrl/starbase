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

function isMissingRpc(error) {
  if (!error) return false
  if (error.code === 'PGRST302' || error.code === 'PGRST301') return true
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (!text.trim()) return false
  const missingFunction =
    text.includes('function') &&
    (text.includes('not exist') || text.includes('undefined') || text.includes('not defined'))
  if (missingFunction) return true
  if (error.status === 400) {
    return text.includes('rpc') || text.includes('procedure') || text.includes('function')
  }
  return false
}

async function fetchFriendRequestById(requestId) {
  const { data, error } = await withTable(supabase, 'friend_requests', (table) =>
    supabase
      .from(table)
      .select('id,requester_id,addressee_id,status,message,created_at,updated_at')
      .eq('id', requestId)
      .maybeSingle(),
  )

  if (error) throw error
  return data || null
}

function normaliseFriendPair(a, b) {
  if (!a || !b) {
    throw new Error('친구 정보를 찾을 수 없습니다.')
  }

  return a < b
    ? { first: a, second: b }
    : { first: b, second: a }
}

async function ensureFriendshipExists({ requesterId, addresseeId }) {
  const { first, second } = normaliseFriendPair(requesterId, addresseeId)

  const { error } = await withTable(supabase, 'friendships', (table) =>
    supabase
      .from(table)
      .upsert(
        {
          user_id_a: first,
          user_id_b: second,
          since: new Date().toISOString(),
        },
        { onConflict: 'user_id_a,user_id_b', ignoreDuplicates: true },
      ),
  )

  if (error) throw error
}

async function updateRequestStatus(requestId, status) {
  const { error } = await withTable(supabase, 'friend_requests', (table) =>
    supabase
      .from(table)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', requestId),
  )

  if (error) throw error
}

async function fallbackAcceptFriendRequest({ requestId, actorId }) {
  const request = await fetchFriendRequestById(requestId)
  if (!request) {
    throw new Error('친구 요청을 찾을 수 없습니다.')
  }
  if (request.status !== 'pending') {
    throw new Error('이미 처리된 친구 요청입니다.')
  }
  if (request.addressee_id !== actorId) {
    throw new Error('친구 요청을 수락할 권한이 없습니다.')
  }

  try {
    await ensureFriendshipExists({
      requesterId: request.requester_id,
      addresseeId: request.addressee_id,
    })
  } catch (error) {
    console.error('친구 관계를 생성하지 못했습니다.', error)
    throw new Error(error?.message || '친구 관계를 생성하지 못했습니다.')
  }

  try {
    await updateRequestStatus(requestId, 'accepted')
  } catch (error) {
    console.error('친구 요청 상태를 갱신하지 못했습니다.', error)
    throw new Error(error?.message || '친구 요청 상태를 갱신하지 못했습니다.')
  }
}

async function fallbackDeclineFriendRequest({ requestId, actorId }) {
  const request = await fetchFriendRequestById(requestId)
  if (!request) {
    throw new Error('친구 요청을 찾을 수 없습니다.')
  }
  if (request.status !== 'pending') {
    throw new Error('이미 처리된 친구 요청입니다.')
  }
  if (request.addressee_id !== actorId) {
    throw new Error('친구 요청을 거절할 권한이 없습니다.')
  }

  try {
    await updateRequestStatus(requestId, 'declined')
  } catch (error) {
    console.error('친구 요청 상태를 갱신하지 못했습니다.', error)
    throw new Error(error?.message || '친구 요청을 거절하지 못했습니다.')
  }
}

async function fallbackCancelFriendRequest({ requestId, actorId }) {
  const request = await fetchFriendRequestById(requestId)
  if (!request) {
    throw new Error('친구 요청을 찾을 수 없습니다.')
  }
  if (request.status !== 'pending') {
    throw new Error('이미 처리된 친구 요청입니다.')
  }
  if (request.requester_id !== actorId) {
    throw new Error('친구 요청을 취소할 권한이 없습니다.')
  }

  try {
    await updateRequestStatus(requestId, 'cancelled')
  } catch (error) {
    console.error('친구 요청 상태를 갱신하지 못했습니다.', error)
    throw new Error(error?.message || '친구 요청을 취소하지 못했습니다.')
  }
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

export async function acceptFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  const { error } = await supabase.rpc('accept_friend_request', {
    p_request_id: requestId,
    p_actor: actorId,
  })

  if (!error) return

  if (!isMissingRpc(error)) {
    throw new Error(error.message || '친구 요청을 수락하지 못했습니다.')
  }

  await fallbackAcceptFriendRequest({ requestId, actorId })
}

export async function declineFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  const { error } = await supabase.rpc('decline_friend_request', {
    p_request_id: requestId,
    p_actor: actorId,
  })

  if (!error) return

  if (!isMissingRpc(error)) {
    throw new Error(error.message || '친구 요청을 거절하지 못했습니다.')
  }

  await fallbackDeclineFriendRequest({ requestId, actorId })
}

export async function cancelFriendRequest({ requestId, actorId }) {
  if (!requestId) throw new Error('요청 정보를 찾을 수 없습니다.')
  const { error } = await supabase.rpc('cancel_friend_request', {
    p_request_id: requestId,
    p_actor: actorId,
  })

  if (!error) return

  if (!isMissingRpc(error)) {
    throw new Error(error.message || '친구 요청을 취소하지 못했습니다.')
  }

  await fallbackCancelFriendRequest({ requestId, actorId })
}
