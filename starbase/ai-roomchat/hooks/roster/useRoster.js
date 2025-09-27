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
    return {
      displayName: DEFAULT_PROFILE_NAME,
      avatarUrl: null,
    }
  }

  const metadata = user.user_metadata || {}
  const displayName =
    metadata.full_name ||
    metadata.name ||
    metadata.nickname ||
    (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
    DEFAULT_PROFILE_NAME
  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.avatar || null

  return { displayName, avatarUrl }
}

async function resolveSessionUser() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw error
  }
  if (data?.session?.user) {
    return data.session.user
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) {
    throw userError
  }
  return userData?.user || null
}

async function ensureAuthExchange(urlString) {
  try {
    await exchangeAuthCodeFromUrl(urlString)
  } catch (error) {
    console.error('Failed to process auth callback for roster:', error)
    throw error
  }
}

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const isMounted = useRef(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const [{ displayName, avatarUrl }, setProfile] = useState({
    displayName: DEFAULT_PROFILE_NAME,
    avatarUrl: null,
  })

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const handleUnauthorized = useCallback(() => {
    if (typeof onUnauthorized === 'function') {
      onUnauthorized()
    } else {
      router.replace('/')
    }
  }, [onUnauthorized, router])

  const loadRoster = useCallback(async () => {
    if (!isMounted.current) return

    setLoading(true)
    setError('')

    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''
      if (href.includes('code=')) {
        await ensureAuthExchange(href)
      }

      let user
      try {
        user = await resolveSessionUser()
      } catch (sessionError) {
        if (!isMounted.current) return
        console.error('Failed to resolve auth session for roster:', sessionError)
        setError(sessionError.message || '세션 정보를 확인하지 못했습니다.')
        setLoading(false)
        return
      }

      if (!user) {
        persistRosterOwner(null)
        clearSelectedHero()
        if (!isMounted.current) return
        setLoading(false)
        handleUnauthorized()
        return
      }

      setProfile(deriveProfile(user))
      persistRosterOwner(user.id)

      const list = await fetchHeroesByOwner(user.id)
      if (!isMounted.current) return

      setHeroes(list)
      pruneMissingHeroSelection(list)
      setLoading(false)
    } catch (err) {
      console.error('Failed to load roster heroes:', err)
      if (!isMounted.current) return
      setError(err?.message || '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const deleteHero = useCallback(async (heroId) => {
    if (!heroId) return
    await deleteHeroById(heroId)
    if (!isMounted.current) return
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
