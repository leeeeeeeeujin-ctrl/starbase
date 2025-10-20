const STORAGE_KEY = 'rank.apiKeyCooldowns'
const COOLDOWN_MS = 5 * 60 * 60 * 1000 // 5 hours
const REPORT_ENDPOINT = '/api/rank/cooldown-report'

function toSafeString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function sendCooldownReport(event) {
  if (typeof window === 'undefined') return
  if (!event || typeof event !== 'object') return

  const payload = {
    hashedKey: toSafeString(event.hashedKey),
    sample: toSafeString(event.sample) || undefined,
    reason: toSafeString(event.reason) || undefined,
    provider: toSafeString(event.provider) || undefined,
    viewerId: toSafeString(event.viewerId) || undefined,
    gameId: toSafeString(event.gameId) || undefined,
    sessionId: toSafeString(event.sessionId) || undefined,
    recordedAt: Number(event.recordedAt) || Date.now(),
    expiresAt: Number(event.expiresAt) || Date.now() + COOLDOWN_MS,
    note: toSafeString(event.note) || undefined,
  }

  if (!payload.hashedKey) {
    return
  }

  const body = JSON.stringify(payload)

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(REPORT_ENDPOINT, blob)
      return
    }
  } catch (error) {
    console.warn('API 키 쿨다운 보고(sendBeacon) 중 오류가 발생했습니다:', error)
  }

  try {
    fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((error) => {
      console.warn('API 키 쿨다운 보고(fetch) 중 오류가 발생했습니다:', error)
    })
  } catch (error) {
    console.warn('API 키 쿨다운 보고(fetch) 호출을 시작하지 못했습니다:', error)
  }
}

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function hashKey(input) {
  const value = typeof input === 'string' ? input : ''
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

function buildSample(input) {
  if (!input) return ''
  if (input.length <= 6) return input
  return `${input.slice(0, 3)}…${input.slice(-2)}`
}

function readStore() {
  if (!isStorageAvailable()) return new Map()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return new Map()
    }
    return new Map(Object.entries(parsed))
  } catch (error) {
    console.warn('API 키 쿨다운 정보를 불러오지 못했습니다:', error)
    return new Map()
  }
}

function writeStore(store) {
  if (!isStorageAvailable()) return
  const payload = {}
  store.forEach((value, key) => {
    payload[key] = value
  })
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('API 키 쿨다운 정보를 저장하지 못했습니다:', error)
  }
}

export function purgeExpiredCooldowns(now = Date.now()) {
  if (!isStorageAvailable()) return new Map()
  const store = readStore()
  let changed = false
  store.forEach((entry, key) => {
    const timestamp = Number(entry?.timestamp)
    if (!Number.isFinite(timestamp) || now - timestamp >= COOLDOWN_MS) {
      store.delete(key)
      changed = true
    }
  })
  if (changed) {
    writeStore(store)
  }
  return store
}

export function getApiKeyCooldown(apiKey, now = Date.now()) {
  if (!isStorageAvailable()) return null
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) return null
  const store = purgeExpiredCooldowns(now)
  const hashed = hashKey(trimmed)
  const entry = store.get(hashed)
  if (!entry) return null
  const recordedAt = Number(entry.timestamp) || now
  const expiresAt = recordedAt + COOLDOWN_MS
  const remainingMs = expiresAt - now
  if (remainingMs <= 0) {
    store.delete(hashed)
    writeStore(store)
    return null
  }
  return {
    active: true,
    recordedAt,
    expiresAt,
    remainingMs,
    reason: entry.reason || 'quota_exhausted',
    keySample: entry.sample || buildSample(trimmed),
  }
}

export function markApiKeyCooldown(apiKey, meta = {}, now = Date.now()) {
  if (!isStorageAvailable()) return null
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) return null
  const store = purgeExpiredCooldowns(now)
  const hashed = hashKey(trimmed)
  const entry = {
    timestamp: now,
    reason: meta.reason || 'quota_exhausted',
    sample: meta.sample || buildSample(trimmed),
  }
  store.set(hashed, entry)
  writeStore(store)

  sendCooldownReport({
    hashedKey: hashed,
    sample: entry.sample,
    reason: entry.reason,
    provider: meta.provider || null,
    viewerId: meta.viewerId || null,
    gameId: meta.gameId || null,
    sessionId: meta.sessionId || null,
    recordedAt: now,
    expiresAt: now + COOLDOWN_MS,
    note: meta.note || null,
  })

  return {
    active: true,
    recordedAt: now,
    expiresAt: now + COOLDOWN_MS,
    remainingMs: COOLDOWN_MS,
    reason: entry.reason,
    keySample: entry.sample,
  }
}

export function clearApiKeyCooldown(apiKey) {
  if (!isStorageAvailable()) return
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) return
  const store = readStore()
  const hashed = hashKey(trimmed)
  if (store.delete(hashed)) {
    writeStore(store)
  }
}

export function getCooldownDurationMs() {
  return COOLDOWN_MS
}
