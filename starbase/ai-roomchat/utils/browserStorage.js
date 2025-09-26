const isBrowser = typeof window !== 'undefined'

function getStorage() {
  if (!isBrowser) return null
  try {
    return window.localStorage
  } catch (error) {
    console.error('Local storage is not accessible:', error)
    return null
  }
}

export function readStorage(key) {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch (error) {
    console.error(`Failed to read local storage key "${key}":`, error)
    return null
  }
}

export function writeStorage(key, value) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch (error) {
    console.error(`Failed to write local storage key "${key}":`, error)
  }
}

export function removeStorage(key) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch (error) {
    console.error(`Failed to remove local storage key "${key}":`, error)
  }
}

export function readJsonStorage(key, fallback = null) {
  const raw = readStorage(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Failed to parse local storage JSON key "${key}":`, error)
    return fallback
  }
}

export function writeJsonStorage(key, value) {
  if (value === undefined) {
    removeStorage(key)
    return
  }
  try {
    writeStorage(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to serialise local storage JSON key "${key}":`, error)
  }
}
