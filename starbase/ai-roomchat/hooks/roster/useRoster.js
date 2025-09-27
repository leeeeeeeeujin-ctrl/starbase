'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/router'

import { bootstrapUserFromUrl } from '../../lib/authSession'
import { deleteHeroById, fetchHeroesByOwner } from '../../services/heroes'
import {
  clearSelectedHeroIfMatches,
  persistRosterOwner,
  pruneMissingHeroSelection,
} from '../../utils/browserStorage'

const DEFAULT_PROFILE = { displayName: '사용자', avatarUrl: null }

const ACTIONS = {
  START: 'start',
  SUCCESS: 'success',
  ERROR: 'error',
  SET_ERROR: 'set-error',
  REMOVE_HERO: 'remove-hero',
}

const initialState = {
  status: ACTIONS.START,
  error: '',
  heroes: [],
  profile: DEFAULT_PROFILE,
}

function rosterReducer(state, action) {
  switch (action.type) {
    case ACTIONS.START:
      return { ...state, status: ACTIONS.START, error: '' }
    case ACTIONS.SUCCESS:
      return {
        status: ACTIONS.SUCCESS,
        error: '',
        heroes: action.heroes,
        profile: action.profile,
      }
    case ACTIONS.ERROR:
      return {
        ...state,
        status: ACTIONS.ERROR,
        error: action.error || '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        heroes: [],
      }
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.error || '' }
    case ACTIONS.REMOVE_HERO:
      return {
        ...state,
        heroes: state.heroes.filter((hero) => hero.id !== action.heroId),
      }
    default:
      return state
  }
}

export function useRoster({ onUnauthorized } = {}) {
  const router = useRouter()
  const isMounted = useRef(true)
  const [state, dispatch] = useReducer(rosterReducer, initialState)

  useEffect(() => () => {
    isMounted.current = false
  }, [])

  const loadRoster = useCallback(async () => {
    if (!isMounted.current) return

    dispatch({ type: ACTIONS.START })

    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''
      const { user, profile } = await bootstrapUserFromUrl(href)

      if (!isMounted.current) return

      if (!user) {
        if (typeof onUnauthorized === 'function') {
          onUnauthorized()
        } else {
          router.replace('/')
        }
        dispatch({ type: ACTIONS.ERROR, error: '로그인이 필요합니다.' })
        return
      }

      persistRosterOwner(user.id)

      const heroes = await fetchHeroesByOwner(user.id)

      if (!isMounted.current) return

      pruneMissingHeroSelection(heroes)

      dispatch({ type: ACTIONS.SUCCESS, heroes, profile: profile || DEFAULT_PROFILE })
    } catch (error) {
      console.error('Failed to load roster', error)
      if (!isMounted.current) return
      dispatch({
        type: ACTIONS.ERROR,
        error: error?.message || '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      })
    }
  }, [onUnauthorized, router])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const deleteHero = useCallback(async (heroId) => {
    await deleteHeroById(heroId)
    if (!isMounted.current) return
    dispatch({ type: ACTIONS.REMOVE_HERO, heroId })
    clearSelectedHeroIfMatches(heroId)
  }, [])

  const setError = useCallback((message) => {
    dispatch({ type: ACTIONS.SET_ERROR, error: message })
  }, [])

  return {
    loading: state.status === ACTIONS.START && !state.heroes.length,
    error: state.error,
    heroes: state.heroes,
    displayName: state.profile.displayName,
    avatarUrl: state.profile.avatarUrl,
    setError,
    deleteHero,
    reload: loadRoster,
  }
}
