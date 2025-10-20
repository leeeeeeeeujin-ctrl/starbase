'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const BACKGROUND_KEY = 'selectedHeroBackgroundUrl'
const BACKGROUND_TS_KEY = `${BACKGROUND_KEY}:updatedAt`
const PROMPT_SET_KEY = 'maker:lastPromptSetId'
const PROMPT_SET_TS_KEY = `${PROMPT_SET_KEY}:updatedAt`

const defaultRecord = Object.freeze({ value: '', updatedAt: 0 })

function getSafeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readRecord(key, timestampKey) {
  if (typeof window === 'undefined') {
    return defaultRecord
  }

  try {
    const value = window.localStorage.getItem(key) ?? ''
    const updatedAt = getSafeNumber(window.localStorage.getItem(timestampKey))
    return { value, updatedAt }
  } catch (error) {
    console.error('Failed to read shared prompt storage:', error)
    return defaultRecord
  }
}

function writeRecord(key, timestampKey, value) {
  if (typeof window === 'undefined') {
    return defaultRecord
  }

  const safeValue = value == null ? '' : String(value)
  const updatedAt = Date.now()

  try {
    window.localStorage.setItem(key, safeValue)
    window.localStorage.setItem(timestampKey, String(updatedAt))
  } catch (error) {
    console.error('Failed to write shared prompt storage:', error)
  }

  return { value: safeValue, updatedAt }
}

function clearRecord(key, timestampKey) {
  if (typeof window === 'undefined') {
    return defaultRecord
  }

  try {
    window.localStorage.removeItem(key)
    window.localStorage.removeItem(timestampKey)
  } catch (error) {
    console.error('Failed to clear shared prompt storage:', error)
  }

  return { value: '', updatedAt: Date.now() }
}

export function readSharedPromptSetSnapshot() {
  return {
    background: readRecord(BACKGROUND_KEY, BACKGROUND_TS_KEY),
    promptSet: readRecord(PROMPT_SET_KEY, PROMPT_SET_TS_KEY),
  }
}

export function writeSharedBackgroundUrl(nextValue) {
  return writeRecord(BACKGROUND_KEY, BACKGROUND_TS_KEY, nextValue)
}

export function clearSharedBackgroundUrl() {
  return clearRecord(BACKGROUND_KEY, BACKGROUND_TS_KEY)
}

export function writeSharedPromptSetId(nextValue) {
  return writeRecord(PROMPT_SET_KEY, PROMPT_SET_TS_KEY, nextValue)
}

export function clearSharedPromptSetId() {
  return clearRecord(PROMPT_SET_KEY, PROMPT_SET_TS_KEY)
}

export function useSharedPromptSetStorage() {
  const [background, setBackground] = useState(defaultRecord)
  const [promptSet, setPromptSet] = useState(defaultRecord)

  const syncFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return
    const snapshot = readSharedPromptSetSnapshot()
    setBackground((prev) =>
      snapshot.background.updatedAt >= prev.updatedAt ? snapshot.background : prev,
    )
    setPromptSet((prev) =>
      snapshot.promptSet.updatedAt >= prev.updatedAt ? snapshot.promptSet : prev,
    )
  }, [])

  useEffect(() => {
    syncFromStorage()
  }, [syncFromStorage])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleStorage = (event) => {
      if (event.storageArea !== window.localStorage) return
      if (
        event.key === BACKGROUND_KEY ||
        event.key === BACKGROUND_TS_KEY ||
        event.key === PROMPT_SET_KEY ||
        event.key === PROMPT_SET_TS_KEY
      ) {
        syncFromStorage()
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [syncFromStorage])

  const setBackgroundUrl = useCallback((nextValue) => {
    const record = writeSharedBackgroundUrl(nextValue)
    setBackground(record)
  }, [])

  const resetBackgroundUrl = useCallback(() => {
    const record = clearSharedBackgroundUrl()
    setBackground(record)
  }, [])

  const setPromptSetId = useCallback((nextValue) => {
    const record = writeSharedPromptSetId(nextValue)
    setPromptSet(record)
  }, [])

  const resetPromptSetId = useCallback(() => {
    const record = clearSharedPromptSetId()
    setPromptSet(record)
  }, [])

  return useMemo(
    () => ({
      backgroundUrl: background.value,
      backgroundUpdatedAt: background.updatedAt,
      setBackgroundUrl,
      clearBackgroundUrl: resetBackgroundUrl,
      promptSetId: promptSet.value,
      promptSetUpdatedAt: promptSet.updatedAt,
      setPromptSetId,
      clearPromptSetId: resetPromptSetId,
      refreshSharedPromptSetStorage: syncFromStorage,
    }),
    [
      background.value,
      background.updatedAt,
      promptSet.value,
      promptSet.updatedAt,
      resetBackgroundUrl,
      resetPromptSetId,
      setBackgroundUrl,
      setPromptSetId,
      syncFromStorage,
    ],
  )
}
