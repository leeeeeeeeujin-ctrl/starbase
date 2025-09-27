'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import {
  insertPromptSetBundle,
  promptSetsRepository,
  readPromptSetBundle,
  sortPromptSets,
} from '../../lib/maker/promptSets'
import {
  importPromptLibraryEntry,
  listPromptLibraryEntries,
  publishPromptSetToLibrary,
} from '../../lib/maker/promptLibrary'

function parseImportPayload(file) {
  return file.text().then((text) => {
    try {
      return JSON.parse(text)
    } catch (err) {
      throw new Error('JSON을 불러오지 못했습니다.')
    }
  })
}

function useResultMessage() {
  const [message, setMessage] = useState('')
  const setFromError = useCallback((error) => {
    if (!error) {
      setMessage('')
      return
    }
    const next = error instanceof Error ? error.message : String(error)
    setMessage(next || '')
  }, [])
  return useMemo(
    () => ({
      message,
      setMessage,
      setFromError,
    }),
    [message, setMessage, setFromError],
  )
}

export function useMakerHome({ onUnauthorized } = {}) {
  const [hydrated, setHydrated] = useState(false)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const { message: errorMessage, setMessage: setErrorMessage, setFromError } = useResultMessage()
  const [libraryRows, setLibraryRows] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const {
    message: libraryError,
    setMessage: setLibraryError,
    setFromError: setLibraryErrorFromError,
  } = useResultMessage()

  const loadPromptSets = useCallback(async (ownerId) => {
    const result = await promptSetsRepository.list(ownerId)
    if (result.error) {
      setRows([])
    } else {
      setRows(result.data)
    }
    return result
  }, [])

  const refreshLibraryEntries = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError('')
    const result = await listPromptLibraryEntries({ limit: 12 })
    if (result.error) {
      setLibraryRows([])
      setLibraryErrorFromError(result.error)
    } else {
      setLibraryRows(result.data)
    }
    setLibraryLoading(false)
    return result
  }, [setLibraryError, setLibraryErrorFromError])

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return

    let cancelled = false

    async function bootstrap() {
      setLoading(true)
      setErrorMessage('')
      refreshLibraryEntries()

      const { data: authData } = await supabase.auth.getUser()
      if (cancelled) return

      const user = authData?.user
      if (!user) {
        setUserId(null)
        setRows([])
        setLoading(false)
        if (onUnauthorized) {
          onUnauthorized()
        }
        return
      }

      setUserId(user.id)

      const result = await loadPromptSets(user.id)
      if (!cancelled) {
        if (result.error) {
          setFromError(result.error)
        }
        setLoading(false)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [
    hydrated,
    loadPromptSets,
    onUnauthorized,
    refreshLibraryEntries,
    setErrorMessage,
    setFromError,
  ])

  const refresh = useCallback(
    async (owner = userId) => {
      if (!owner) return
      setLoading(true)
      setErrorMessage('')
      const result = await loadPromptSets(owner)
      if (result.error) {
        setFromError(result.error)
      }
      setLoading(false)
    },
    [loadPromptSets, setErrorMessage, setFromError, userId],
  )

  const handleRename = useCallback(async (id, nextName) => {
    const result = await promptSetsRepository.rename(id, nextName)
    if (result.error) {
      setFromError(result.error)
      throw result.error
    }
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, name: result.data } : row)))
    return result.data
  }, [setFromError])

  const handleDelete = useCallback(async (id) => {
    const result = await promptSetsRepository.remove(id)
    if (result.error) {
      setFromError(result.error)
      throw result.error
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
    return true
  }, [setFromError])

  const handleCreate = useCallback(async () => {
    const result = await promptSetsRepository.create(userId)
    if (result.error) {
      setFromError(result.error)
      throw result.error
    }
    setRows((prev) => sortPromptSets([result.data, ...prev]))
    return result.data
  }, [setFromError, userId])

  const handlePublish = useCallback(
    async (setId) => {
      const result = await publishPromptSetToLibrary(userId, setId)
      if (result.error) {
        setLibraryErrorFromError(result.error)
        throw result.error
      }
      await refreshLibraryEntries()
      return result.data
    },
    [refreshLibraryEntries, setLibraryErrorFromError, userId],
  )

  const handleImportFromLibrary = useCallback(
    async (entryId) => {
      const result = await importPromptLibraryEntry(userId, entryId)
      if (result.error) {
        setLibraryErrorFromError(result.error)
        throw result.error
      }
      await refresh(userId)
      return result.data
    },
    [refresh, setLibraryErrorFromError, userId],
  )

  const exportSet = useCallback(async (id) => {
    const result = await readPromptSetBundle(id)
    if (result.error) {
      throw result.error
    }

    const payload = result.data
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `promptset-${payload.set.name || 'export'}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }, [])

  const importFromFile = useCallback(
    async (file) => {
      if (!file) return null
      if (!userId) {
        const error = new Error('로그인이 필요합니다.')
        setFromError(error)
        throw error
      }

      const payload = await parseImportPayload(file)
      const result = await insertPromptSetBundle(userId, payload)
      if (result.error) {
        setFromError(result.error)
        throw result.error
      }
      await refresh(userId)
      return result.data
    },
    [refresh, setFromError, userId],
  )

  return {
    hydrated,
    loading,
    errorMessage,
    rows,
    libraryRows,
    libraryLoading,
    libraryError,
    refresh,
    refreshLibraryEntries,
    renameSet: handleRename,
    deleteSet: handleDelete,
    createSet: handleCreate,
    exportSet,
    importFromFile,
    publishToLibrary: handlePublish,
    importLibraryEntry: handleImportFromLibrary,
    setErrorMessage,
  }
}

//
