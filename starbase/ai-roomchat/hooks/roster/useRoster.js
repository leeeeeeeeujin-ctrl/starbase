'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { AUTH_STATUS_VALUES, useAuth } from '../../features/auth'
import { deleteHeroById, fetchHeroesForOwner } from '../../services/heroes'
import { readStorage, removeStorage, writeStorage } from '../../utils/browserStorage'

const HERO_STORAGE_KEY = 'selectedHeroId'
const OWNER_STORAGE_KEY = 'selectedHeroOwnerId'

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const { status: authStatus, user, profile } = useAuth()
  const ownerId = user?.id ?? null

  const [loading, setLoading] = useState(authStatus === AUTH_STATUS_VALUES.LOADING)
  const [error, setError] = useState('')
  const [heroes, setHeroes] = useState([])
  const unauthorizedNotifiedRef = useRef(false)
  const authErrorRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadRoster = useCallback(async () => {
    if (!ownerId) return

    if (mountedRef.current) {
      setLoading(true)
      setError('')
    }

    try {
      const data = await fetchHeroesForOwner(ownerId)
      if (!mountedRef.current) return

      setHeroes(data)

      writeStorage(OWNER_STORAGE_KEY, ownerId)

      const storedHeroId = readStorage(HERO_STORAGE_KEY)
      if (storedHeroId && !data.some((hero) => hero.id === storedHeroId)) {
        removeStorage(HERO_STORAGE_KEY)
      }
    } catch (err) {
      console.error(err)
      if (mountedRef.current) {
        setError('로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [ownerId, fetchHeroesForOwner, writeStorage, readStorage, removeStorage])

  useEffect(() => {
    if (authStatus === AUTH_STATUS_VALUES.LOADING) {
      setLoading(true)
      return
    }

    if (authStatus === AUTH_STATUS_VALUES.ERROR) {
      setLoading(false)
      setHeroes([])
      if (!authErrorRef.current) {
        authErrorRef.current = true
        setError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
      }
      return
    }

    authErrorRef.current = false

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
    loadRoster()
  }, [authStatus, ownerId, loadRoster, onUnauthorized, router])

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
