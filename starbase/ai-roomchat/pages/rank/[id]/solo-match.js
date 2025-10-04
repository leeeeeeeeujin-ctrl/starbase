'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import SoloMatchClient from '../../../components/rank/SoloMatchClient'
import { useGameRoom } from '../../../hooks/useGameRoom'

export default function SoloRankMatchPage() {
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
    state: { loading, game, myHero },
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  const ready = mounted && !loading

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>솔로 랭크 매칭 정보를 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return <SoloMatchClient gameId={game.id} initialHeroId={myHero?.id} />
}
