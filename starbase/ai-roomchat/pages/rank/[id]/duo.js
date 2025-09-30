'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import DuoRoomClient from '../../../components/rank/DuoRoomClient'
import { useGameRoom } from '../../../hooks/useGameRoom'
import { loadActiveRoles } from '../../../lib/rank/matchmakingService'
import { MATCH_MODE_KEYS } from '../../../lib/rank/matchModes'
import { supabase } from '../../../lib/supabase'

function resolveGameId(raw) {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

function resolveAction(raw) {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

export default function DuoRoomPage() {
  const router = useRouter()
  const gameId = resolveGameId(router.query.id)
  const initialAction = resolveAction(router.query.action)
  const [mounted, setMounted] = useState(false)
  const [roleDetails, setRoleDetails] = useState([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !gameId) return undefined
    let cancelled = false
    loadActiveRoles(supabase, gameId)
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
    state: { loading, game, roles, myHero, user },
    derived: { myEntry },
  } = useGameRoom(gameId, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  const ready = useMemo(() => mounted && !loading, [mounted, loading])

  const handleExit = useCallback(() => {
    if (!gameId) {
      router.replace('/rank')
      return
    }
    router.replace(`/rank/${gameId}`)
  }, [gameId, router])

  const handleLaunch = useCallback(
    () => {
      if (!gameId) return
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('rank.start.mode', MATCH_MODE_KEYS.RANK_DUO)
        if (initialAction) {
          window.sessionStorage.setItem('rank.start.duoOption', initialAction)
        }
      }
      router.push({ pathname: `/rank/${gameId}/duo/queue` })
    },
    [gameId, initialAction, router],
  )

  if (!ready) {
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
      myEntry={myEntry}
      user={user}
      initialAction={initialAction}
      onExit={handleExit}
      onLaunch={handleLaunch}
    />
  )
}
