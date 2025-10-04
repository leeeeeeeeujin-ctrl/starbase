'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import DuoMatchClient from '../../../components/rank/DuoMatchClient'
import { useGameRoom } from '../../../hooks/useGameRoom'

export default function DuoRankMatchPage() {
  const router = useRouter()
  const { id } = router.query
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
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  const ready = mounted && !loading

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>듀오 랭크 매칭 정보를 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return <DuoMatchClient gameId={game.id} />
}
