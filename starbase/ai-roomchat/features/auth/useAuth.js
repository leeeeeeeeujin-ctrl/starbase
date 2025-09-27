'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { supabase } from '../../lib/supabase'
import { deriveProfileFromUser, EMPTY_PROFILE } from './profile'

const AUTH_STATUS_VALUES = {
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

const listeners = new Set()
let state = { ...INITIAL_STATE }
let bootstrapPromise = null
let initialised = false
let authSubscription = null
let lastResetKey = null

function notify() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.error('Auth listener threw an error:', error)
    }
  })
}

function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

function cloneProfile(profile) {
  if (!profile) return { ...EMPTY_PROFILE }
  return {
    displayName: profile.displayName ?? EMPTY_PROFILE.displayName,
    avatarUrl: profile.avatarUrl ?? null,
  }
}

function applySnapshot({ session, user }) {
  const resolvedUser = user ?? session?.user ?? null
  setState({
    status: AUTH_STATUS_VALUES.READY,
    session: session ?? null,
    user: resolvedUser,
    profile: cloneProfile(deriveProfileFromUser(resolvedUser)),
    error: null,
  })
}

function resetToAnonymous(error = null) {
  setState({
    status: error ? AUTH_STATUS_VALUES.ERROR : AUTH_STATUS_VALUES.READY,
    session: null,
    user: null,
    profile: cloneProfile(null),
    error,
  })
}

function sanitiseErrorKey(error) {
  if (!error) return ''
  const status = typeof error.status === 'number' ? String(error.status) : ''
  const message = String(error.message ?? error.msg ?? '').trim().toLowerCase()
  return `${status}:${message}`
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

async function handleBootstrapError(error) {
  console.error('Failed to resolve Supabase session:', error)

  const status = Number(error?.status ?? 0)
  const message = String(error?.message ?? '').toLowerCase()
  const shouldInvalidate =
    status === 401 ||
    status === 403 ||
    message.includes('refresh token') ||
    message.includes('session not found') ||
    message.includes('invalid grant')

  const key = sanitiseErrorKey(error)
  if (shouldInvalidate && key && key !== lastResetKey) {
    lastResetKey = key
    try {
      await supabase.auth.signOut()
    } catch (signOutError) {
      console.error('Failed to sign out after auth bootstrap error:', signOutError)
    }
  }

  resetToAnonymous(error)
  return null
}

async function bootstrap({ force = false } = {}) {
  if (bootstrapPromise && !force) {
    return bootstrapPromise
  }

  const task = (async () => {
    setState((prev) => ({
      ...prev,
      status: AUTH_STATUS_VALUES.LOADING,
      error: null,
    }))

    try {
      await exchangeCodeIfPresent()
      const snapshot = await resolveSessionSnapshot()
      applySnapshot(snapshot)
      lastResetKey = null
      return snapshot.user ?? null
    } catch (error) {
      return handleBootstrapError(error)
    }
  })()

  bootstrapPromise = task

  try {
    return await task
  } finally {
    if (bootstrapPromise === task) {
      bootstrapPromise = null
    }
  }
}

function ensureInitialised() {
  if (initialised) return
  if (typeof window === 'undefined') return

  initialised = true

  bootstrap()

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      applySnapshot({ session, user: session.user })
      return
    }

    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      lastResetKey = null
      resetToAnonymous()
      return
    }

    if (event === 'TOKEN_REFRESHED') {
      applySnapshot({ session, user: session?.user ?? state.user })
      return
    }

    if (event === 'INITIAL_SESSION' && session === null) {
      resetToAnonymous()
    }
  })

  authSubscription = data?.subscription ?? null
}

function subscribe(listener) {
  listeners.add(listener)

  ensureInitialised()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && authSubscription) {
      authSubscription.unsubscribe()
      authSubscription = null
      initialised = false
      state = { ...INITIAL_STATE }
      bootstrapPromise = null
      lastResetKey = null
    }
  }
}

function getSnapshot() {
  return state
}

function getServerSnapshot() {
  return state
}

async function refresh() {
  return bootstrap({ force: true })
}

async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Failed to sign out from Supabase:', error)
    throw error
  }
  lastResetKey = null
  resetToAnonymous()
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    ensureInitialised()
    return () => {}
  }, [])

  return {
    status: snapshot.status,
    session: snapshot.session,
    user: snapshot.user,
    profile: snapshot.profile,
    error: snapshot.error,
    refresh,
    signOut,
  }
}

export { AUTH_STATUS_VALUES }
