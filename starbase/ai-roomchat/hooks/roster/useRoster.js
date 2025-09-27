'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

const DEFAULT_PROFILE_NAME = '사용자'
const HERO_SELECT_COLUMNS = 'id,name,image_url,created_at,owner_id'

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

function normaliseHero(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  return {
    id: raw.id,
    name: raw.name?.trim() ? raw.name : '이름 없는 영웅',
    image_url: raw.image_url || null,
    created_at: raw.created_at || null,
    owner_id: raw.owner_id || null,
  }
}

function pruneMissingHeroSelection(heroes) {
  if (typeof window === 'undefined') return
  try {
    const storedHeroId = window.localStorage.getItem('selectedHeroId')
    if (storedHeroId && !heroes.some((hero) => hero?.id === storedHeroId)) {
      window.localStorage.removeItem('selectedHeroId')
    }
  } catch (error) {
    console.error('Failed to synchronise hero selection cache:', error)
  }
}

function persistOwner(ownerId) {
  if (typeof window === 'undefined') return
  try {
    if (ownerId) {
      window.localStorage.setItem('selectedHeroOwnerId', ownerId)
    } else {
      window.localStorage.removeItem('selectedHeroOwnerId')
    }
  } catch (error) {
    console.error('Failed to persist roster owner metadata:', error)
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
            const cleanUrl = `${currentUrl.origin}${currentUrl.pathname}`
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
      persistOwner(user.id)

      const { data, error: heroesError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select(HERO_SELECT_COLUMNS)
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      )

      if (!isMounted.current) return

      if (heroesError) {
        console.error('Failed to load roster heroes:', heroesError)
        setError(heroesError.message)
        setHeroes([])
      } else {
        const normalisedHeroes = (Array.isArray(data) ? data : [])
          .map(normaliseHero)
          .filter(Boolean)
        setHeroes(normalisedHeroes)
        pruneMissingHeroSelection(normalisedHeroes)
      }

      setLoading(false)
    } catch (err) {
      console.error('Unexpected roster error:', err)
      if (!isMounted.current) return
      setError('로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
    }
  }, [onUnauthorized, router])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const deleteHero = useCallback(async (heroId) => {
    const { error: deleteError } = await withTable(supabase, 'heroes', (table) =>
      supabase.from(table).delete().eq('id', heroId),
    )

    if (deleteError) {
      throw deleteError
    }

    if (!isMounted.current) return

    setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))

    if (typeof window !== 'undefined') {
      try {
        const selectedHero = window.localStorage.getItem('selectedHeroId')
        if (selectedHero && selectedHero === heroId) {
          window.localStorage.removeItem('selectedHeroId')
        }
      } catch (storageError) {
        console.error('Failed to clear hero selection after delete:', storageError)
      }
    }
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
