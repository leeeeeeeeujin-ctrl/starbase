'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

const DEFAULT_PROFILE_NAME = '사용자'
const DEFAULT_HERO_NAME = '이름 없는 영웅'

function normalizeHero(row) {
  if (!row || typeof row !== 'object') {
    return {
      id: '',
      name: DEFAULT_HERO_NAME,
      image_url: null,
      created_at: null,
      owner_id: null,
    }
  }

  const rawName = typeof row.name === 'string' ? row.name.trim() : ''

  return {
    ...row,
    id: row.id || '',
    name: rawName || DEFAULT_HERO_NAME,
    image_url: row.image_url || null,
    created_at: row.created_at || null,
    owner_id: row.owner_id || null,
  }
}

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

  const trimmed = typeof displayName === 'string' ? displayName.trim() : ''

  return {
    displayName: trimmed || DEFAULT_PROFILE_NAME,
    avatarUrl,
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

  const loadRoster = useCallback(async () => {
    if (!isMounted.current) return

    setLoading(true)
    setError('')

    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''

      if (href.includes('code=')) {
        try {
          const currentUrl = new URL(href)
          const authCode = currentUrl.searchParams.get('code')
          if (authCode) {
            const result = await supabase.auth.exchangeCodeForSession({ authCode })
            if (result?.error) {
              throw result.error
            }
          }
          if (typeof window !== 'undefined') {
            const cleanUrl = href.split('?')[0]
            window.history.replaceState({}, document.title, cleanUrl)
          }
        } catch (exchangeError) {
          console.error('Failed to process auth callback for roster:', exchangeError)
          if (!isMounted.current) return
          setError('로그인 세션을 복구하지 못했습니다. 다시 시도해 주세요.')
          setLoading(false)
          return
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

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('selectedHeroOwnerId', user.id)
        } catch (storageError) {
          console.error('Failed to persist roster owner metadata:', storageError)
        }
      }

      const { data, error: heroesError } = await withTable(
        supabase,
        'heroes',
        (table) =>
          supabase
            .from(table)
            .select('id,name,image_url,created_at,owner_id')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false })
      )

      if (!isMounted.current) return

      if (heroesError) {
        setError(heroesError.message)
        setHeroes([])
      } else {
        const normalizedHeroes = (data || []).map(normalizeHero)
        setHeroes(normalizedHeroes)
        if (typeof window !== 'undefined') {
          const storedHeroId = window.localStorage.getItem('selectedHeroId')
          if (storedHeroId && !normalizedHeroes.some((hero) => hero.id === storedHeroId)) {
            try {
              window.localStorage.removeItem('selectedHeroId')
            } catch (storageError) {
              console.error('Failed to clear missing hero selection:', storageError)
            }
          }
        }
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

  const resetError = useCallback(() => {
    if (!isMounted.current) return
    setError('')
  }, [])

  return {
    loading,
    error,
    heroes,
    displayName,
    avatarUrl,
    resetError,
    reload: loadRoster,
  }
}
