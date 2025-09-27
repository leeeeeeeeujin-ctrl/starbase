'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import { useSyncExternalStore } from 'react'

import { supabase } from '../../lib/supabase'
import {
  DEFAULT_AUTH_STATE,
  ensureInitialised,
  getServerSnapshot,
  getSnapshot,
  refreshSession,
  subscribe,
  syncSession,
} from './session-store'
import { DEFAULT_PROFILE } from './profile'

const defaultContextValue = {
  ...DEFAULT_AUTH_STATE,
  profile: { ...DEFAULT_PROFILE },
  refresh: () => Promise.resolve(DEFAULT_AUTH_STATE),
  retry: () => Promise.resolve(DEFAULT_AUTH_STATE),
}

const AuthContext = createContext(defaultContextValue)

export function AuthProvider({ children }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (typeof window === 'undefined') return

    ensureInitialised(window.location.href).catch(() => {
      // 오류 상태는 store에서 관리합니다.
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session)
    })

    return () => {
      listener?.subscription?.unsubscribe?.()
    }
  }, [])

  const value = useMemo(
    () => ({
      ...snapshot,
      refresh: () => refreshSession(),
      retry: () =>
        ensureInitialised(typeof window !== 'undefined' ? window.location.href : undefined, {
          force: true,
        }),
    }),
    [snapshot],
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
