'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { VARIABLE_RULES_VERSION } from '../../lib/variableRules'
import {
  insertPromptSetBundle,
  parsePromptSetImportBundle,
  promptSetsRepository,
  readPromptSetBundle,
  sortPromptSets,
} from '../../lib/maker/promptSets'
async function parseImportPayload(file) {
  const text = await file.text()
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error('JSON을 불러오지 못했습니다.')
  }

  try {
    return parsePromptSetImportBundle(raw)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : '프롬프트 세트 JSON 구조가 올바르지 않습니다.'
    throw new Error(message)
  }
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
  const [noticeMessage, setNoticeMessage] = useState('')

  const loadPromptSets = useCallback(async (ownerId) => {
    const result = await promptSetsRepository.list(ownerId)
    if (result.error) {
      setRows([])
    } else {
      setRows(result.data)
    }
    return result
  }, [])

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
    setErrorMessage,
    setFromError,
  ])

  const refresh = useCallback(
    async (owner = userId) => {
      if (!owner) return
      setLoading(true)
      setErrorMessage('')
      setNoticeMessage('')
      const result = await loadPromptSets(owner)
      if (result.error) {
        setFromError(result.error)
      }
      setLoading(false)
    },
    [loadPromptSets, setErrorMessage, setFromError, setNoticeMessage, userId],
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

      const { bundle, warnings } = await parseImportPayload(file)
      const importedVersion = (() => {
        const meta = bundle?.meta
        if (!meta || typeof meta !== 'object') return null
        const { variableRulesVersion, version } = meta
        const candidate = Number.isFinite(variableRulesVersion)
          ? variableRulesVersion
          : Number.isFinite(version)
          ? version
          : Number.isFinite(Number(variableRulesVersion))
          ? Number(variableRulesVersion)
          : Number.isFinite(Number(version))
          ? Number(version)
          : null
        return Number.isFinite(candidate) ? Number(candidate) : null
      })()

      const result = await insertPromptSetBundle(userId, bundle)
      if (result.error) {
        setFromError(result.error)
        throw result.error
      }

      await refresh(userId)

      const noticeMessages = []

      if (warnings.length) {
        noticeMessages.push(warnings.join(' '))
      }

      if (importedVersion == null) {
        noticeMessages.push(
          '가져온 세트의 변수 규칙 버전을 확인할 수 없습니다. 제작기에서 세트를 열어 다시 저장해 최신 포맷으로 맞춰 주세요.',
        )
      } else if (importedVersion !== VARIABLE_RULES_VERSION) {
        noticeMessages.push(
          `가져온 세트의 변수 규칙 버전(v${importedVersion})이 최신(v${VARIABLE_RULES_VERSION})과 달라 기본 파서로 변환했습니다. 세트를 열어 다시 저장해 주세요.`,
        )
      } else {
        noticeMessages.push('세트를 불러왔습니다. 필요하다면 바로 편집을 시작할 수 있어요.')
      }

      setNoticeMessage(noticeMessages.filter(Boolean).join('\n'))

      return result.data
    },
    [refresh, setFromError, setNoticeMessage, userId],
  )

  return {
    hydrated,
    loading,
    errorMessage,
    noticeMessage,
    rows,
    refresh,
    renameSet: handleRename,
    deleteSet: handleDelete,
    createSet: handleCreate,
    exportSet,
    importFromFile,
    setErrorMessage,
    setNoticeMessage,
  }
}

//
