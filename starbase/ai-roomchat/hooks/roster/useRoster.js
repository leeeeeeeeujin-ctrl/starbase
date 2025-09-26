'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { deriveProfileFromUser, EMPTY_PROFILE } from '../../features/auth/profile'
import { deleteHeroById, fetchHeroesForOwner } from '../../services/heroes'
import { supabase } from '../../lib/supabase'
import { readStorage, removeStorage, writeStorage } from '../../utils/browserStorage'

const HERO_STORAGE_KEY = 'selectedHeroId'
const OWNER_STORAGE_KEY = 'selectedHeroOwnerId'

async function exchangeAuthCodeIfPresent() {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  const authCode = currentUrl.searchParams.get('code')
  if (!authCode) return

  try {
    const result = await supabase.auth.exchangeCodeForSession({ authCode })
    if (result?.error) {
      throw result.error
    }
  } finally {
    currentUrl.searchParams.delete('code')
    currentUrl.searchParams.delete('state')
    const query = currentUrl.searchParams.toString()
    const cleaned = `${currentUrl.pathname}${query ? `?${query}` : ''}${currentUrl.hash}`
    window.history.replaceState({}, document.title, cleaned)
  }
}

function formatAuthError(error) {
  if (!error) return '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

  const message = String(error.message || error.msg || '')
  if (!message) {
    return '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (message.toLowerCase().includes('refresh token')) {
    return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
  }

  return message
}

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const mountedRef = useRef(true)
  const unauthorizedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const [profile, setProfile] = useState(EMPTY_PROFILE)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return
    unauthorizedRef.current = true
    setProfile(EMPTY_PROFILE)
    setHeroes([])
    setLoading(false)
    if (typeof onUnauthorized === 'function') {
      onUnauthorized()
    } else {
      router.replace('/')
    }
  }, [onUnauthorized, router])

  const loadRoster = useCallback(
    async ({ silent } = {}) => {
      if (!mountedRef.current) return

      if (!silent) {
        setLoading(true)
      }
      setError('')

      try {
        await exchangeAuthCodeIfPresent()

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }

        let user = sessionData?.session?.user ?? null

        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser()
          if (userError) {
            throw userError
          }
          user = userData?.user ?? null
        }

        if (!user) {
          handleUnauthorized()
          return
        }

        unauthorizedRef.current = false
        const derivedProfile = deriveProfileFromUser(user)
        if (mountedRef.current) {
          setProfile(derivedProfile)
          writeStorage(OWNER_STORAGE_KEY, user.id)
        }

        const data = await fetchHeroesForOwner(user.id)
        if (!mountedRef.current) return

        setHeroes(data)

        const storedHeroId = readStorage(HERO_STORAGE_KEY)
        if (storedHeroId && !data.some((hero) => hero.id === storedHeroId)) {
          removeStorage(HERO_STORAGE_KEY)
        }

        setLoading(false)
      } catch (caughtError) {
        console.error('Failed to load roster:', caughtError)
        if (!mountedRef.current) return

        if (caughtError?.status === 401 || caughtError?.status === 403) {
          handleUnauthorized()
          return
        }

        setError(formatAuthError(caughtError))
        setLoading(false)
      }
    },
    [handleUnauthorized],
  )

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const deleteHero = useCallback(
    async (heroId) => {
      await deleteHeroById(heroId)
      if (!mountedRef.current) return

      setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))

      const storedHeroId = readStorage(HERO_STORAGE_KEY)
      if (storedHeroId && storedHeroId === heroId) {
        removeStorage(HERO_STORAGE_KEY)
      }
    },
    [],
  )

  return {
    loading,
    error,
    heroes,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    setError,
    deleteHero,
    reload: loadRoster,
  }
}
