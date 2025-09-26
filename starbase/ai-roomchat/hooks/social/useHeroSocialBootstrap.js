'use client'

import { useCallback, useEffect, useState } from 'react'

import { resolveViewerProfile } from '../../lib/heroes/resolveViewerProfile'
import { supabase } from '../../lib/supabase'
import { EMPTY_REQUESTS, loadFriendSnapshot } from '../../lib/social/friends'

export function useHeroSocialBootstrap(heroId) {
  const [viewer, setViewer] = useState(null)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState(EMPTY_REQUESTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshSocial = useCallback(async () => {
    if (!viewer?.user_id) {
      return { ok: false, error: '로그인이 필요합니다.' }
    }

    setLoading(true)
    setError('')
    try {
      const snapshot = await loadFriendSnapshot(viewer.user_id)
      setFriends(snapshot.friends)
      setFriendRequests(snapshot.requests)
      setLoading(false)
      return { ok: true }
    } catch (refreshError) {
      console.error(refreshError)
      setFriends([])
      setFriendRequests(EMPTY_REQUESTS)
      setLoading(false)
      const message = refreshError?.message || '친구 정보를 불러오지 못했습니다.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [viewer?.user_id])

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
          const snapshot = await loadFriendSnapshot(user.id)
          if (!alive) return

          setFriends(snapshot.friends)
          setFriendRequests(snapshot.requests)
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
  }, [heroId])

  return {
    viewer,
    friends,
    friendRequests,
    loading,
    error,
    setFriends,
    setFriendRequests,
    setError,
    refreshSocial,
  }
}
