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
import { retryAsync } from '../../utils/async'
import { deriveProfileFromUser, EMPTY_PROFILE } from './profile'

const AuthContext = createContext({
  status: 'loading',
  session: null,
  user: null,
  profile: EMPTY_PROFILE,
  error: null,
  refresh: async () => null,
  signOut: async () => {},
})

const INITIAL_STATE = {
  status: 'loading',
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
  const latestSessionRunRef = useRef(0)
  const initialisePromiseRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applySnapshot = useCallback((snapshot) => {
    if (!mountedRef.current) return
    setState({
      status: 'ready',
      session: snapshot.session ?? null,
      user: snapshot.user ?? null,
      profile: deriveProfileFromUser(snapshot.user ?? null),
      error: null,
    })
  }, [])

  const initialise = useCallback(
    async ({ force = false } = {}) => {
      if (initialisePromiseRef.current && !force) {
        return initialisePromiseRef.current
      }

      const runId = Date.now()
      latestSessionRunRef.current = runId

      if (mountedRef.current) {
        setState((prev) => ({ ...prev, status: 'loading', error: null }))
      }

      const promise = (async () => {
        try {
          await exchangeCodeIfPresent()
          const snapshot = await retryAsync(() => resolveSessionSnapshot(), {
            retries: 2,
            delay: (attempt) => (attempt + 1) * 400,
            onRetry: (error, attempt) => {
              console.warn('Retrying Supabase session bootstrap', {
                attempt: attempt + 1,
                error,
              })
            },
          })

          if (!mountedRef.current || latestSessionRunRef.current !== runId) {
            return snapshot.user ?? null
          }

          applySnapshot(snapshot)
          return snapshot.user ?? null
        } catch (error) {
          console.error('Failed to bootstrap Supabase session:', error)
          if (!mountedRef.current || latestSessionRunRef.current !== runId) {
            return null
          }
          setState({ ...INITIAL_STATE, status: 'ready', error })
          return null
        } finally {
          if (initialisePromiseRef.current === promise) {
            initialisePromiseRef.current = null
          }
        }
      })()

      initialisePromiseRef.current = promise
      return promise
    },
    [applySnapshot],
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
        setState({ ...INITIAL_STATE, status: 'ready' })
      }
    })

    return () => {
      listener?.subscription?.unsubscribe?.()
    }
  }, [applySnapshot])

  const refresh = useCallback(async () => {
    return initialise({ force: true })
  }, [initialise])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Failed to sign out from Supabase:', error)
      throw error
    }
    setState({ ...INITIAL_STATE, status: 'ready' })
  }, [])

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
  return useContext(AuthContext)
}
