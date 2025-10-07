// pages/rank/[id].js
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import GameRoomView from '../../components/rank/GameRoomView'
import { useGameRoom } from '../../hooks/useGameRoom'
import {
  normalizeHeroIdValue,
  resolveParticipantHeroId,
} from '../../lib/rank/participantUtils'

export default function GameRoomPage() {
  const router = useRouter()
  const { id } = router.query

  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [pickRole, setPickRole] = useState('')

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

  const ready = !!id
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

  const handleJoin = async () => {
    await joinGame(pickRole)
  }

  const matchDisabledNotice =
    '이제 메인 룸에서는 매칭을 시작하지 않습니다. 캐릭터 페이지의 "방 검색" 버튼을 통해 공개 방을 찾아 주세요.'

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
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startNotice={matchDisabledNotice}
        recentBattles={recentBattles}
        roleOccupancy={roleOccupancy}
        roleLeaderboards={roleLeaderboards}
      />

      {showLeaderboard && (
        <LeaderboardDrawer gameId={id} onClose={() => setShowLeaderboard(false)} />
      )}
    </>
  )
}

// 
