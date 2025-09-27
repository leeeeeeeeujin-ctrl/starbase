'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { AUTH_STATUS_VALUES, EMPTY_PROFILE, useAuth } from '../../features/auth'
import { deleteHeroById, fetchHeroesForOwner } from '../../services/heroes'
import { readStorage, removeStorage, writeStorage } from '../../utils/browserStorage'

const HERO_STORAGE_KEY = 'selectedHeroId'
const OWNER_STORAGE_KEY = 'selectedHeroOwnerId'

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
  const latestRequestRef = useRef(0)
  const silentReloadRef = useRef(false)

  const { status: authStatus, user, profile, error: authError, refresh } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const displayProfile = useMemo(() => {
    return {
      displayName: profile?.displayName ?? EMPTY_PROFILE.displayName,
      avatarUrl: profile?.avatarUrl ?? null,
    }
  }, [profile])

  const handleUnauthorized = useCallback(() => {
    if (unauthorizedRef.current) return
    unauthorizedRef.current = true
    silentReloadRef.current = false
    setHeroes([])
    setLoading(false)
    removeStorage(HERO_STORAGE_KEY)
    removeStorage(OWNER_STORAGE_KEY)
    if (typeof onUnauthorized === 'function') {
      onUnauthorized()
    } else {
      router.replace('/')
    }
  }, [onUnauthorized, router])

  const runFetch = useCallback(
    async (ownerId, requestId) => {
      try {
        const data = await fetchHeroesForOwner(ownerId)
        if (!mountedRef.current || latestRequestRef.current !== requestId) return

        setHeroes(data)

        const storedHeroId = readStorage(HERO_STORAGE_KEY)
        if (storedHeroId && !data.some((hero) => hero.id === storedHeroId)) {
          removeStorage(HERO_STORAGE_KEY)
        }

        setLoading(false)
      } catch (caughtError) {
        if (!mountedRef.current || latestRequestRef.current !== requestId) return
        console.error('Failed to load roster:', caughtError)

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
    if (!mountedRef.current) return undefined

    if (authStatus === AUTH_STATUS_VALUES.LOADING) {
      if (!silentReloadRef.current) {
        setLoading(true)
      }
      return undefined
    }

    if (authStatus === AUTH_STATUS_VALUES.ERROR) {
      silentReloadRef.current = false
      setHeroes([])
      setLoading(false)
      if (authError) {
        setError(formatAuthError(authError))
      }
      return undefined
    }

    if (authStatus !== AUTH_STATUS_VALUES.READY) {
      return undefined
    }

    if (!user?.id) {
      silentReloadRef.current = false
      handleUnauthorized()
      return undefined
    }

    unauthorizedRef.current = false
    writeStorage(OWNER_STORAGE_KEY, user.id)

    const requestId = Date.now()
    latestRequestRef.current = requestId

    setError('')
    if (silentReloadRef.current) {
      silentReloadRef.current = false
    } else {
      setLoading(true)
    }

    runFetch(user.id, requestId)

    return () => {
      if (latestRequestRef.current === requestId) {
        latestRequestRef.current = 0
      }
    }
  }, [authStatus, authError, user, reloadToken, handleUnauthorized, runFetch])

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true)
      } else {
        silentReloadRef.current = true
      }
      setError('')
      if (authStatus === AUTH_STATUS_VALUES.ERROR) {
        await refresh()
      }
      setReloadToken((token) => token + 1)
    },
    [authStatus, refresh],
  )

  const deleteHero = useCallback(async (heroId) => {
    await deleteHeroById(heroId)
    if (!mountedRef.current) return

    setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))

    const storedHeroId = readStorage(HERO_STORAGE_KEY)
    if (storedHeroId && storedHeroId === heroId) {
      removeStorage(HERO_STORAGE_KEY)
    }
  }, [])

  return {
    loading,
    error,
    heroes,
    displayName: displayProfile.displayName,
    avatarUrl: displayProfile.avatarUrl,
    setError,
    deleteHero,
    reload,
  }
}
