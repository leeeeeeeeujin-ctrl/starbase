// pages/rank/[id].js
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import { useAiHistory } from '../../lib/aiHistory'
import GameRoomView from '../../components/rank/GameRoomView'
import { useGameRoom } from '../../hooks/useGameRoom'

export default function GameRoomPage() {
  const router = useRouter()
  const { id } = router.query

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [pickRole, setPickRole] = useState('')

  const { push } = useAiHistory({ gameId: id })

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
    state: { loading, game, roles, participants, myHero, deleting },
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

  const handleStart = () => {
    if (!canStart) return
    if (!myHero) {
      alert('캐릭터가 필요합니다.')
      return
    }
    router.push(`/rank/${id}/start`)
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
        onBack={() => router.replace('/rank')}
        onJoin={handleJoin}
        onStart={handleStart}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startDisabled={!canStart || !myHero}
        onChatSend={async (text) => {
          await push({ role: 'user', content: text, public: true })
          const response = `(${new Date().toLocaleTimeString()}) [AI] “${text.slice(0, 40)}…” 에 대한 응답 (스텁)`
          await push({ role: 'assistant', content: response, public: true })
          return true
        }}
      />

      {showLeaderboard && (
        <LeaderboardDrawer gameId={id} onClose={() => setShowLeaderboard(false)} />
      )}
    </>
  )
}

// 
