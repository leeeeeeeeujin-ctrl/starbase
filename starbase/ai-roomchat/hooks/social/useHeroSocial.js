'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { resolveViewerProfile } from '../../lib/heroes/resolveViewerProfile'
import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { useHeroPresence } from './useHeroPresence'

const EMPTY_REQUESTS = { incoming: [], outgoing: [] }

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
  if (!Array.isArray(rows) || !rows.length) return { incoming: [], outgoing: [] }

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

export function useHeroSocial({ heroId, heroName, page }) {
  const [viewer, setViewer] = useState(null)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState(EMPTY_REQUESTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSocialForUser = useCallback(async (userId) => {
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
      } catch (heroError) {
        console.error(heroError)
      }
    }

    return {
      friends: mapFriendships(friendRows, heroMap, userId),
      requests: mapFriendRequests(requestRows, heroMap, userId),
    }
  }, [])

  useEffect(() => {
    let alive = true
    const bootstrap = async () => {
      setLoading(true)
      setError('')
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (!alive) return
      if (authError || !user) {
        setLoading(false)
        setError('로그인이 필요합니다.')
        return
      }

      try {
        const profile = await resolveViewerProfile(user, heroId)
        if (!alive) return
        const viewerProfile = { ...profile, user_id: user.id }
        setViewer(viewerProfile)

        try {
          const social = await fetchSocialForUser(user.id)
          if (!alive) return
          setFriends(social.friends)
          setFriendRequests(social.requests)
        } catch (socialError) {
          console.error(socialError)
          if (!alive) return
          setFriends([])
          setFriendRequests(EMPTY_REQUESTS)
          setError('친구 정보를 불러오지 못했습니다.')
        }
      } catch (profileError) {
        console.error(profileError)
        if (!alive) return
        setError('프로필 정보를 불러오지 못했습니다.')
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      alive = false
    }
  }, [fetchSocialForUser, heroId])

  const refreshSocial = useCallback(async () => {
    if (!viewer?.user_id) return { ok: false, error: '로그인이 필요합니다.' }
    setLoading(true)
    setError('')
    try {
      const social = await fetchSocialForUser(viewer.user_id)
      setFriends(social.friends)
      setFriendRequests(social.requests)
      setLoading(false)
      return { ok: true }
    } catch (err) {
      console.error(err)
      setFriends([])
      setFriendRequests(EMPTY_REQUESTS)
      setLoading(false)
      setError('친구 정보를 불러오지 못했습니다.')
      return { ok: false, error: err?.message || '친구 정보를 불러오지 못했습니다.' }
    }
  }, [fetchSocialForUser, viewer?.user_id])

  const presenceList = useHeroPresence(
    viewer
      ? {
          presenceKey: viewer.user_id,
          ownerId: viewer.user_id,
          heroId: heroId || viewer.hero_id || null,
          heroName: heroName || viewer.name,
          avatarUrl: viewer.avatar_url,
          page: page || 'character',
        }
      : null,
  )

  const presenceByOwner = useMemo(() => {
    const map = new Map()
    for (const entry of presenceList) {
      const ownerId = entry.ownerId || entry.presenceKey
      if (!ownerId) continue
      map.set(ownerId, entry)
    }
    return map
  }, [presenceList])

  useEffect(() => {
    if (!viewer?.user_id) return
    setFriends((prev) => {
      if (!prev?.length) return prev
      let changed = false
      const next = prev.map((friend) => {
        const presence = presenceByOwner.get(friend.friendOwnerId)
        if (presence) {
          changed = true
          return {
            ...friend,
            online: true,
            currentHeroId: presence.heroId || friend.currentHeroId,
            currentHeroName: presence.heroName || friend.currentHeroName,
            currentHeroAvatar: presence.avatarUrl || friend.currentHeroAvatar,
            currentPage: presence.page || friend.currentPage,
            lastSeenAt: presence.timestamp || new Date().toISOString(),
          }
        }
        if (friend.online) {
          changed = true
          return { ...friend, online: false }
        }
        return friend
      })
      return changed ? next : prev
    })
  }, [presenceByOwner, viewer?.user_id])

  const addFriend = useCallback(
    async ({ heroId: targetHeroId }) => {
      if (!viewer?.user_id) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      const trimmed = (targetHeroId || '').trim()
      if (!trimmed) return { ok: false, error: '캐릭터 ID를 입력하세요.' }

      const { data: hero, error: heroError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id,name,image_url,owner_id')
          .eq('id', trimmed)
          .single(),
      )

      if (heroError || !hero) {
        return { ok: false, error: '해당 캐릭터를 찾을 수 없습니다.' }
      }
      if (hero.owner_id === viewer.user_id) {
        return { ok: false, error: '자신의 캐릭터는 친구로 추가할 수 없습니다.' }
      }

      const { error: requestError } = await withTable(supabase, 'friend_requests', (table) =>
        supabase
          .from(table)
          .insert({
            requester_id: viewer.user_id,
            addressee_id: hero.owner_id,
            status: 'pending',
            message: null,
          })
          .select('id')
          .single(),
      )

      if (requestError) {
        const message =
          requestError.code === '23505'
            ? '이미 대기 중인 친구 요청이 있습니다.'
            : requestError.message || '친구 요청을 보내지 못했습니다.'
        return { ok: false, error: message }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewer?.user_id],
  )

  const removeFriend = useCallback(
    async (friend) => {
      if (!viewer?.user_id) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      const ownerId = friend?.friendOwnerId || friend?.ownerId
      if (!ownerId) {
        return { ok: false, error: '친구 정보를 찾을 수 없습니다.' }
      }

      const { error: deleteError } = await withTable(supabase, 'friendships', (table) =>
        supabase
          .from(table)
          .delete()
          .or(
            `and(user_id_a.eq.${viewer.user_id},user_id_b.eq.${ownerId}),and(user_id_a.eq.${ownerId},user_id_b.eq.${viewer.user_id})`,
          ),
      )

      if (deleteError) {
        return { ok: false, error: deleteError.message || '친구를 삭제하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewer?.user_id],
  )

  const acceptFriendRequest = useCallback(
    async (requestId) => {
      if (!viewer?.user_id) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('accept_friend_request', {
        p_request_id: requestId,
        p_actor: viewer.user_id,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 수락하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewer?.user_id],
  )

  const declineFriendRequest = useCallback(
    async (requestId) => {
      if (!viewer?.user_id) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('decline_friend_request', {
        p_request_id: requestId,
        p_actor: viewer.user_id,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 거절하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewer?.user_id],
  )

  const cancelFriendRequest = useCallback(
    async (requestId) => {
      if (!viewer?.user_id) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('cancel_friend_request', {
        p_request_id: requestId,
        p_actor: viewer.user_id,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 취소하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewer?.user_id],
  )

  const friendByOwner = useMemo(() => {
    const map = new Map()
    for (const friend of friends) {
      if (friend.friendOwnerId) {
        map.set(friend.friendOwnerId, friend)
      }
    }
    return map
  }, [friends])

  const friendByHero = useMemo(() => {
    const map = new Map()
    for (const friend of friends) {
      if (friend.friendHeroId) {
        map.set(friend.friendHeroId, friend)
      }
      if (friend.currentHeroId) {
        map.set(friend.currentHeroId, friend)
      }
    }
    return map
  }, [friends])

  return {
    viewer,
    friends,
    friendRequests,
    loading,
    error,
    addFriend,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    refreshSocial,
    friendByOwner,
    friendByHero,
  }
}
