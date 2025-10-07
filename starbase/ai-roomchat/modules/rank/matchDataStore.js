const STORAGE_PREFIX = 'rank.match.game.'

function createEmptyState() {
  return {
    updatedAt: 0,
    participation: {
      roster: [],
      heroOptions: [],
      heroMap: null,
      participantPool: [],
      updatedAt: 0,
    },
    heroSelection: null,
    matchSnapshot: null,
    postCheck: null,
    confirmation: null,
  }
}

function safeClone(value) {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Map) {
    return safeClone(Object.fromEntries(value.entries()))
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeClone(item)).filter((item) => item !== undefined)
  }

  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      try {
        const clone = {}
        for (const key of Object.keys(value)) {
          const cloned = safeClone(value[key])
          if (cloned !== undefined) {
            clone[key] = cloned
          }
        }
        return clone
      } catch (innerError) {
        console.warn('[matchDataStore] 데이터를 복제하지 못했습니다:', innerError)
        return null
      }
    }
  }

  if (typeof value === 'function') {
    return undefined
  }

  return value
}

function getStorageKey(gameId) {
  if (!gameId && gameId !== 0) return ''
  const key = String(gameId).trim()
  return key ? `${STORAGE_PREFIX}${key}` : ''
}

const memoryStore = new Map()

function readFromSession(gameId) {
  if (typeof window === 'undefined') return null
  const storageKey = getStorageKey(gameId)
  if (!storageKey) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...createEmptyState(), ...parsed }
  } catch (error) {
    console.warn('[matchDataStore] 세션에서 매칭 데이터를 불러오지 못했습니다:', error)
    return null
  }
}

function persistToSession(gameId, payload) {
  if (typeof window === 'undefined') return
  const storageKey = getStorageKey(gameId)
  if (!storageKey) return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload))
  } catch (error) {
    console.warn('[matchDataStore] 세션에 매칭 데이터를 저장하지 못했습니다:', error)
  }
}

function ensureEntry(gameId) {
  const key = String(gameId || '').trim()
  if (!key) return null
  if (memoryStore.has(key)) {
    return memoryStore.get(key)
  }
  const stored = readFromSession(key)
  const initial = stored ? { ...createEmptyState(), ...stored } : createEmptyState()
  memoryStore.set(key, initial)
  return initial
}

function updateEntry(gameId, updater) {
  const key = String(gameId || '').trim()
  if (!key) return null
  const current = ensureEntry(key)
  if (!current) return null
  const next = { ...current }
  updater(next)
  next.updatedAt = Date.now()
  memoryStore.set(key, next)
  persistToSession(key, next)
  return safeClone(next)
}

function sanitizeHeroMap(heroMap) {
  if (!heroMap) return null
  if (heroMap instanceof Map) {
    return safeClone(Object.fromEntries(heroMap.entries()))
  }
  if (typeof heroMap === 'object') {
    return safeClone(heroMap)
  }
  return null
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return []
  return safeClone(list) || []
}

export function hydrateGameMatchData(gameId) {
  const entry = ensureEntry(gameId)
  return safeClone(entry)
}

export function readGameMatchData(gameId) {
  if (!memoryStore.has(String(gameId || '').trim())) {
    return hydrateGameMatchData(gameId)
  }
  return safeClone(memoryStore.get(String(gameId || '').trim()))
}

export function setGameMatchParticipation(gameId, payload = {}) {
  const roster = sanitizeList(payload.roster)
  const heroOptions = sanitizeList(payload.heroOptions)
  const participantPool = sanitizeList(payload.participantPool)
  const heroMap = sanitizeHeroMap(payload.heroMap)
  const updatedAt = Date.now()
  return updateEntry(gameId, (entry) => {
    entry.participation = {
      roster,
      heroOptions,
      participantPool,
      heroMap,
      updatedAt,
    }
  })
}

export function setGameMatchHeroSelection(gameId, payload = {}) {
  const heroId = payload.heroId != null ? String(payload.heroId).trim() : ''
  const viewerId = payload.viewerId != null ? String(payload.viewerId).trim() : ''
  const role = payload.role != null ? String(payload.role).trim() : ''
  const ownerId = payload.ownerId != null ? String(payload.ownerId).trim() : viewerId
  const heroMeta = safeClone(payload.heroMeta)
  const updatedAt = Date.now()
  return updateEntry(gameId, (entry) => {
    entry.heroSelection = {
      heroId,
      viewerId,
      ownerId,
      role,
      heroMeta,
      updatedAt,
    }
  })
}

export function setGameMatchSnapshot(gameId, payload = {}) {
  const snapshot = {
    match: safeClone(payload.match) || null,
    pendingMatch: safeClone(payload.pendingMatch) || null,
    viewerId: payload.viewerId != null ? String(payload.viewerId).trim() : '',
    heroId: payload.heroId != null ? String(payload.heroId).trim() : '',
    role: payload.role != null ? String(payload.role).trim() : '',
    mode: payload.mode != null ? String(payload.mode).trim() : '',
    createdAt: payload.createdAt || Date.now(),
  }
  return updateEntry(gameId, (entry) => {
    entry.matchSnapshot = snapshot
  })
}

export function setGameMatchPostCheck(gameId, postCheck) {
  const sanitized = safeClone(postCheck)
  if (sanitized === undefined) return hydrateGameMatchData(gameId)
  return updateEntry(gameId, (entry) => {
    entry.postCheck = sanitized
  })
}

export function setGameMatchConfirmation(gameId, confirmation) {
  const sanitized = safeClone(confirmation)
  if (!sanitized) return hydrateGameMatchData(gameId)
  return updateEntry(gameId, (entry) => {
    entry.confirmation = sanitized
  })
}

export function clearGameMatchData(gameId) {
  const key = String(gameId || '').trim()
  if (!key) return
  memoryStore.delete(key)
  if (typeof window !== 'undefined') {
    const storageKey = getStorageKey(key)
    try {
      if (storageKey) {
        window.sessionStorage.removeItem(storageKey)
      }
    } catch (error) {
      console.warn('[matchDataStore] 세션에서 매칭 데이터를 삭제하지 못했습니다:', error)
    }
  }
}

export function consumeGameMatchData(gameId) {
  const snapshot = readGameMatchData(gameId)
  clearGameMatchData(gameId)
  return snapshot
}
