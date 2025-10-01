// pages/rank/[id].js
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import GameRoomView from '../../components/rank/GameRoomView'
import GameStartModeModal from '../../components/rank/GameStartModeModal'
import { useGameRoom } from '../../hooks/useGameRoom'
import { MATCH_MODE_KEYS } from '../../lib/rank/matchModes'
import { supabase } from '../../lib/supabase'
import {
  normalizeTurnTimerVotes,
  registerTurnTimerVote,
  TURN_TIMER_VALUES,
} from '../../lib/rank/turnTimers'

export default function GameRoomPage() {
  const router = useRouter()
  const { id } = router.query

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [pickRole, setPickRole] = useState('')
  const [showStartModal, setShowStartModal] = useState(false)
  const [startPreset, setStartPreset] = useState({
    mode: MATCH_MODE_KEYS.RANK_SOLO,
    duoOption: 'code',
    casualOption: 'matchmaking',
    apiVersion: 'gemini',
    apiKey: '',
    turnTimer: 60,
  })
  const [startLoading, setStartLoading] = useState(false)
  const [startNotice, setStartNotice] = useState('')
  const [startError, setStartError] = useState('')
  const [turnTimerVote, setTurnTimerVote] = useState(null)
  const turnTimerVoteRef = useRef(null)
  const [turnTimerVotes, setTurnTimerVotes] = useState({})
  const autoModePromptedRef = useRef(false)

  const persistTurnTimerVotes = useCallback((votes) => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem('rank.start.turnTimerVotes', JSON.stringify(votes))
    } catch (error) {
      console.warn('턴 제한 투표 정보를 저장하지 못했습니다:', error)
    }
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
    state: {
      loading,
      game,
      roles,
      participants,
      slots,
      myHero,
      deleting,
      recentBattles,
      sessionHistory,
    },
    derived: {
      canStart,
      isOwner,
      alreadyJoined,
      myEntry,
      minimumParticipants,
      roleOccupancy,
      roleLeaderboards,
    },
    actions: {
      joinGame,
      leaveGame,
      deleteRoom,
      refreshParticipants,
      refreshBattles,
      refreshSlots,
      refreshSessionHistory,
    },
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  useEffect(() => {
    if (alreadyJoined && myEntry?.role) {
      setPickRole(myEntry.role)
    }
  }, [alreadyJoined, myEntry?.role])

  const ready = mounted && !!id

  const handleJoin = async () => {
    await joinGame(pickRole)
  }

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return
    setStartPreset((prev) => ({
      ...prev,
      mode: window.sessionStorage.getItem('rank.start.mode') || prev.mode,
      duoOption: window.sessionStorage.getItem('rank.start.duoOption') || prev.duoOption,
      casualOption:
        window.sessionStorage.getItem('rank.start.casualOption') || prev.casualOption,
      apiVersion:
        window.sessionStorage.getItem('rank.start.apiVersion') || prev.apiVersion,
      apiKey: window.sessionStorage.getItem('rank.start.apiKey') || prev.apiKey,
      turnTimer: (() => {
        const storedTimer = Number(window.sessionStorage.getItem('rank.start.turnTimer'))
        if (TURN_TIMER_VALUES.includes(storedTimer)) {
          return storedTimer
        }
        const storedVoteTimer = Number(
          window.sessionStorage.getItem('rank.start.turnTimerVote'),
        )
        if (TURN_TIMER_VALUES.includes(storedVoteTimer)) {
          return storedVoteTimer
        }
        return prev.turnTimer
      })(),
    }))
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return

    const storedVoteValue = Number(window.sessionStorage.getItem('rank.start.turnTimerVote'))
    const hasStoredVote = TURN_TIMER_VALUES.includes(storedVoteValue)

    if (hasStoredVote) {
      setTurnTimerVote(storedVoteValue)
      turnTimerVoteRef.current = storedVoteValue
    } else {
      turnTimerVoteRef.current = null
    }

    let parsedVotes = {}
    const rawVotes = window.sessionStorage.getItem('rank.start.turnTimerVotes')
    if (rawVotes) {
      try {
        parsedVotes = JSON.parse(rawVotes)
      } catch (error) {
        parsedVotes = {}
      }
    }

    let normalized = normalizeTurnTimerVotes(parsedVotes)
    if (hasStoredVote && !normalized[storedVoteValue]) {
      normalized = registerTurnTimerVote(normalized, null, storedVoteValue)
    }

    setTurnTimerVotes(normalized)
    persistTurnTimerVotes(normalized)
  }, [mounted, persistTurnTimerVotes])

  const handleVoteTurnTimer = useCallback(
    (value) => {
      const numeric = Number(value)
      if (!TURN_TIMER_VALUES.includes(numeric)) {
        return
      }

      setTurnTimerVotes((prev) => {
        const next = registerTurnTimerVote(prev, turnTimerVoteRef.current, numeric)
        persistTurnTimerVotes(next)
        return next
      })

      setTurnTimerVote(numeric)
      turnTimerVoteRef.current = numeric

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('rank.start.turnTimerVote', String(numeric))
      }
    },
    [persistTurnTimerVotes],
  )

  const handleOpenModeModal = useCallback(() => {
    if (startLoading) return
    if (!canStart) {
      setStartNotice('참가 인원이 부족해 매칭을 시작할 수 없습니다.')
      return
    }
    if (!myHero) {
      alert('캐릭터가 필요합니다.')
      return
    }
    setStartNotice('')
    setStartError('')
    setShowStartModal(true)
  }, [canStart, myHero, startLoading])

  const handleConfirmStart = async (config) => {
    setShowStartModal(false)
    setStartPreset(config)

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('rank.start.mode', config.mode)
      window.sessionStorage.setItem('rank.start.duoOption', config.duoOption)
      window.sessionStorage.setItem('rank.start.casualOption', config.casualOption)
      window.sessionStorage.setItem('rank.start.apiVersion', config.apiVersion)
      window.sessionStorage.setItem('rank.start.turnTimer', String(config.turnTimer || 60))
      if (config.apiKey) {
        window.sessionStorage.setItem('rank.start.apiKey', config.apiKey)
      } else {
        window.sessionStorage.removeItem('rank.start.apiKey')
      }
    }

    if (config.mode === MATCH_MODE_KEYS.RANK_SOLO) {
      if (startLoading) {
        return
      }

      setStartLoading(true)
      setStartNotice('매칭을 준비하는 중입니다…')
      setStartError('')

      try {
        const activeSlots = Array.isArray(slots)
          ? slots
              .filter((slot) => slot && slot.active !== false)
              .sort((a, b) => {
                const aIndex = Number(a?.slot_index ?? a?.slotIndex ?? 0)
                const bIndex = Number(b?.slot_index ?? b?.slotIndex ?? 0)
                return aIndex - bIndex
              })
          : []

        if (!activeSlots.length) {
          throw new Error('no_slots')
        }

        const heroIds = activeSlots.map((slot) => slot?.hero_id || slot?.heroId || null)
        if (heroIds.some((value) => !value)) {
          throw new Error('slot_missing_hero')
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }

        const token = sessionData?.session?.access_token
        if (!token) {
          throw new Error('missing_session')
        }

        const response = await fetch('/api/rank/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId: id,
            heroIds,
            userApiKey: config.apiKey,
            apiVersion: config.apiVersion,
            turnTimer: config.turnTimer,
          }),
        })

        if (!response.ok) {
          let detailText = 'server_error'
          try {
            detailText = (await response.text()) || 'server_error'
          } catch (readError) {
            detailText = readError?.message || 'server_error'
          }

          try {
            const parsed = JSON.parse(detailText)
            if (parsed?.error) {
              throw new Error(String(parsed.error))
            }
          } catch (parseError) {
            // ignore JSON parse failure
          }

          throw new Error(detailText)
        }

        const payload = await response.json()
        if (payload?.error && !payload.ok) {
          throw new Error(String(payload.error))
        }

        const outcomeLabel = payload?.outcome
          ? `전투 결과: ${payload.outcome === 'win' ? '승리' : payload.outcome === 'lose' ? '패배' : '무승부'}`
          : '전투가 완료되었습니다.'
        setStartNotice(outcomeLabel)

        await Promise.all([
          refreshParticipants(),
          refreshSlots(),
          refreshBattles(),
          refreshSessionHistory(),
        ])

        return
      } catch (error) {
        const message = (() => {
          if (!error) return '매칭을 시작하지 못했습니다.'
          if (error.message === 'no_slots') {
            return '슬롯 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
          }
          if (error.message === 'slot_missing_hero') {
            return '비어 있는 역할이 있어 매칭을 시작할 수 없습니다.'
          }
          if (error.message === 'missing_session') {
            return '세션 정보를 찾을 수 없습니다. 다시 로그인해 주세요.'
          }
          if (error.message === 'quota_exhausted') {
            return 'AI API 사용량이 부족합니다. 다른 키로 다시 시도해 주세요.'
          }
          if (error?.message) {
            const trimmed = error.message.trim()
            if (trimmed === 'ai_failed') {
              return 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.'
            }
            if (trimmed === 'ai_network_error') {
              return 'AI 호출 중 네트워크 오류가 발생했습니다.'
            }
            if (trimmed === 'server_error') {
              return '서버 오류로 매칭을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
            }
            return trimmed.slice(0, 200)
          }
          return '매칭을 시작하지 못했습니다.'
        })()

        setStartError(message)
        setStartNotice('')
      } finally {
        setStartLoading(false)
      }
      return
    }

    if (config.mode === MATCH_MODE_KEYS.RANK_DUO) {
      const action = config.duoOption || 'search'
      router.push({
        pathname: `/rank/${id}/duo`,
        query: { action },
      })
      return
    }

    if (config.mode === MATCH_MODE_KEYS.CASUAL_PRIVATE) {
      router.push({ pathname: `/rank/${id}/casual-private` })
      return
    }

    if (config.mode === MATCH_MODE_KEYS.CASUAL_MATCH) {
      router.push({ pathname: `/rank/${id}/casual` })
      return
    }

    router.push({ pathname: `/rank/${id}/start`, query: { mode: config.mode, apiVersion: config.apiVersion } })
  }

  const handleCloseStartModal = () => {
    setShowStartModal(false)
  }

  useEffect(() => {
    if (!mounted) return
    if (showStartModal || startLoading) return
    if (!canStart || !myHero) {
      if (!canStart) {
        autoModePromptedRef.current = false
      }
      return
    }
    if (autoModePromptedRef.current) return
    autoModePromptedRef.current = true
    setStartNotice('')
    setStartError('')
    setShowStartModal(true)
  }, [mounted, canStart, myHero, showStartModal, startLoading])

  if (!ready || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  return (
    <>
      <GameRoomView
        game={game}
        participants={participants}
        roles={roles}
        pickRole={pickRole}
        onChangeRole={setPickRole}
        alreadyJoined={alreadyJoined}
        canStart={canStart}
        minimumParticipants={minimumParticipants}
        myHero={myHero}
        myEntry={myEntry}
        sessionHistory={sessionHistory}
        onBack={() => router.replace('/lobby')}
        onJoin={handleJoin}
        onLeave={leaveGame}
        onOpenModeSettings={handleOpenModeModal}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startDisabled={!canStart || !myHero || startLoading}
        startLoading={startLoading}
        startNotice={startNotice}
        startError={startError}
        recentBattles={recentBattles}
        turnTimerVote={turnTimerVote}
        turnTimerVotes={turnTimerVotes}
        onVoteTurnTimer={handleVoteTurnTimer}
        roleOccupancy={roleOccupancy}
        roleLeaderboards={roleLeaderboards}
      />

      {showLeaderboard && (
        <LeaderboardDrawer gameId={id} onClose={() => setShowLeaderboard(false)} />
      )}
      <GameStartModeModal
        open={showStartModal}
        onClose={handleCloseStartModal}
        onConfirm={handleConfirmStart}
        initialConfig={startPreset}
        turnTimerVotes={turnTimerVotes}
        onVoteTurnTimer={handleVoteTurnTimer}
      />
    </>
  )
}

// 
