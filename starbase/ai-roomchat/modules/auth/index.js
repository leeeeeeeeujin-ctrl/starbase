'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { supabase } from '../../lib/supabase'
import { DEFAULT_PROFILE, deriveProfile } from './profile'
import { exchangeAuthCodeFromUrl } from './pkce'

export const AUTH_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  SIGNED_OUT: 'signed-out',
  ERROR: 'error',
})

export const DEFAULT_AUTH_STATE = Object.freeze({
  status: AUTH_STATUS.IDLE,
  session: null,
  user: null,
  profile: { ...DEFAULT_PROFILE },
  error: null,
})

const defaultContextValue = {
  ...DEFAULT_AUTH_STATE,
  refresh: () => Promise.resolve(),
  retry: () => Promise.resolve(),
}

const AuthContext = createContext(defaultContextValue)

export function AuthProvider({ children }) {
  const [state, setState] = useState(DEFAULT_AUTH_STATE)
  const mountedRef = useRef(true)
  const initialisedRef = useRef(false)
  const bootstrapPromiseRef = useRef(null)

  const setStateSafe = useCallback((updater) => {
    if (!mountedRef.current) return
    setState((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }, [])

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  const applySession = useCallback(
    (session) => {
      const user = session?.user || null
      setStateSafe({
        status: user ? AUTH_STATUS.READY : AUTH_STATUS.SIGNED_OUT,
        session: session ?? null,
        user,
        profile: deriveProfile(user),
        error: null,
      })
      initialisedRef.current = true
    },
    [setStateSafe],
  )

  const setErrorState = useCallback(
    (error) => {
      setStateSafe({
        status: AUTH_STATUS.ERROR,
        session: null,
        user: null,
        profile: { ...DEFAULT_PROFILE },
        error: error || null,
      })
      initialisedRef.current = false
    },
    [setStateSafe],
  )

  const resolveSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data?.session ?? null
  }, [])

  const bootstrap = useCallback(
    async ({ force = false } = {}) => {
      if (bootstrapPromiseRef.current) {
        return bootstrapPromiseRef.current
      }

      if (initialisedRef.current && !force) {
        return Promise.resolve(null)
      }

      const promise = (async () => {
        setStateSafe((prev) => ({
          ...prev,
          status: AUTH_STATUS.LOADING,
          error: null,
        }))

        try {
          if (typeof window !== 'undefined') {
            await exchangeAuthCodeFromUrl(window.location.href)
          }
          const session = await resolveSession()
          applySession(session)
        } catch (error) {
          console.error('Auth bootstrap failed', error)
          setErrorState(error)
          throw error
        } finally {
          bootstrapPromiseRef.current = null
        }
      })()

      bootstrapPromiseRef.current = promise
      return promise
    },
    [applySession, resolveSession, setErrorState, setStateSafe],
  )

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => {
      listener?.subscription?.unsubscribe?.()
    }
  }, [applySession])

  const refresh = useCallback(async () => {
    setStateSafe((prev) => ({
      ...prev,
      status: AUTH_STATUS.LOADING,
      error: null,
    }))

    try {
      const session = await resolveSession()
      applySession(session)
    } catch (error) {
      console.error('Auth refresh failed', error)
      setErrorState(error)
      throw error
    }
  }, [applySession, resolveSession, setErrorState, setStateSafe])

  const retry = useCallback(() => bootstrap({ force: true }), [bootstrap])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      retry,
    }),
    [state, refresh, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export { DEFAULT_PROFILE } from './profile'
