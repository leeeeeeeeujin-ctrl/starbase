'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import { useMakerHome } from '../../../hooks/maker/useMakerHome'
import MakerHomeView from './MakerHomeView'
import { readHeroSelection } from '../../../lib/heroes/selectedHeroStorage'
import { useSharedPromptSetStorage } from '../../../hooks/shared/useSharedPromptSetStorage'

export default function MakerHomeContainer() {
  const router = useRouter()
  const [returnHeroId, setReturnHeroId] = useState('')
  const { backgroundUrl, setPromptSetId } = useSharedPromptSetStorage()

  const handleUnauthorized = useCallback(() => {
    router.replace('/')
  }, [router])

  const {
    hydrated,
    loading,
    errorMessage,
    rows,
    refresh,
    renameSet,
    deleteSet,
    createSet,
    exportSet,
    importFromFile,
    setErrorMessage,
  } = useMakerHome({ onUnauthorized: handleUnauthorized })

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const selection = readHeroSelection()
    setReturnHeroId(selection?.heroId || '')
  }, [])

  const listHeader = useMemo(() => {
    if (loading) return '세트를 불러오는 중입니다.'
    if (rows.length === 0) return '아직 등록된 프롬프트 세트가 없습니다.'
    return `총 ${rows.length}개 세트`
  }, [loading, rows])

  const handleBeginRename = useCallback((row) => {
    setEditingId(row.id)
    setEditingName(row.name ?? '')
  }, [])

  const handleCancelRename = useCallback(() => {
    setEditingId(null)
    setEditingName('')
    setSavingRename(false)
  }, [])

  const handleSubmitRename = useCallback(
    async (event) => {
      event.preventDefault()
      if (!editingId) return

      try {
        setSavingRename(true)
        await renameSet(editingId, editingName)
        handleCancelRename()
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : '세트 이름을 변경하지 못했습니다.')
      } finally {
        setSavingRename(false)
      }
    },
    [editingId, editingName, handleCancelRename, renameSet],
  )

  const handleDeleteSet = useCallback(
    async (id) => {
      if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) {
        return
      }

      try {
        await deleteSet(id)
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : '세트를 삭제하지 못했습니다.')
      }
    },
    [deleteSet],
  )

  const handleCreateSet = useCallback(async () => {
    try {
      const inserted = await createSet()
      setActionSheetOpen(false)
      if (inserted?.id) {
        setPromptSetId(inserted.id)
        router.push(`/maker/${inserted.id}`)
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '세트를 생성하지 못했습니다.')
    }
  }, [createSet, router, setPromptSetId])

  const handleImportFile = useCallback(
    async (file) => {
      if (!file) return
      try {
        const inserted = await importFromFile(file)
        setActionSheetOpen(false)
        if (inserted?.id) {
          setPromptSetId(inserted.id)
          router.push(`/maker/${inserted.id}`)
        }
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.')
      }
    },
    [importFromFile, router, setPromptSetId],
  )

  const handleExportSet = useCallback(
    async (id) => {
      try {
        setActionSheetOpen(false)
        await exportSet(id)
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : '세트를 내보내지 못했습니다.')
      }
    },
    [exportSet, setActionSheetOpen],
  )

  const handleRefresh = useCallback(() => {
    setErrorMessage('')
    refresh()
  }, [refresh, setErrorMessage])

  const handleGoBack = useCallback(() => {
    if (returnHeroId) {
      router.push(`/character/${returnHeroId}`)
    } else {
      router.push('/roster')
    }
  }, [returnHeroId, router])

  if (!hydrated) {
    return null
  }

  return (
    <MakerHomeView
      backgroundImage={backgroundUrl}
      listHeader={listHeader}
      errorMessage={errorMessage}
      loading={loading}
      rows={rows}
      editingId={editingId}
      editingName={editingName}
      savingRename={savingRename}
      actionSheetOpen={actionSheetOpen}
      onEditingNameChange={setEditingName}
      onBeginRename={handleBeginRename}
      onSubmitRename={handleSubmitRename}
      onCancelRename={handleCancelRename}
      onDeleteSet={handleDeleteSet}
      onOpenSet={(id) => {
        setPromptSetId(id)
        router.push(`/maker/${id}`)
      }}
      onExportSet={handleExportSet}
      onImportFile={handleImportFile}
      onCreateSet={handleCreateSet}
      onRefresh={handleRefresh}
      onToggleActionSheet={setActionSheetOpen}
      onGoBack={handleGoBack}
    />
  )
}

//
