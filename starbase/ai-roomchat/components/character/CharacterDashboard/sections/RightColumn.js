import React from 'react'

import { useCharacterDashboardContext } from '../context'
import InstantBattleSection from './right/InstantBattleSection'
import RankingSection from './right/RankingSection'
import BattleLogSection from './right/BattleLogSection'

const columnStyle = { display: 'grid', gap: 24 }

export default function RightColumn() {
  const {
    selectedGameId,
    selectedEntry,
    battleSummary,
    onStartBattle,
    scoreboardRows,
    hero,
    heroLookup,
    battleDetails,
    visibleBattles,
    onShowMoreBattles,
    battleLoading,
    battleError,
  } = useCharacterDashboardContext()

  return (
    <main style={columnStyle}>
      <InstantBattleSection
        selectedGameId={selectedGameId}
        selectedEntry={selectedEntry}
        battleSummary={battleSummary}
        onStartBattle={onStartBattle}
      />
      <RankingSection
        scoreboardRows={scoreboardRows}
        heroId={hero?.id}
        heroLookup={heroLookup}
        selectedEntry={selectedEntry}
      />
      <BattleLogSection
        battleDetails={battleDetails}
        visibleBattles={visibleBattles}
        onShowMoreBattles={onShowMoreBattles}
        battleLoading={battleLoading}
        battleError={battleError}
      />
    </main>
  )
}
