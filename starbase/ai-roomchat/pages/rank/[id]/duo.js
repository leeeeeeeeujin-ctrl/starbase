'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import DuoRoomClient from '../../../components/rank/DuoRoomClient'
import { useGameRoom } from '../../../hooks/useGameRoom'
import { loadActiveRoles } from '../../../lib/rank/matchmakingService'
import { MATCH_MODE_KEYS } from '../../../lib/rank/matchModes'
import { supabase } from '../../../lib/supabase'

export default function RankDuoRoomPage() {
  const router = useRouter()
  const { id } = router.query
  const [mounted, setMounted] = useState(false)
  const [roleDetails, setRoleDetails] = useState([])

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
    state: { loading, game, roles, myHero, user },
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  useEffect(() => {
    if (!mounted || !id) return
    let cancelled = false
    loadActiveRoles(supabase, id)
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setRoleDetails(list)
        }
      })
      .catch((cause) => {
        console.warn('역할 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) setRoleDetails([])
      })
    return () => {
      cancelled = true
    }
  }, [id, mounted])

  const initialAction = useMemo(() => {
    const raw = router.query?.action
    return typeof raw === 'string' ? raw : 'create'
  }, [router.query?.action])

  const handleExit = useCallback(() => {
    if (!id) {
      router.replace('/rank')
      return
    }
    router.replace(`/rank/${id}`)
  }, [id, router])

  const handleLaunch = useCallback(() => {
    if (!id) return
    router.push({ pathname: `/rank/${id}/start`, query: { mode: MATCH_MODE_KEYS.RANK_DUO } })
  }, [id, router])

  if (!mounted || loading) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>듀오 방 정보를 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  return (
    <DuoRoomClient
      game={game}
      roleDetails={roleDetails}
      roles={roles}
      myHero={myHero}
      user={user}
      initialAction={initialAction}
      onExit={handleExit}
      onLaunch={handleLaunch}
    />
  )
}

