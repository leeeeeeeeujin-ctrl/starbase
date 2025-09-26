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
import { deriveProfileFromUser, EMPTY_PROFILE } from './profile'

const AuthContext = createContext(null)

const AUTH_STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
}

export const AUTH_STATUS_VALUES = AUTH_STATUS

const INITIAL_STATE = {
  status: AUTH_STATUS.LOADING,
  session: null,
  user: null,
  profile: EMPTY_PROFILE,
  error: null,
}

async function exchangeCodeIfPresent() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const authCode = url.searchParams.get('code')
    if (!authCode) return

    const result = await supabase.auth.exchangeCodeForSession({ authCode })
    if (result?.error) {
      throw result.error
    }

    url.searchParams.delete('code')
    url.searchParams.delete('state')
    const query = url.searchParams.toString()
    const cleaned = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`
    window.history.replaceState({}, document.title, cleaned)
  } catch (error) {
    console.error('Failed to exchange Supabase auth code:', error)
  }
}

async function resolveSessionSnapshot() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw sessionError
  }

  let session = sessionData?.session ?? null
  let user = session?.user ?? null

  if (!user) {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) {
      throw userError
    }
    user = userData?.user ?? null
  }

  if (user && !session) {
    const { data: refreshedSession, error: refreshError } = await supabase.auth.getSession()
    if (refreshError) {
      throw refreshError
    }
    session = refreshedSession?.session ?? null
  }

  return { session, user }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE)
  const mountedRef = useRef(true)
  const inflightRef = useRef(null)
  const lastResetRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applySnapshot = useCallback((snapshot) => {
    if (!mountedRef.current) return
    setState({
      status: AUTH_STATUS.READY,
      session: snapshot.session ?? null,
      user: snapshot.user ?? null,
      profile: deriveProfileFromUser(snapshot.user ?? null),
      error: null,
    })
  }, [])

  const resetToAnonymous = useCallback(
    (error = null) => {
      if (!mountedRef.current) return
      setState({
        status: error ? AUTH_STATUS.ERROR : AUTH_STATUS.READY,
        session: null,
        user: null,
        profile: EMPTY_PROFILE,
        error,
      })
    },
    [],
  )

  const handleSessionBootstrapError = useCallback(
    async (error) => {
      console.error('Failed to bootstrap Supabase session:', error)

      const message = String(error?.message || '').toLowerCase()
      const shouldResetSession =
        error?.status === 401 ||
        error?.status === 403 ||
        message.includes('refresh token') ||
        message.includes('session not found') ||
        message.includes('invalid grant')

      if (shouldResetSession && lastResetRef.current !== message) {
        lastResetRef.current = message
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.error('Failed to reset Supabase session after error:', signOutError)
        }
      }

      resetToAnonymous(error)
      return null
    },
    [resetToAnonymous],
  )

  const initialise = useCallback(
    async ({ force = false } = {}) => {
      if (inflightRef.current && !force) {
        return inflightRef.current
      }

      const task = (async () => {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, status: AUTH_STATUS.LOADING, error: null }))
        }

        try {
          await exchangeCodeIfPresent()
          const snapshot = await resolveSessionSnapshot()
          applySnapshot(snapshot)
          lastResetRef.current = null
          return snapshot.user ?? null
        } catch (error) {
          return handleSessionBootstrapError(error)
        }
      })()

      inflightRef.current = task

      try {
        return await task
      } finally {
        if (inflightRef.current === task) {
          inflightRef.current = null
        }
      }
    },
    [applySnapshot, handleSessionBootstrapError],
  )

  useEffect(() => {
    initialise()
  }, [initialise])

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return
      if (session?.user) {
        applySnapshot({ session, user: session.user })
      } else {
        resetToAnonymous()
      }
    })

    return () => {
      listener?.subscription?.unsubscribe?.()
    }
  }, [applySnapshot, resetToAnonymous])

  const refresh = useCallback(async () => {
    return initialise({ force: true })
  }, [initialise])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Failed to sign out from Supabase:', error)
      throw error
    }
    resetToAnonymous()
  }, [resetToAnonymous])

  const value = useMemo(
    () => ({
      status: state.status,
      session: state.session,
      user: state.user,
      profile: state.profile,
      error: state.error,
      refresh,
      signOut,
    }),
    [state, refresh, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
