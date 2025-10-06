// pages/rank/[id].js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '../../lib/rank/geminiConfig'
import {
  START_SESSION_KEYS,
  readStartSessionValue,
  readStartSessionValues,
  writeStartSessionValue,
  writeStartSessionValues,
} from '../../lib/rank/startSessionChannel'

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
    geminiMode: DEFAULT_GEMINI_MODE,
    geminiModel: DEFAULT_GEMINI_MODEL,
    turnTimer: 60,
  })
  const [startLoading, setStartLoading] = useState(false)
  const [startNotice, setStartNotice] = useState('')
  const [startError, setStartError] = useState('')
  const [turnTimerVote, setTurnTimerVote] = useState(null)
  const turnTimerVoteRef = useRef(null)
  const [turnTimerVotes, setTurnTimerVotes] = useState({})

  const persistTurnTimerVotes = useCallback((votes) => {
    if (typeof window === 'undefined') return
    try {
      const payload = votes ? JSON.stringify(votes) : null
      writeStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTES, payload, {
        source: 'match-page',
      })
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
    router.replace('/lobby')
  }, [router])

  const {
    state: {
      loading,
      user,
      game,
      roles,
      participants,
      slots,
      myHero,
      deleting,
      recentBattles,
      sessionHistory,
      sharedSessionHistory,
    },
    derived: {
      canStart,
      isOwner,
      alreadyJoined,
      myEntry,
      minimumParticipants,
      activeParticipants,
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
      refreshSharedHistory,
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
  const resolvedMinimumParticipants = Number.isFinite(Number(minimumParticipants))
    ? Number(minimumParticipants)
    : 0
  const requiredParticipants = Math.max(1, resolvedMinimumParticipants)
  const hasMinimumParticipants = activeParticipants.length >= requiredParticipants

  const viewerId = user?.id || null
  const participantConflicts = useMemo(() => {
    if (!viewerId) return []
    const list = Array.isArray(participants) ? participants : []
    return list.filter((participant) => participant?.owner_id === viewerId)
  }, [participants, viewerId])

  const conflictingOthers = useMemo(() => {
    if (!viewerId) return []
    if (!participantConflicts.length) return []
    if (!myEntry) return participantConflicts
    return participantConflicts.filter((row) => row !== myEntry)
  }, [myEntry, participantConflicts, viewerId])

  const hasOwnerConflict =
    conflictingOthers.length > 0 && game && game.owner_id && game.owner_id !== viewerId

  const handleJoin = async () => {
    await joinGame(pickRole)
  }

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return

    const stored = readStartSessionValues([
      START_SESSION_KEYS.MODE,
      START_SESSION_KEYS.DUO_OPTION,
      START_SESSION_KEYS.CASUAL_OPTION,
      START_SESSION_KEYS.API_VERSION,
      START_SESSION_KEYS.API_KEY,
      START_SESSION_KEYS.GEMINI_MODE,
      START_SESSION_KEYS.GEMINI_MODEL,
      START_SESSION_KEYS.TURN_TIMER,
      START_SESSION_KEYS.TURN_TIMER_VOTE,
    ])

    setStartPreset((prev) => {
      const storedMode = stored[START_SESSION_KEYS.MODE] || prev.mode
      const storedDuo = stored[START_SESSION_KEYS.DUO_OPTION] || prev.duoOption
      const storedCasual = stored[START_SESSION_KEYS.CASUAL_OPTION] || prev.casualOption
      const storedApiVersion = stored[START_SESSION_KEYS.API_VERSION] || prev.apiVersion
      const storedApiKey = stored[START_SESSION_KEYS.API_KEY] || prev.apiKey
      const storedGeminiMode = stored[START_SESSION_KEYS.GEMINI_MODE]
      const storedGeminiModel = stored[START_SESSION_KEYS.GEMINI_MODEL]
      const storedTimerRaw = stored[START_SESSION_KEYS.TURN_TIMER]
      const storedVoteRaw = stored[START_SESSION_KEYS.TURN_TIMER_VOTE]

      const resolvedGeminiMode = storedGeminiMode
        ? normalizeGeminiMode(storedGeminiMode)
        : prev.geminiMode || DEFAULT_GEMINI_MODE

      const resolvedGeminiModel = (() => {
        if (storedGeminiModel) {
          const normalized = normalizeGeminiModelId(storedGeminiModel)
          if (normalized) {
            return normalized
          }
        }
        if (prev.geminiModel) {
          return prev.geminiModel
        }
        return DEFAULT_GEMINI_MODEL
      })()

      const resolvedTimer = (() => {
        const storedTimer = Number(storedTimerRaw)
        if (TURN_TIMER_VALUES.includes(storedTimer)) {
          return storedTimer
        }
        const storedVoteTimer = Number(storedVoteRaw)
        if (TURN_TIMER_VALUES.includes(storedVoteTimer)) {
          return storedVoteTimer
        }
        return prev.turnTimer
      })()

      return {
        ...prev,
        mode: storedMode,
        duoOption: storedDuo,
        casualOption: storedCasual,
        apiVersion: storedApiVersion,
        apiKey: storedApiKey,
        geminiMode: resolvedGeminiMode,
        geminiModel: resolvedGeminiModel,
        turnTimer: resolvedTimer,
      }
    })
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return

    const storedVoteValue = Number(readStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTE))
    const hasStoredVote = TURN_TIMER_VALUES.includes(storedVoteValue)

    if (hasStoredVote) {
      setTurnTimerVote(storedVoteValue)
      turnTimerVoteRef.current = storedVoteValue
    } else {
      turnTimerVoteRef.current = null
    }

    let parsedVotes = {}
    const rawVotes = readStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTES)
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

      writeStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTE, String(numeric), {
        source: 'match-page',
      })
    },
    [persistTurnTimerVotes],
  )

  const handleOpenModeModal = useCallback(() => {
    if (startLoading) return
    if (!hasMinimumParticipants) {
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
  }, [hasMinimumParticipants, myHero, startLoading])

  const handleConfirmStart = async (config) => {
    setShowStartModal(false)
    setStartPreset(config)

    if (typeof window !== 'undefined') {
      writeStartSessionValues(
        {
          [START_SESSION_KEYS.MODE]: config.mode,
          [START_SESSION_KEYS.DUO_OPTION]: config.duoOption,
          [START_SESSION_KEYS.CASUAL_OPTION]: config.casualOption,
          [START_SESSION_KEYS.API_VERSION]: config.apiVersion,
          [START_SESSION_KEYS.GEMINI_MODE]: config.geminiMode || DEFAULT_GEMINI_MODE,
          [START_SESSION_KEYS.GEMINI_MODEL]: config.geminiModel || DEFAULT_GEMINI_MODEL,
          [START_SESSION_KEYS.TURN_TIMER]: String(config.turnTimer || 60),
          [START_SESSION_KEYS.API_KEY]: config.apiKey || null,
        },
        { source: 'match-page' },
      )
    }

    if (config.mode === MATCH_MODE_KEYS.RANK_SOLO) {
      if (startLoading) {
        return
      }

      setStartLoading(true)
      setStartNotice('게임 화면으로 이동합니다…')
      setStartError('')

      try {
        const refreshedSlots = await refreshSlots()
        const slotSource = Array.isArray(refreshedSlots) ? refreshedSlots : slots
        const activeSlots = Array.isArray(slotSource)
          ? slotSource.filter((slot) => slot && slot.active !== false)
          : []

        const slotTarget = activeSlots.length > 0 ? activeSlots.length : requiredParticipants
        if (!slotTarget) {
          throw new Error('no_slots')
        }

        const candidateHeroIds = []
        activeParticipants.forEach((participant) => {
          const directHeroId = participant?.hero_id || participant?.heroId || participant?.hero?.id || null
          if (directHeroId) {
            candidateHeroIds.push(directHeroId)
            return
          }
          if (Array.isArray(participant?.hero_ids)) {
            const fallback = participant.hero_ids.find((value) => Boolean(value)) || null
            if (fallback) {
              candidateHeroIds.push(fallback)
            }
          }
        })

        if (candidateHeroIds.length < Math.max(1, requiredParticipants)) {
          throw new Error('slot_missing_hero')
        }

        await router.push({
          pathname: `/rank/${id}/solo-match`,
        })

        return
      } catch (error) {
        const message = (() => {
          if (!error) return '매칭을 시작하지 못했습니다.'
          const code = typeof error?.code === 'string' ? error.code : ''
          const detail =
            typeof error?.detail === 'string' && error.detail.trim()
              ? error.detail.trim()
              : ''
          if (error.message === 'no_slots') {
            return '슬롯 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
          }
          if (error.message === 'slot_missing_hero') {
            return '비어 있는 역할이 있어 매칭을 시작할 수 없습니다.'
          }
          if (error?.message) {
            const trimmed = error.message.trim()
            if (trimmed === 'server_error') {
              return '서버 오류로 매칭을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
            }
            if (code && code !== trimmed) {
              return code.slice(0, 200)
            }
            return trimmed.slice(0, 200)
          }
          if (detail) {
            return detail.slice(0, 200)
          }
          return '매칭을 시작하지 못했습니다.'
        })()

        if (message) {
          setStartError(message)
          setStartNotice('')
        } else {
          setStartError('')
          setStartNotice('')
        }
        console.error('Failed to start solo match:', error)
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

    router.push({
      pathname: `/rank/${id}/start`,
      query: { mode: config.mode, apiVersion: config.apiVersion },
    })
  }

  const handleCloseStartModal = () => {
    setShowStartModal(false)
  }

  useEffect(() => {
    if (!mounted) return
    if (!hasMinimumParticipants) {
      setStartNotice('')
      setStartError('')
    }
  }, [hasMinimumParticipants, mounted])

  if (!ready || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  if (hasOwnerConflict) {
    const heroSummaries = conflictingOthers.map((row, index) => {
      const heroName =
        (typeof row?.hero_name === 'string' && row.hero_name.trim()) ||
        (typeof row?.heroName === 'string' && row.heroName.trim()) ||
        (row?.hero && typeof row.hero.name === 'string' && row.hero.name.trim()) ||
        (row?.hero_id ? `#${row.hero_id}` : '알 수 없음')
      const roleName = (row?.role && row.role.trim()) || ''
      return { key: `${row?.id || index}`, heroName, roleName }
    })

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f8fafc',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            background: '#fff7f7',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.45)',
            display: 'grid',
            gap: 18,
            color: '#7f1d1d',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>이미 동일 명의로 참가 중입니다</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            이 게임에는 이미 동일 명의로 참가 중인 캐릭터가 있어 매칭 페이지를 이용할 수 없습니다. 아래
            캐릭터 정보를 확인한 뒤 기존 참가를 해제하거나 다른 게임을 선택해 주세요.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {heroSummaries.map(({ key, heroName, roleName }) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'rgba(248, 113, 113, 0.12)',
                  color: '#991b1b',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span>{heroName}</span>
                {roleName ? <span style={{ fontSize: 12, color: '#b91c1c' }}>{roleName}</span> : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.replace('/lobby')}
            style={{
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              padding: '12px 18px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            로비로 돌아가기
          </button>
        </div>
      </div>
    )
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
        sharedSessionHistory={sharedSessionHistory}
        onBack={() => router.replace('/lobby')}
        onJoin={handleJoin}
        onLeave={leaveGame}
        onOpenModeSettings={handleOpenModeModal}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startDisabled={!hasMinimumParticipants || !myHero || startLoading}
        startLoading={startLoading}
        startNotice={startNotice}
        startError={startError}
        recentBattles={recentBattles}
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
