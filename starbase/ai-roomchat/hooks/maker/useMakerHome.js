'use client'

import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'
import {
  createPromptSet,
  deletePromptSet,
  fetchPromptSets,
  insertPromptSetBundle,
  readPromptSetBundle,
  renamePromptSet,
  sortPromptSets,
} from '../../lib/maker/promptSetsApi'

function parseImportPayload(file) {
  return file.text().then((text) => {
    try {
      return JSON.parse(text)
    } catch (err) {
      throw new Error('JSON을 불러오지 못했습니다.')
    }
  })
}

export function useMakerHome({ onUnauthorized } = {}) {
  const [hydrated, setHydrated] = useState(false)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadPromptSets = useCallback(
    async (ownerId) => {
      const list = await fetchPromptSets(ownerId)
      setRows(list)
      return list
    },
    [],
  )

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return

    let cancelled = false

    async function bootstrap() {
      setLoading(true)
      setErrorMessage('')

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

      try {
        await loadPromptSets(user.id)
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [hydrated, loadPromptSets, onUnauthorized])

  const refresh = useCallback(
    async (owner = userId) => {
      if (!owner) return
      setLoading(true)
      setErrorMessage('')
      try {
        await loadPromptSets(owner)
      } catch (err) {
        setRows([])
        setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [loadPromptSets, userId],
  )

  const handleRename = useCallback(async (id, nextName) => {
    const trimmed = await renamePromptSet(id, nextName)
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, name: trimmed } : row)))
  }, [])

  const handleDelete = useCallback(async (id) => {
    await deletePromptSet(id)
    setRows((prev) => prev.filter((row) => row.id !== id))
  }, [])

  const handleCreate = useCallback(async () => {
    const inserted = await createPromptSet(userId)
    setRows((prev) => sortPromptSets([inserted, ...prev]))
    return inserted
  }, [userId])

  const exportSet = useCallback(async (id) => {
    const payload = await readPromptSetBundle(id)
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
        throw new Error('로그인이 필요합니다.')
      }

      const payload = await parseImportPayload(file)
      const insertedSet = await insertPromptSetBundle(userId, payload)
      await refresh(userId)
      return insertedSet
    },
    [refresh, userId],
  )

  return {
    hydrated,
    loading,
    errorMessage,
    rows,
    refresh,
    renameSet: handleRename,
    deleteSet: handleDelete,
    createSet: handleCreate,
    exportSet,
    importFromFile,
    setErrorMessage,
  }
}

//
