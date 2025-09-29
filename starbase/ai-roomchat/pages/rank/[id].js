// pages/rank/[id].js
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import GameRoomView from '../../components/rank/GameRoomView'
import GameStartModeModal from '../../components/rank/GameStartModeModal'
import { useGameRoom } from '../../hooks/useGameRoom'
import { MATCH_MODE_KEYS } from '../../lib/rank/matchModes'
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
  const [turnTimerVote, setTurnTimerVote] = useState(null)
  const turnTimerVoteRef = useRef(null)
  const [turnTimerVotes, setTurnTimerVotes] = useState({})

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
    state: { loading, game, roles, participants, myHero, deleting, recentBattles },
    derived: { canStart, isOwner, alreadyJoined, myEntry },
    actions: { joinGame, deleteRoom },
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

  const handleStart = () => {
    if (!canStart) return
    if (!myHero) {
      alert('캐릭터가 필요합니다.')
      return
    }
    setShowStartModal(true)
  }

  const handleConfirmStart = (config) => {
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
      router.push({ pathname: `/rank/${id}/solo` })
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
        myHero={myHero}
        myEntry={myEntry}
        onBack={() => router.replace('/lobby')}
        onJoin={handleJoin}
        onStart={handleStart}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startDisabled={!canStart || !myHero}
        recentBattles={recentBattles}
        turnTimerVote={turnTimerVote}
        turnTimerVotes={turnTimerVotes}
        onVoteTurnTimer={handleVoteTurnTimer}
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
