'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'

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

  const loadRoster = useCallback(async () => {
    if (!isMounted.current) return

    setLoading(true)
    setError('')

    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''

      if (href.includes('code=')) {
        let exchangeError = null
        try {
          const currentUrl = new URL(href)
          const authCode = currentUrl.searchParams.get('code')
          if (authCode) {
            const result = await supabase.auth.exchangeCodeForSession({ authCode })
            exchangeError = result?.error || null
          }
        } catch (parseError) {
          console.error('Failed to parse auth callback URL for roster hydration:', parseError)
          exchangeError = parseError
        }

        if (exchangeError) {
          console.error(exchangeError)
          if (!isMounted.current) return
          setError('로그인 세션을 복구하지 못했습니다. 다시 시도해 주세요.')
          setLoading(false)
          return
        }

        if (typeof window !== 'undefined') {
          const cleanUrl = href.split('?')[0]
          window.history.replaceState({}, document.title, cleanUrl)
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (!isMounted.current) return

      if (sessionError) {
        setError(sessionError.message)
        setLoading(false)
        return
      }

      let user = sessionData?.session?.user || null

      if (!user) {
        const {
          data: { user: fetchedUser },
          error: authError,
        } = await supabase.auth.getUser()

        if (!isMounted.current) return

        if (authError) {
          setError(authError.message)
          setLoading(false)
          return
        }

        user = fetchedUser || null
      }

      if (!user) {
        setLoading(false)
        if (typeof onUnauthorized === 'function') {
          onUnauthorized()
        } else {
          router.replace('/')
        }
        return
      }

      setProfile(deriveProfile(user))

      const { data, error: heroesError } = await supabase
        .from('heroes')
        .select('id,name,image_url,created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (!isMounted.current) return

      if (heroesError) {
        setError(heroesError.message)
        setHeroes([])
      } else {
        setHeroes(data || [])
      }

      setLoading(false)
    } catch (err) {
      console.error(err)
      if (!isMounted.current) return
      setError('로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
    }
  }, [onUnauthorized, router])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const deleteHero = useCallback(async (heroId) => {
    const { error: deleteError } = await supabase.from('heroes').delete().eq('id', heroId)

    if (deleteError) {
      throw deleteError
    }

    if (!isMounted.current) return

    setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))
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
