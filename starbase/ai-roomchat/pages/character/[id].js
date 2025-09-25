import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import CharacterDashboard from '../../components/character/CharacterDashboard'
import StartBattleOverlay from '../../components/character/CharacterDashboard/StartBattleOverlay'
import StartClient from '../../components/rank/StartClient'
import useCharacterDashboard from '../../hooks/useCharacterDashboard'

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const dashboard = useCharacterDashboard(id)
  const [startOpen, setStartOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  const heroName = useMemo(() => {
    return dashboard.edit?.name || dashboard.hero?.name || '이름 없는 캐릭터'
  }, [dashboard.edit?.name, dashboard.hero?.name])

  if (dashboard.loading) {
    return <div style={{ padding: 20, color: '#0f172a' }}>불러오는 중…</div>
  }

  if (!dashboard.hero) {
    return null
  }

  return (
    <>
      <CharacterDashboard
        dashboard={dashboard}
        heroName={heroName}
        onStartBattle={() => {
          setClientOpen(false)
          if (!dashboard.selectedGameId) {
            alert('먼저 게임을 선택하세요.')
            return
          }
          setStartOpen(true)
        }}
        onBack={() => router.back()}
        onGoLobby={() => router.push(`/lobby?heroId=${dashboard.hero?.id}`)}
      />
      <StartBattleOverlay
        open={startOpen}
        hero={dashboard.hero}
        selectedEntry={dashboard.selectedEntry}
        selectedGame={dashboard.selectedGame}
        selectedGameId={dashboard.selectedGameId}
        scoreboardRows={dashboard.selectedScoreboard}
        heroLookup={dashboard.heroLookup}
        onClose={() => setStartOpen(false)}
        onBeginSession={() => {
          setStartOpen(false)
          if (!dashboard.selectedGameId) return
          setClientOpen(true)
        }}
      />
      {clientOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
            padding: '24px 16px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              borderRadius: 16,
              width: '100%',
              maxWidth: 1280,
              maxHeight: '100%',
              overflow: 'auto',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <StartClient
              gameId={dashboard.selectedGameId}
              onExit={() => setClientOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

// Character detail page that composes the dashboard view and inline battle overlays.
