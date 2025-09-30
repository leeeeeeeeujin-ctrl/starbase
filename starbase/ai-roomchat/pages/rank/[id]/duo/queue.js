'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import DuoMatchClient from '../../../../components/rank/DuoMatchClient'
import { useGameRoom } from '../../../../hooks/useGameRoom'
import { MATCH_MODE_KEYS } from '../../../../lib/rank/matchModes'

function resolveGameId(raw) {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

export default function DuoMatchQueuePage() {
  const router = useRouter()
  const gameId = resolveGameId(router.query.id)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !gameId) return
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('rank.start.mode', MATCH_MODE_KEYS.RANK_DUO)
    }
  }, [gameId, mounted])

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
    return <div style={{ padding: 24, color: '#f4f6fb' }}>듀오 매칭 대기열을 준비하는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return <DuoMatchClient gameId={gameId} />
}
