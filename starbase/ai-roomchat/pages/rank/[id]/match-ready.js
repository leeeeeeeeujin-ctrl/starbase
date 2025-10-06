'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import MatchReadyClient from '../../../components/rank/MatchReadyClient'
import { MATCH_MODE_KEYS } from '../../../lib/rank/matchModes'

export default function RankMatchReadyPage() {
  const router = useRouter()
  const { id, mode } = router.query
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !router.isReady) {
    return <div style={{ padding: 24, color: '#f8fafc' }}>매칭 정보를 준비하는 중…</div>
  }

  if (typeof id !== 'string' || !id.trim()) {
    return <div style={{ padding: 24, color: '#f8fafc' }}>게임 정보를 확인할 수 없습니다.</div>
  }

  const matchMode =
    typeof mode === 'string' && mode.trim() ? mode : MATCH_MODE_KEYS.RANK_SHARED

  return <MatchReadyClient gameId={id} mode={matchMode} />
}
