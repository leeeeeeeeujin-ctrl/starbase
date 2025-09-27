'use client'

import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { deleteHeroById, fetchHeroesByOwner } from '../../services/heroes'
import {
  clearSelectedHero,
  clearSelectedHeroIfMatches,
  persistRosterOwner,
  pruneMissingHeroSelection,
} from '../../utils/browserStorage'
import { DEFAULT_PROFILE, useAuth } from '../auth'

const DEFAULT_ERROR_MESSAGE = '로스터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

const ACTIONS = {
  RESET: 'reset',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  SET_ERROR: 'set-error',
  REMOVE: 'remove',
}

const initialState = {
  status: ACTIONS.RESET,
  heroes: [],
  error: '',
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESET:
      return { ...initialState }
    case ACTIONS.LOADING:
      return { ...state, status: ACTIONS.LOADING, error: '' }
    case ACTIONS.SUCCESS:
      return {
        status: ACTIONS.SUCCESS,
        heroes: action.heroes,
        error: '',
      }
    case ACTIONS.ERROR:
      return {
        ...state,
        status: ACTIONS.ERROR,
        error: action.error || DEFAULT_ERROR_MESSAGE,
      }
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.error || '' }
    case ACTIONS.REMOVE:
      return {
        ...state,
        heroes: state.heroes.filter((hero) => hero.id !== action.heroId),
      }
    default:
      return state
  }
}

export function useRoster({ onUnauthorized } = {}) {
  const { status: authStatus, user, profile, error: authError, retry } = useAuth()
  const [state, dispatch] = useReducer(reducer, initialState)

  const userId = user?.id || null

  const loadHeroes = useCallback(async () => {
    if (!userId) return

    dispatch({ type: ACTIONS.LOADING })
    try {
      persistRosterOwner(userId)
      const heroes = await fetchHeroesByOwner(userId)
      pruneMissingHeroSelection(heroes)
      dispatch({ type: ACTIONS.SUCCESS, heroes })
    } catch (error) {
      console.error('Failed to load roster heroes', error)
      dispatch({
        type: ACTIONS.ERROR,
        error: error?.message || DEFAULT_ERROR_MESSAGE,
      })
    }
  }, [userId])

  useEffect(() => {
    if (authStatus === 'ready' && userId) {
      loadHeroes()
    }
  }, [authStatus, userId, loadHeroes])

  useEffect(() => {
    if (authStatus === 'signed-out') {
      dispatch({ type: ACTIONS.RESET })
      persistRosterOwner(null)
      clearSelectedHero()
      if (typeof onUnauthorized === 'function') {
        onUnauthorized()
      }
    }
  }, [authStatus, onUnauthorized])

  useEffect(() => {
    if (authStatus === 'error') {
      dispatch({ type: ACTIONS.ERROR, error: authError?.message || DEFAULT_ERROR_MESSAGE })
    }
  }, [authStatus, authError])

  const deleteHero = useCallback(async (heroId) => {
    if (!heroId) return
    await deleteHeroById(heroId)
    dispatch({ type: ACTIONS.REMOVE, heroId })
    clearSelectedHeroIfMatches(heroId)
  }, [])

  const setError = useCallback((message) => {
    dispatch({ type: ACTIONS.SET_ERROR, error: message })
  }, [])

  const reload = useCallback(async () => {
    if (authStatus === 'error') {
      try {
        await retry()
      } catch (error) {
        console.error('Auth retry failed', error)
      }
    }
    await loadHeroes()
  }, [authStatus, loadHeroes, retry])

  const loading =
    authStatus === 'idle' ||
    authStatus === 'loading' ||
    state.status === ACTIONS.LOADING ||
    (state.status === ACTIONS.RESET && authStatus !== 'signed-out')

  const effectiveProfile = profile || DEFAULT_PROFILE

  const errorMessage = useMemo(() => {
    if (state.error) return state.error
    if (authStatus === 'error') {
      return authError?.message || DEFAULT_ERROR_MESSAGE
    }
    return ''
  }, [state.error, authStatus, authError])

  return {
    loading,
    error: errorMessage,
    heroes: state.heroes,
    displayName: effectiveProfile.displayName,
    avatarUrl: effectiveProfile.avatarUrl,
    setError,
    deleteHero,
    reload,
    authStatus,
  }
}
