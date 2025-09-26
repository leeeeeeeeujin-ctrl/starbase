'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { resolveViewerProfile } from '../../lib/heroes/resolveViewerProfile'
import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { useHeroPresence } from './useHeroPresence'

const STORAGE_KEY = 'starbase_friendships_v1'

function loadFriendships(userId) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const list = parsed[userId] || []
    return Array.isArray(list) ? list : []
  } catch (error) {
    return []
  }
}

function persistFriendships(userId, list) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const store = parsed && typeof parsed === 'object' ? parsed : {}
    store[userId] = list
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (error) {
    // ignore
  }
}

export function useHeroSocial({ heroId, heroName, page }) {
  const [viewer, setViewer] = useState(null)
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        const stored = loadFriendships(user.id)
        setFriends(stored)
        setLoading(false)
      } catch (err) {
        console.error(err)
        if (!alive) return
        setError('프로필 정보를 불러오지 못했습니다.')
        setLoading(false)
      }
    }

    bootstrap()

    return () => {
      alive = false
    }
  }, [heroId])

  useEffect(() => {
    if (!viewer?.user_id) return
    persistFriendships(viewer.user_id, friends)
  }, [friends, viewer?.user_id])

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

      setFriends((prev) => {
        if (prev.some((f) => f.friendOwnerId === hero.owner_id)) {
          return prev
        }
        const entry = {
          friendOwnerId: hero.owner_id,
          friendHeroId: hero.id,
          friendHeroName: hero.name,
          friendHeroAvatar: hero.image_url || null,
          createdAt: new Date().toISOString(),
          online: false,
          currentHeroId: hero.id,
          currentHeroName: hero.name,
          currentHeroAvatar: hero.image_url || null,
          currentPage: 'unknown',
          lastSeenAt: new Date().toISOString(),
        }
        return [...prev, entry]
      })

      return { ok: true }
    },
    [viewer?.user_id],
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
      setFriends((prev) => prev.filter((item) => item.friendOwnerId !== ownerId))
      return { ok: true }
    },
    [viewer?.user_id],
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
    loading,
    error,
    addFriend,
    removeFriend,
    friendByOwner,
    friendByHero,
  }
}
