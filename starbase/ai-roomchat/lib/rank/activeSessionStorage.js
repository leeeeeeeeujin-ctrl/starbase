const STORAGE_KEY = 'rank.activeSession'
const EVENT_NAME = 'rank-active-session-change'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function parseValue(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    console.warn('Failed to parse active session payload:', error)
  }
  return null
}

function broadcast(payload) {
  if (!isBrowser()) return
  const event = new CustomEvent(EVENT_NAME, { detail: payload || null })
  window.dispatchEvent(event)
}

export function readActiveSession() {
  if (!isBrowser()) return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return parseValue(raw)
}

function writeSession(payload) {
  if (!isBrowser()) return
  if (!payload) {
    window.localStorage.removeItem(STORAGE_KEY)
    broadcast(null)
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    broadcast(payload)
  } catch (error) {
    console.warn('Unable to persist active session payload:', error)
  }
}

export function storeActiveSessionRecord(gameId, data = {}) {
  if (!isBrowser() || !gameId) return
  const next = {
    gameId,
    href: data.href || `/rank/${gameId}/start`,
    gameName: data.gameName || '',
    description: data.description || '',
    turn: data.turn || 1,
    actorNames: Array.isArray(data.actorNames) ? data.actorNames : [],
    status: data.status || 'active',
    defeated: Boolean(data.defeated),
    updatedAt: new Date().toISOString(),
  }
  writeSession(next)
}

export function updateActiveSessionRecord(gameId, updates = {}) {
  if (!isBrowser() || !gameId) return
  const current = readActiveSession()
  if (!current || current.gameId !== gameId) return
  const next = {
    ...current,
    ...updates,
    actorNames: Array.isArray(updates.actorNames)
      ? updates.actorNames
      : current.actorNames || [],
    updatedAt: new Date().toISOString(),
  }
  if (typeof updates.defeated === 'boolean') {
    next.defeated = updates.defeated
  }
  if (updates.status) {
    next.status = updates.status
  }
  if (typeof updates.turn === 'number') {
    next.turn = updates.turn
  }
  if (typeof updates.gameName === 'string') {
    next.gameName = updates.gameName
  }
  if (typeof updates.description === 'string') {
    next.description = updates.description
  }
  if (updates.href) {
    next.href = updates.href
  }
  writeSession(next)
}

export function markActiveSessionDefeated(gameId) {
  updateActiveSessionRecord(gameId, { status: 'defeated', defeated: true })
}

export function clearActiveSessionRecord(gameId) {
  if (!isBrowser()) return
  const current = readActiveSession()
  if (gameId && current?.gameId && current.gameId !== gameId) {
    return
  }
  writeSession(null)
}

export function subscribeActiveSession(callback) {
  if (!isBrowser() || typeof callback !== 'function') return () => {}
  const handleLocal = (event) => {
    callback(event.detail || null)
  }
  const handleStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEY) return
    callback(parseValue(event.newValue))
  }
  window.addEventListener(EVENT_NAME, handleLocal)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(EVENT_NAME, handleLocal)
    window.removeEventListener('storage', handleStorage)
  }
}
