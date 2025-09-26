'use client'

import { supabase } from '../supabase'
import { withTable } from '../supabaseTables'

export const EMPTY_REQUESTS = { incoming: [], outgoing: [] }

async function fetchHeroSummaries(ownerIds) {
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

  const map = new Map()
  for (const hero of data || []) {
    const ownerId = hero.owner_id
    if (!ownerId) continue
    if (!map.has(ownerId)) {
      map.set(ownerId, hero)
    }
  }
  return map
}

function mapFriendships(rows, heroMap, viewerId) {
  if (!Array.isArray(rows) || !rows.length) return []
  return rows.map((row) => {
    const partnerOwnerId = row.user_id_a === viewerId ? row.user_id_b : row.user_id_a
    const hero = partnerOwnerId ? heroMap.get(partnerOwnerId) : null
    const fallbackName = hero?.name || '이름 미확인'
    const createdAt = row.since || row.created_at || new Date().toISOString()
    return {
      friendshipId: row.id,
      friendOwnerId: partnerOwnerId,
      friendHeroId: hero?.id || null,
      friendHeroName: fallbackName,
      friendHeroAvatar: hero?.image_url || null,
      createdAt,
      online: false,
      currentHeroId: hero?.id || null,
      currentHeroName: fallbackName,
      currentHeroAvatar: hero?.image_url || null,
      currentPage: 'unknown',
      lastSeenAt: createdAt,
    }
  })
}

function mapFriendRequests(rows, heroMap, viewerId) {
  if (!Array.isArray(rows) || !rows.length) return EMPTY_REQUESTS

  const incoming = []
  const outgoing = []

  for (const row of rows) {
    const isIncoming = row.addressee_id === viewerId
    const partnerOwnerId = isIncoming ? row.requester_id : row.addressee_id
    const hero = partnerOwnerId ? heroMap.get(partnerOwnerId) : null
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

export async function fetchSocialSnapshot(userId) {
  const [friendResult, requestResult] = await Promise.all([
    withTable(supabase, 'friendships', (table) =>
      supabase
        .from(table)
        .select('id,user_id_a,user_id_b,since,created_at')
        .or(`user_id_a.eq.${userId},user_id_b.eq.${userId}`),
    ),
    withTable(supabase, 'friend_requests', (table) =>
      supabase
        .from(table)
        .select('id,requester_id,addressee_id,status,message,created_at,updated_at')
        .eq('status', 'pending')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ),
  ])

  if (friendResult.error) throw friendResult.error
  if (requestResult.error) throw requestResult.error

  const friendRows = friendResult.data || []
  const requestRows = requestResult.data || []

  const ownerIds = new Set()
  for (const row of friendRows) {
    const partnerOwnerId = row.user_id_a === userId ? row.user_id_b : row.user_id_a
    if (partnerOwnerId) ownerIds.add(partnerOwnerId)
  }
  for (const row of requestRows) {
    const partnerOwnerId = row.requester_id === userId ? row.addressee_id : row.requester_id
    if (partnerOwnerId) ownerIds.add(partnerOwnerId)
  }

  let heroMap = new Map()
  if (ownerIds.size) {
    try {
      heroMap = await fetchHeroSummaries(Array.from(ownerIds))
    } catch (error) {
      console.error(error)
    }
  }

  return {
    friends: mapFriendships(friendRows, heroMap, userId),
    requests: mapFriendRequests(requestRows, heroMap, userId),
  }
}
