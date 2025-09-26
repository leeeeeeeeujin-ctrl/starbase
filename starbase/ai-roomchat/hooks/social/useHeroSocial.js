"use client"

import { useEffect, useMemo } from 'react'

import { useFriendActions } from './useFriendActions'
import { useHeroPresence } from './useHeroPresence'
import { useHeroSocialBootstrap } from './useHeroSocialBootstrap'

export function useHeroSocial({ heroId, heroName, page, viewerHero = null }) {
  const {
    viewer,
    friends,
    friendRequests,
    loading,
    error,
    setFriends,
    refreshSocial,
  } = useHeroSocialBootstrap(heroId, viewerHero)

  const friendActions = useFriendActions(viewer, refreshSocial)

  const presenceList = useHeroPresence(
    viewer
      ? {
          presenceKey: viewer.user_id,
          ownerId: viewer.owner_id || viewer.user_id,
          heroId: heroId || viewer.hero_id || viewerHero?.heroId || null,
          heroName: heroName || viewerHero?.heroName || viewer.name,
          avatarUrl: viewer.avatar_url || viewerHero?.avatarUrl || null,
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
    ...friendActions,
    refreshSocial,
    friendByOwner,
    friendByHero,
  }
}
