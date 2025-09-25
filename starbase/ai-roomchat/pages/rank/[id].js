// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import HeroPicker from '../../components/common/HeroPicker'
import { useAiHistory } from '../../lib/aiHistory'
import GameRoomView from '../../components/rank/GameRoomView'
import { useGameRoom } from '../../hooks/useGameRoom'

export default function GameRoomPage() {
  const router = useRouter()
  const { id } = router.query

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [pickRole, setPickRole] = useState('')

  const { push, joinedText } = useAiHistory({ gameId: id })

  const {
    state: { loading, game, roles, requiredSlots, participants, myHero, deleting },
    derived: { canStart, isOwner, alreadyJoined, myEntry },
    actions: { selectHero, joinGame, deleteRoom },
  } = useGameRoom(id, {
    onRequireLogin: () => router.replace('/'),
    onGameMissing: () => {
      alert('게임을 찾을 수 없습니다.')
      router.replace('/rank')
    },
    onDeleted: () => router.replace('/rank'),
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

  const historyText = useMemo(() => joinedText({ onlyPublic: true, last: 20 }), [joinedText])

  if (!ready || loading) {
    return <div style={{ padding: 20 }}>불러오는 중…</div>
  }

  return (
    <>
      <GameRoomView
        game={game}
        requiredSlots={requiredSlots}
        participants={participants}
        roles={roles}
        pickRole={pickRole}
        onChangeRole={setPickRole}
        alreadyJoined={alreadyJoined}
        canStart={canStart}
        myHero={myHero}
        myEntry={myEntry}
        onBack={() => router.replace('/rank')}
        onOpenHeroPicker={() => setPickerOpen(true)}
        onJoin={handleJoin}
        onStart={handleStart}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onDelete={deleteRoom}
        isOwner={isOwner}
        deleting={deleting}
        startDisabled={!canStart || !myHero}
        historyText={historyText}
        onChatSend={async (text) => {
          await push({ role: 'user', content: text, public: true })
          const response = `(${new Date().toLocaleTimeString()}) [AI] “${text.slice(0, 40)}…” 에 대한 응답 (스텁)`
          await push({ role: 'assistant', content: response, public: true })
          return true
        }}
        chatHeroId={myHero?.id}
      />

      {showLeaderboard && (
        <LeaderboardDrawer gameId={id} onClose={() => setShowLeaderboard(false)} />
      )}

      <HeroPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(hero) => {
          selectHero(hero)
          setPickerOpen(false)
        }}
      />
    </>
  )
}

// 
