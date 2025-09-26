'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { deriveProfile, DEFAULT_PROFILE } from '../lib/profile'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function useIsMounted() {
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return mountedRef
}

async function exchangeCodeIfPresent() {
  if (typeof window === 'undefined') return
  const { href } = window.location
  if (!href || !href.includes('code=')) return

  const currentUrl = new URL(href)
  const authCode = currentUrl.searchParams.get('code')
  if (!authCode) return

  const { error } = await supabase.auth.exchangeCodeForSession({ authCode })
  if (error) {
    throw error
  }

  const cleanedUrl = `${currentUrl.origin}${currentUrl.pathname}${currentUrl.hash || ''}`
  window.history.replaceState({}, document.title, cleanedUrl)
}

export function AuthProvider({ children }) {
  const mountedRef = useIsMounted()
  const [state, setState] = useState({
    status: 'loading',
    session: null,
    user: null,
    profile: { ...DEFAULT_PROFILE },
    error: '',
  })

  const setStateSafe = useCallback((updater) => {
    if (!mountedRef.current) return
    setState((previous) => (typeof updater === 'function' ? updater(previous) : updater))
  }, [mountedRef])

  const refresh = useCallback(async () => {
    setStateSafe((previous) => ({
      ...previous,
      status: 'loading',
      error: '',
    }))

    try {
      await exchangeCodeIfPresent()

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw sessionError
      }

      let session = sessionData?.session || null
      let user = session?.user || null

      if (!user) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) {
          throw userError
        }
        user = userData?.user || null
        session = session || null
      }

      const profile = deriveProfile(user)

      setStateSafe({
        status: 'ready',
        session,
        user,
        profile,
        error: '',
      })

      return { session, user }
    } catch (error) {
      console.error('Failed to refresh auth state', error)
      const message =
        error?.message || '인증 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'

      setStateSafe({
        status: 'error',
        session: null,
        user: null,
        profile: { ...DEFAULT_PROFILE },
        error: message,
      })

      return { error }
    }
  }, [setStateSafe])

  useEffect(() => {
    let cancelled = false

    async function initialise() {
      if (cancelled) return
      await refresh()
    }

    initialise()

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      if (cancelled) return
      refresh()
    })

    return () => {
      cancelled = true
      subscription?.subscription?.unsubscribe?.()
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
    await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user),
      refresh,
      signOut,
    }),
    [state, refresh, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}
