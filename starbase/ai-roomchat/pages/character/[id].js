import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import CharacterDashboard from '../../components/character/CharacterDashboard'
import StartBattleOverlay from '../../components/character/CharacterDashboard/StartBattleOverlay'
import useCharacterDashboard from '../../hooks/useCharacterDashboard'

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const dashboard = useCharacterDashboard(id)
  const [startOpen, setStartOpen] = useState(false)

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
        onNavigate={() => {
          setStartOpen(false)
          if (dashboard.selectedGameId) {
            router.push(`/rank/${dashboard.selectedGameId}`)
          }
        }}
      />
    </>
  )
}

//
