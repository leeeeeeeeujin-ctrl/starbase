'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { deleteHeroById, fetchHeroesByOwner } from '../../services/heroes'
import {
  clearSelectedHero,
  clearSelectedHeroIfMatches,
  persistRosterOwner,
  pruneMissingHeroSelection,
} from '../../utils/browserStorage'
import { exchangeAuthCodeFromUrl } from '../../modules/auth/pkce'

const DEFAULT_PROFILE_NAME = '사용자'

function deriveProfile(user) {
  if (!user) {
    return { displayName: DEFAULT_PROFILE_NAME, avatarUrl: null }
  }

  const metadata = user.user_metadata || {}
  const emailPrefix = typeof user.email === 'string' ? user.email.split('@')[0] : ''
  const displayName =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    (typeof metadata.nickname === 'string' && metadata.nickname.trim()) ||
    (typeof emailPrefix === 'string' && emailPrefix.trim()) ||
    DEFAULT_PROFILE_NAME

  const avatarUrl =
    (typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim()) ||
    (typeof metadata.picture === 'string' && metadata.picture.trim()) ||
    (typeof metadata.avatar === 'string' && metadata.avatar.trim()) ||
    null

  return { displayName, avatarUrl }
}

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const mountedRef = useRef(true)
  const loadRef = useRef(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const [displayName, setDisplayName] = useState(DEFAULT_PROFILE_NAME)
  const [avatarUrl, setAvatarUrl] = useState(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleUnauthorized = useCallback(() => {
    if (typeof onUnauthorized === 'function') {
      onUnauthorized()
      return
    }
    router.replace('/')
  }, [onUnauthorized, router])

  const loadRoster = useCallback(async () => {
    const requestId = ++loadRef.current

    if (!mountedRef.current) return

    setLoading(true)
    setError('')

    try {
      if (typeof window !== 'undefined') {
        const href = window.location.href
        if (href.includes('code=')) {
          await exchangeAuthCodeFromUrl(href)
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      let user = sessionData?.session?.user || null
      if (!user) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        user = userData?.user || null
      }

      if (!user) {
        persistRosterOwner(null)
        clearSelectedHero()
        if (!mountedRef.current || requestId !== loadRef.current) return
        setHeroes([])
        setDisplayName(DEFAULT_PROFILE_NAME)
        setAvatarUrl(null)
        setLoading(false)
        handleUnauthorized()
        return
      }

      const profile = deriveProfile(user)
      if (!mountedRef.current || requestId !== loadRef.current) return

      setDisplayName(profile.displayName)
      setAvatarUrl(profile.avatarUrl)
      persistRosterOwner(user.id)

      const list = await fetchHeroesByOwner(user.id)
      if (!mountedRef.current || requestId !== loadRef.current) return

      setHeroes(list)
      pruneMissingHeroSelection(list)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load roster heroes:', err)
      if (!mountedRef.current || requestId !== loadRef.current) return
      setError(err?.message || '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    loadRoster()
    return () => {
      loadRef.current += 1
    }
  }, [loadRoster])

  const deleteHero = useCallback(async (heroId) => {
    if (!heroId) return
    await deleteHeroById(heroId)
    if (!mountedRef.current) return
    setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))
    clearSelectedHeroIfMatches(heroId)
  }, [])

  return {
    loading,
    error,
    heroes,
    displayName,
    avatarUrl,
    setError,
    deleteHero,
    reload: loadRoster,
  }
}
