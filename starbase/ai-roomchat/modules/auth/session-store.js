import { supabase } from '../../lib/supabase'
import { DEFAULT_PROFILE, deriveProfile } from './profile'
import { exchangeAuthCodeFromUrl } from './pkce'

const subscribers = new Set()

const DEFAULT_STATE = {
  status: 'idle',
  session: null,
  user: null,
  profile: { ...DEFAULT_PROFILE },
  error: null,
}

let state = { ...DEFAULT_STATE }
let initialised = false
let loadingPromise = null

function emit() {
  subscribers.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.error('Auth subscriber failed', error)
    }
  })
}

function setState(partial) {
  state = { ...state, ...partial }
  emit()
}

function applySession(session) {
  const user = session?.user || null
  const nextStatus = user ? 'ready' : 'signed-out'

  setState({
    status: nextStatus,
    session,
    user,
    profile: deriveProfile(user),
    error: null,
  })
  initialised = true
}

async function resolveSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session || null
}

export const DEFAULT_AUTH_STATE = { ...DEFAULT_STATE }

export function getSnapshot() {
  return state
}

export function getServerSnapshot() {
  return state
}

export function subscribe(listener) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export async function ensureInitialised(url, { force = false } = {}) {
  if (loadingPromise) {
    return loadingPromise
  }

  if (initialised && !force) {
    return state
  }

  loadingPromise = (async () => {
    setState({ status: 'loading', error: null })
    try {
      if (typeof window !== 'undefined') {
        await exchangeAuthCodeFromUrl(url)
      }
      const session = await resolveSession()
      applySession(session)
    } catch (error) {
      console.error('Auth initialisation failed', error)
      setState({
        status: 'error',
        error,
        session: null,
        user: null,
        profile: { ...DEFAULT_PROFILE },
      })
      initialised = false
      throw error
    } finally {
      loadingPromise = null
    }
    return state
  })()

  return loadingPromise
}

export function syncSession(session) {
  applySession(session)
}

export async function refreshSession() {
  try {
    setState({ status: 'loading', error: null })
    const session = await resolveSession()
    applySession(session)
    return state
  } catch (error) {
    console.error('Auth refresh failed', error)
    setState({
      status: 'error',
      error,
      session: null,
      user: null,
      profile: { ...DEFAULT_PROFILE },
    })
    initialised = false
    throw error
  }
}
