import React from 'react'

import { useCharacterDashboardContext } from '../../context'
import RankingSection from '../right/RankingSection'

export default function RankingPanel() {
  const { scoreboardRows, hero, heroLookup, selectedEntry } =
    useCharacterDashboardContext()

  return (
    <RankingSection
      scoreboardRows={scoreboardRows}
      heroId={hero?.id}
      heroLookup={heroLookup}
      selectedEntry={selectedEntry}
    />
  )
}
