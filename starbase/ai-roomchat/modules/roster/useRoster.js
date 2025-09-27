'use client'

import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { deleteHeroById } from '../../services/heroes'
import { loadRosterBundle } from './data'
import {
  clearSelectedHero,
  clearSelectedHeroIfMatches,
  persistRosterOwner,
  pruneMissingHeroSelection,
} from '../../utils/browserStorage'
import { AUTH_STATUS, DEFAULT_PROFILE, useAuth } from '../auth'

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
  profile: DEFAULT_PROFILE,
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
        profile: action.profile || DEFAULT_PROFILE,
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
  const { status: authStatus, user, profile: authProfile, error: authError, retry } = useAuth()
  const [state, dispatch] = useReducer(reducer, initialState)

  const userId = user?.id || null

  const loadHeroes = useCallback(async () => {
    if (!userId) {
      dispatch({
        type: ACTIONS.SUCCESS,
        heroes: [],
        profile: DEFAULT_PROFILE,
      })
      return
    }

    dispatch({ type: ACTIONS.LOADING })
    try {
      const bundle = await loadRosterBundle({ userId, authProfile, user })
      persistRosterOwner(userId)
      pruneMissingHeroSelection(bundle.heroes)
      dispatch({ type: ACTIONS.SUCCESS, heroes: bundle.heroes, profile: bundle.profile })
    } catch (error) {
      console.error('Failed to load roster heroes', error)
      dispatch({
        type: ACTIONS.ERROR,
        error: error?.message || DEFAULT_ERROR_MESSAGE,
      })
    }
  }, [authProfile, user, userId])

  useEffect(() => {
    if (authStatus === AUTH_STATUS.READY && userId) {
      loadHeroes()
    }
  }, [authStatus, userId, loadHeroes])

  useEffect(() => {
    if (authStatus === AUTH_STATUS.SIGNED_OUT) {
      dispatch({ type: ACTIONS.RESET })
      persistRosterOwner(null)
      clearSelectedHero()
      if (typeof onUnauthorized === 'function') {
        onUnauthorized()
      }
    }
  }, [authStatus, onUnauthorized])

  useEffect(() => {
    if (authStatus === AUTH_STATUS.ERROR) {
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
    if (authStatus === AUTH_STATUS.ERROR) {
      try {
        await retry()
      } catch (error) {
        console.error('Auth retry failed', error)
      }
    }
    await loadHeroes()
  }, [authStatus, loadHeroes, retry])

  const loading = useMemo(
    () =>
      authStatus === AUTH_STATUS.IDLE ||
      authStatus === AUTH_STATUS.LOADING ||
      state.status === ACTIONS.LOADING ||
      (state.status === ACTIONS.RESET && authStatus !== AUTH_STATUS.SIGNED_OUT),
    [authStatus, state.status],
  )

  const errorMessage = useMemo(() => {
    if (state.error) return state.error
    if (authStatus === AUTH_STATUS.ERROR) {
      return authError?.message || DEFAULT_ERROR_MESSAGE
    }
    return ''
  }, [state.error, authStatus, authError])

  return {
    loading,
    error: errorMessage,
    heroes: state.heroes,
    displayName: state.profile.displayName,
    avatarUrl: state.profile.avatarUrl,
    setError,
    deleteHero,
    reload,
    authStatus,
  }
}
