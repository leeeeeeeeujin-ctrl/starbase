'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { useAuth } from '../useAuth'

const DEFAULT_ERROR_MESSAGE = '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const { status: authStatus, user, profile, error: authError } = useAuth()
  const isMounted = useRef(true)
  const [loading, setLoading] = useState(authStatus !== 'ready')
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) {
      return
    }

    try {
      window.localStorage.setItem('selectedHeroOwnerId', user.id)
    } catch (storageError) {
      console.error('Failed to persist roster owner metadata:', storageError)
    }
  }, [user?.id])

  const loadHeroes = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    setError('')

    try {
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
        setHeroes(data || [])

        if (typeof window !== 'undefined') {
          const storedHeroId = window.localStorage.getItem('selectedHeroId')
          if (storedHeroId && !(data || []).some((hero) => hero.id === storedHeroId)) {
            try {
              window.localStorage.removeItem('selectedHeroId')
            } catch (storageError) {
              console.error('Failed to clear missing hero selection:', storageError)
            }
          }
        }
      }
    } catch (err) {
      console.error(err)
      if (!isMounted.current) return
      setError(DEFAULT_ERROR_MESSAGE)
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }, [user?.id])

  useEffect(() => {
    if (authStatus === 'loading') {
      setLoading(true)
      return
    }

    if (authStatus === 'error') {
      setError(authError || '로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.')
      setLoading(false)
      return
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

    void loadHeroes()
  }, [authStatus, authError, loadHeroes, onUnauthorized, router, user])

  const deleteHero = useCallback(async (heroId) => {
    const { error: deleteError } = await withTable(supabase, 'heroes', (table) =>
      supabase.from(table).delete().eq('id', heroId)
    )

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
    displayName: profile?.displayName || '사용자',
    avatarUrl: profile?.avatarUrl || null,
    setError,
    deleteHero,
    reload: loadHeroes,
  }
}
