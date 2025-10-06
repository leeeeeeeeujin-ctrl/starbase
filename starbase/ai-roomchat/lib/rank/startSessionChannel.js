const STORAGE_PREFIX = "rank.start."
const UPDATE_EVENT = "rank:start-session:update"

export const START_SESSION_KEYS = Object.freeze({
  MODE: "mode",
  DUO_OPTION: "duoOption",
  CASUAL_OPTION: "casualOption",
  API_VERSION: "apiVersion",
  API_KEY: "apiKey",
  GEMINI_MODE: "geminiMode",
  GEMINI_MODEL: "geminiModel",
  TURN_TIMER: "turnTimer",
  TURN_TIMER_VOTE: "turnTimerVote",
  TURN_TIMER_VOTES: "turnTimerVotes",
  MATCH_META: "matchMeta",
  CONNECTIONS: "connections",
})

function toStorageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

function normaliseValue(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.warn("[startSessionChannel] Failed to serialise value", value, error)
    return null
  }
}

export function readStartSessionValue(key) {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage.getItem(toStorageKey(key))
  } catch (error) {
    console.warn(`[startSessionChannel] Failed to read ${key}:`, error)
    return null
  }
}

export function readStartSessionValues(keys = Object.values(START_SESSION_KEYS)) {
  if (!Array.isArray(keys)) {
    return {}
  }
  if (typeof window === "undefined") {
    return keys.reduce((acc, key) => {
      acc[key] = null
      return acc
    }, {})
  }
  const result = {}
  keys.forEach((key) => {
    try {
      result[key] = window.sessionStorage.getItem(toStorageKey(key))
    } catch (error) {
      console.warn(`[startSessionChannel] Failed to read ${key}:`, error)
      result[key] = null
    }
  })
  return result
}

export function writeStartSessionValues(values, options = {}) {
  if (typeof window === "undefined") return []
  if (!values || typeof values !== "object") return []

  const { source = "unknown", broadcast = true } = options
  const changedKeys = []
  const payload = {}

  Object.entries(values).forEach(([key, rawValue]) => {
    const storageKey = toStorageKey(key)
    const normalised = normaliseValue(rawValue)

    try {
      if (normalised === null) {
        if (window.sessionStorage.getItem(storageKey) !== null) {
          window.sessionStorage.removeItem(storageKey)
          changedKeys.push(key)
          payload[key] = null
        }
        return
      }

      const existing = window.sessionStorage.getItem(storageKey)
      if (existing === normalised) {
        return
      }

      window.sessionStorage.setItem(storageKey, normalised)
      changedKeys.push(key)
      payload[key] = normalised
    } catch (error) {
      console.warn(`[startSessionChannel] Failed to write ${key}:`, error)
    }
  })

  if (broadcast && changedKeys.length > 0 && typeof window !== "undefined") {
    try {
      const detail = { source, keys: changedKeys.slice(), values: { ...payload } }
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail }))
    } catch (error) {
      console.warn("[startSessionChannel] Failed to dispatch update event", error)
    }
  }

  return changedKeys
}

export function writeStartSessionValue(key, value, options = {}) {
  return writeStartSessionValues({ [key]: value }, options)
}

export function removeStartSessionValue(key, options = {}) {
  return writeStartSessionValues({ [key]: null }, options)
}

export function subscribeStartSession(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {}
  }

  const handleUpdate = (event) => {
    if (!event || !event.detail) return
    callback({
      source: event.detail.source || "manual",
      keys: Array.isArray(event.detail.keys) ? event.detail.keys.slice() : [],
      values: event.detail.values || {},
    })
  }

  const handleStorage = (event) => {
    if (!event) return
    if (event.storageArea !== window.sessionStorage) return
    if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return

    const key = event.key.slice(STORAGE_PREFIX.length)
    callback({
      source: "storage",
      keys: [key],
      values: { [key]: event.newValue },
    })
  }

  window.addEventListener(UPDATE_EVENT, handleUpdate)
  window.addEventListener("storage", handleStorage)

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate)
    window.removeEventListener("storage", handleStorage)
  }
}

export function getStartSessionSnapshot(keys) {
  const values = readStartSessionValues(keys)
  return {
    values,
    updatedAt: Date.now(),
  }
}
