// pages/rank/[id].js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import GameRoomView from '../../components/rank/GameRoomView'
import GameStartModeModal from '../../components/rank/GameStartModeModal'
import AutoMatchProgress from '../../components/rank/AutoMatchProgress'
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
import {
  normalizeHeroIdValue,
  resolveParticipantHeroId,
} from '../../lib/rank/participantUtils'

export default function GameRoomPage() {
  const router = useRouter()
  const { id } = router.query

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [pickRole, setPickRole] = useState('')
  const [showStartModal, setShowStartModal] = useState(false)
  const [showMatchOverlay, setShowMatchOverlay] = useState(false)
  const [matchOverlayMode, setMatchOverlayMode] = useState(null)
  const [startPreset, setStartPreset] = useState({
    mode: MATCH_MODE_KEYS.RANK_SHARED,
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
  const viewerKey = viewerId != null ? String(viewerId) : null
  const participantConflicts = useMemo(() => {
    if (!viewerKey) return []
    const list = Array.isArray(participants) ? participants : []
    const viewerRows = list.filter((participant) => {
      if (!participant) return false
      const ownerKey =
        participant.owner_id != null
          ? String(participant.owner_id)
          : participant.ownerId != null
            ? String(participant.ownerId)
            : null
      return ownerKey && ownerKey === viewerKey
    })

    if (viewerRows.length <= 1) {
      return []
    }

    const entryHeroId = normalizeHeroIdValue(
      myEntry ? resolveParticipantHeroId(myEntry) : myHero?.id,
    )

    return viewerRows.filter((participant) => {
      if (!participant) return false
      if (myEntry?.id && participant.id === myEntry.id) return false
      if (entryHeroId) {
        const heroId = normalizeHeroIdValue(resolveParticipantHeroId(participant))
        if (heroId && heroId === entryHeroId) {
          return false
        }
      }
      return true
    })
  }, [myEntry, myHero?.id, participants, viewerKey])

  const conflictingOthers = participantConflicts

  const hasOwnerConflict =
    conflictingOthers.length > 0 &&
    game &&
    game.owner_id &&
    String(game.owner_id) !== viewerKey

  const matchOverlayHeroId = useMemo(() => {
    if (myEntry) {
      const entryHero = normalizeHeroIdValue(resolveParticipantHeroId(myEntry))
      if (entryHero) {
        return entryHero
      }
    }
    return normalizeHeroIdValue(myHero?.id)
  }, [myEntry, myHero?.id])

  const handleMatchOverlayClose = useCallback(() => {
    setShowMatchOverlay(false)
    setMatchOverlayMode(null)
    setStartNotice('')
    setStartError('')
  }, [])

  const handleJoin = async () => {
    await joinGame(pickRole)
  }

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return

    const stored = readStartSessionValues([
      START_SESSION_KEYS.MODE,
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
    if (startLoading || showMatchOverlay) return
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
  }, [hasMinimumParticipants, myHero, showMatchOverlay, startLoading])

  const handleConfirmStart = async (config) => {
    setShowStartModal(false)
    setStartPreset(config)

    if (typeof window !== 'undefined') {
      writeStartSessionValues(
        {
          [START_SESSION_KEYS.MODE]: config.mode,
          [START_SESSION_KEYS.DUO_OPTION]: null,
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

    if (config.mode === MATCH_MODE_KEYS.RANK_SHARED) {
      setStartNotice('')
      setStartError('')
      setShowMatchOverlay(true)
      setMatchOverlayMode(config.mode)
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

  useEffect(() => {
    if (!showMatchOverlay) return
    if (typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [showMatchOverlay])

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
        startDisabled={!hasMinimumParticipants || !myHero || startLoading || showMatchOverlay}
        startLoading={startLoading || showMatchOverlay}
        startNotice={startNotice}
        startError={startError}
        recentBattles={recentBattles}
        roleOccupancy={roleOccupancy}
        roleLeaderboards={roleLeaderboards}
      />

      {showLeaderboard && (
        <LeaderboardDrawer gameId={id} onClose={() => setShowLeaderboard(false)} />
      )}
      {showMatchOverlay && game?.id && matchOverlayMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 6, 23, 0.78)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <AutoMatchProgress
            key={`${game.id}-${matchOverlayMode}`}
            gameId={game.id}
            mode={matchOverlayMode}
            initialHeroId={matchOverlayHeroId || undefined}
            onClose={handleMatchOverlayClose}
          />
        </div>
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
