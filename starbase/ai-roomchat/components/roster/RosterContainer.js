'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/router'

import { useRoster } from '../../modules/roster/useRoster'
import RosterView from './RosterView'

export default function RosterContainer() {
  const router = useRouter()
  const handleUnauthorized = useCallback(() => {
    router.replace('/')
  }, [router])

  const {
    loading,
    error,
    heroes,
    displayName,
    avatarUrl,
    setError,
    deleteHero,
    reload,
  } = useRoster({ onUnauthorized: handleUnauthorized })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return

    try {
      setDeleting(true)
      await deleteHero(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
      alert(err?.message || '영웅을 삭제하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setDeleting(false)
    }
  }, [deleteHero, deleteTarget, deleting])

  const handleResetError = useCallback(() => {
    setError('')
    reload()
  }, [reload, setError])

  return (
    <RosterView
      loading={loading}
      error={error}
      heroes={heroes}
      displayName={displayName}
      avatarUrl={avatarUrl}
      deleteTarget={deleteTarget}
      deleting={deleting}
      onRequestDelete={setDeleteTarget}
      onCancelDelete={() => setDeleteTarget(null)}
      onConfirmDelete={handleConfirmDelete}
      onLogoutComplete={() => router.replace('/')}
      onResetError={handleResetError}
    />
  )
}
