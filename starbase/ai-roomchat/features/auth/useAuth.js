import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { deriveProfileFromUser, EMPTY_PROFILE } from './profile'

export const AUTH_STATUS_VALUES = {
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
}

const INITIAL_STATE = {
  status: AUTH_STATUS_VALUES.LOADING,
  session: null,
  user: null,
  profile: { ...EMPTY_PROFILE },
  error: null,
}

const AuthContext = createContext({
  ...INITIAL_STATE,
  refresh: async () => {},
  signOut: async () => {},
})

function cloneProfile(user) {
  const derived = deriveProfileFromUser(user)
  return { ...EMPTY_PROFILE, ...derived }
}

function sanitiseErrorKey(error) {
  if (!error) return ''
  const status = typeof error.status === 'number' ? String(error.status) : ''
  const message = String(error.message ?? error.msg ?? '').trim().toLowerCase()
  return `${status}:${message}`
}

function shouldInvalidateSession(error) {
  if (!error) return false
  const status = Number(error.status ?? 0)
  const message = String(error.message ?? '').toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    message.includes('refresh token') ||
    message.includes('session not found') ||
    message.includes('invalid grant')
  )
}

async function exchangeCodeIfPresent() {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  const authCode = currentUrl.searchParams.get('code')
  if (!authCode) return

  try {
    const result = await supabase.auth.exchangeCodeForSession({ authCode })
    if (result?.error) {
      throw result.error
    }
  } finally {
    currentUrl.searchParams.delete('code')
    currentUrl.searchParams.delete('state')
    const query = currentUrl.searchParams.toString()
    const cleaned = `${currentUrl.pathname}${query ? `?${query}` : ''}${currentUrl.hash}`
    window.history.replaceState({}, document.title, cleaned)
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
  const resetKeyRef = useRef('')
  const bootstrapPromiseRef = useRef(null)

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const applySnapshot = useCallback((session, user) => {
    if (!mountedRef.current) return
    const nextUser = user ?? session?.user ?? null
    setState({
      status: AUTH_STATUS_VALUES.READY,
      session: session ?? null,
      user: nextUser,
      profile: cloneProfile(nextUser),
      error: null,
    })
    resetKeyRef.current = ''
  }, [])

  const resetToAnonymous = useCallback((status, error = null) => {
    if (!mountedRef.current) return
    setState({
      status,
      session: null,
      user: null,
      profile: cloneProfile(null),
      error,
    })
  }, [])

  const runBootstrap = useCallback(
    async ({ markLoading = true } = {}) => {
      if (!mountedRef.current) return null

      if (bootstrapPromiseRef.current) {
        return bootstrapPromiseRef.current
      }

      if (markLoading) {
        setState((prev) => ({ ...prev, status: AUTH_STATUS_VALUES.LOADING, error: null }))
      }

      const task = (async () => {
        try {
          await exchangeCodeIfPresent()
          const snapshot = await resolveSessionSnapshot()
          if (!mountedRef.current) return null
          applySnapshot(snapshot.session, snapshot.user)
          return snapshot.user ?? null
        } catch (error) {
          console.error('Failed to resolve Supabase session:', error)
          const shouldReset = shouldInvalidateSession(error)
          const key = sanitiseErrorKey(error)
          if (shouldReset && key && key !== resetKeyRef.current) {
            resetKeyRef.current = key
            try {
              await supabase.auth.signOut()
            } catch (signOutError) {
              console.error('Failed to sign out after auth bootstrap error:', signOutError)
            }
          }
          resetToAnonymous(AUTH_STATUS_VALUES.ERROR, error)
          return null
        } finally {
          bootstrapPromiseRef.current = null
        }
      })()

      bootstrapPromiseRef.current = task
      return task
    },
    [applySnapshot, resetToAnonymous],
  )

  useEffect(() => {
    runBootstrap({ markLoading: true })
  }, [runBootstrap])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return

      if (session?.user) {
        applySnapshot(session, session.user)
        return
      }

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        resetToAnonymous(AUTH_STATUS_VALUES.READY)
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        applySnapshot(session, session?.user ?? state.user)
        return
      }

      if (event === 'INITIAL_SESSION' && session === null) {
        resetToAnonymous(AUTH_STATUS_VALUES.READY)
      }
    })

    return () => {
      data?.subscription?.unsubscribe()
    }
  }, [applySnapshot, resetToAnonymous, state.user])

  const refresh = useCallback(async () => {
    await runBootstrap({ markLoading: true })
  }, [runBootstrap])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Failed to sign out from Supabase:', error)
      throw error
    }
    resetToAnonymous(AUTH_STATUS_VALUES.READY)
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

export function useAuth() {
  return useContext(AuthContext)
}
