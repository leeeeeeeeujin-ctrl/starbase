'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import CasualMatchClient from '../../../components/rank/CasualMatchClient'
import { useGameRoom } from '../../../hooks/useGameRoom'

function resolveGameId(raw) {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

export default function CasualMatchPage() {
  const router = useRouter()
  const gameId = resolveGameId(router.query.id)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleRequireLogin = useCallback(() => {
    router.replace('/')
  }, [router])

  const handleGameMissing = useCallback(() => {
    alert('게임을 찾을 수 없습니다.')
    router.replace('/rank')
  }, [router])

  const handleDeleted = useCallback(() => {
    router.replace('/rank')
  }, [router])

  const {
    state: { loading, game },
  } = useGameRoom(gameId, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  const ready = useMemo(() => mounted && !loading, [mounted, loading])

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>캐주얼 대기열을 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return <CasualMatchClient gameId={gameId} />
}
