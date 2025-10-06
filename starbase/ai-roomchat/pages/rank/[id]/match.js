'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import MatchQueueClient from '../../../components/rank/MatchQueueClient'
import { MATCH_MODE_KEYS } from '../../../lib/rank/matchModes'
import { useGameRoom } from '../../../hooks/useGameRoom'

export default function RankMatchQueuePage() {
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
    return <div style={{ padding: 24, color: '#f4f6fb' }}>랭크 매칭 정보를 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return (
    <MatchQueueClient
      gameId={game.id}
      mode={MATCH_MODE_KEYS.RANK_SHARED}
      title="랭크 매칭"
      description="역할별 방을 만들거나 합류해 모든 참가자가 준비되면 자동으로 경기가 시작됩니다."
      emptyHint="아직 열린 방이 없습니다. 새 방을 만들거나 잠시 후 다시 확인해 주세요."
      autoJoin
      autoStart
    />
  )
}
