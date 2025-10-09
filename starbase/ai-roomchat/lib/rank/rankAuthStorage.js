const AUTH_USER_ID_KEY = 'rankAuthUserId'
const AUTH_ACCESS_TOKEN_KEY = 'rankAuthAccessToken'
const AUTH_REFRESH_TOKEN_KEY = 'rankAuthRefreshToken'
const AUTH_ACCESS_EXPIRES_AT_KEY = 'rankAuthAccessExpiresAt'
const RANK_AUTH_STORAGE_EVENT = 'rank-auth:refresh'

const EMPTY_AUTH_SNAPSHOT = {
  userId: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: null,
}

export function createEmptyRankAuthSnapshot() {
  return { ...EMPTY_AUTH_SNAPSHOT }
}

function safeStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch (error) {
    console.error('[RankAuthStorage] Failed to access localStorage:', error)
    return null
  }
}

function normalizeValue(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function broadcastChange() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(RANK_AUTH_STORAGE_EVENT))
  } catch (error) {
    console.warn('[RankAuthStorage] Failed to dispatch storage event:', error)
  }
}

export function persistRankAuthSession(session) {
  const storage = safeStorage()
  if (!storage) return

  if (!session) {
    storage.removeItem(AUTH_ACCESS_TOKEN_KEY)
    storage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    storage.removeItem(AUTH_ACCESS_EXPIRES_AT_KEY)
    storage.removeItem(AUTH_USER_ID_KEY)
    broadcastChange()
    return
  }

  const accessToken = normalizeValue(session.access_token || session.accessToken)
  const refreshToken = normalizeValue(session.refresh_token || session.refreshToken)
  const expiresAt = session.expires_at || session.expiresAt || null
  const userId = normalizeValue(session.user?.id || session.user_id)

  try {
    if (accessToken) {
      storage.setItem(AUTH_ACCESS_TOKEN_KEY, accessToken)
    } else {
      storage.removeItem(AUTH_ACCESS_TOKEN_KEY)
    }

    if (refreshToken) {
      storage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken)
    } else {
      storage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    }

    if (Number.isFinite(Number(expiresAt))) {
      storage.setItem(AUTH_ACCESS_EXPIRES_AT_KEY, String(expiresAt))
    } else {
      storage.removeItem(AUTH_ACCESS_EXPIRES_AT_KEY)
    }

    if (userId) {
      storage.setItem(AUTH_USER_ID_KEY, userId)
    }
  } catch (error) {
    console.error('[RankAuthStorage] Failed to persist session:', error)
  }

  broadcastChange()
}

export function persistRankAuthUser(user) {
  const storage = safeStorage()
  if (!storage) return

  const userId = normalizeValue(user?.id ?? user)
  try {
    if (userId) {
      storage.setItem(AUTH_USER_ID_KEY, userId)
    } else {
      storage.removeItem(AUTH_USER_ID_KEY)
    }
  } catch (error) {
    console.error('[RankAuthStorage] Failed to persist user id:', error)
  }

  broadcastChange()
}

export function clearRankAuthSession() {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.removeItem(AUTH_ACCESS_TOKEN_KEY)
    storage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    storage.removeItem(AUTH_ACCESS_EXPIRES_AT_KEY)
    storage.removeItem(AUTH_USER_ID_KEY)
  } catch (error) {
    console.error('[RankAuthStorage] Failed to clear session:', error)
  }
  broadcastChange()
}

export function readRankAuthSnapshot() {
  const storage = safeStorage()
  if (!storage) {
    return createEmptyRankAuthSnapshot()
  }

  let expiresAt = null
  const expiresRaw = storage.getItem(AUTH_ACCESS_EXPIRES_AT_KEY)
  if (expiresRaw) {
    const numeric = Number(expiresRaw)
    expiresAt = Number.isFinite(numeric) ? numeric : null
  }

  return {
    userId: storage.getItem(AUTH_USER_ID_KEY) || '',
    accessToken: storage.getItem(AUTH_ACCESS_TOKEN_KEY) || '',
    refreshToken: storage.getItem(AUTH_REFRESH_TOKEN_KEY) || '',
    expiresAt,
  }
}

export {
  AUTH_ACCESS_EXPIRES_AT_KEY,
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_USER_ID_KEY,
  RANK_AUTH_STORAGE_EVENT,
}
