'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { useAuth } from '../../features/auth'
import { deleteHeroById, fetchHeroesForOwner } from '../../services/heroes'
import { readStorage, removeStorage, writeStorage } from '../../utils/browserStorage'

const HERO_STORAGE_KEY = 'selectedHeroId'
const OWNER_STORAGE_KEY = 'selectedHeroOwnerId'

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const { status: authStatus, user, profile } = useAuth()
  const ownerId = user?.id ?? null

  const [loading, setLoading] = useState(authStatus === 'loading')
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const unauthorizedNotifiedRef = useRef(false)
  const mountedRef = useRef(false)
  const latestRequestRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadRoster = useCallback(async () => {
    if (!ownerId) {
      return []
    }

    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId

    if (mountedRef.current) {
      setLoading(true)
      setError('')
    }

    try {
      const data = await fetchHeroesForOwner(ownerId)

      if (!mountedRef.current || latestRequestRef.current !== requestId) {
        return data
      }

      setHeroes(data)
      writeStorage(OWNER_STORAGE_KEY, ownerId)

      const storedHeroId = readStorage(HERO_STORAGE_KEY)
      if (storedHeroId && !data.some((hero) => hero.id === storedHeroId)) {
        removeStorage(HERO_STORAGE_KEY)
      }

      return data
    } catch (err) {
      console.error(err)
      if (mountedRef.current && latestRequestRef.current === requestId) {
        setError('로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      throw err
    } finally {
      if (mountedRef.current && latestRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [ownerId, fetchHeroesForOwner, writeStorage, readStorage, removeStorage])

  useEffect(() => {
    if (authStatus === 'loading') {
      setLoading(true)
      return
    }

    if (!ownerId) {
      setLoading(false)
      setHeroes([])
      if (!unauthorizedNotifiedRef.current) {
        unauthorizedNotifiedRef.current = true
        if (typeof onUnauthorized === 'function') {
          onUnauthorized()
        } else {
          router.replace('/')
        }
      }
      return
    }

    unauthorizedNotifiedRef.current = false
    loadRoster().catch(() => {})
  }, [authStatus, ownerId, loadRoster, onUnauthorized, router])

  const deleteHero = useCallback(
    async (heroId) => {
      try {
        await deleteHeroById(heroId)
        if (!mountedRef.current) {
          return
        }
        setHeroes((previous) => previous.filter((hero) => hero.id !== heroId))
        const storedHeroId = readStorage(HERO_STORAGE_KEY)
        if (storedHeroId && storedHeroId === heroId) {
          removeStorage(HERO_STORAGE_KEY)
        }
      } catch (err) {
        console.error(err)
        if (mountedRef.current) {
          setError('영웅을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        }
        throw err
      }
    },
    [deleteHeroById, readStorage, removeStorage],
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
