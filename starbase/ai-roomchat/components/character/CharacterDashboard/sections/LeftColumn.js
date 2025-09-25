import React from 'react'

import { useCharacterDashboardContext } from '../context'
import HeroProfileCard from './left/HeroProfileCard'
import StatPageSelector from './left/StatPageSelector'
import GameStatCarousel from './left/GameStatCarousel'

const columnStyle = { display: 'grid', gap: 24 }

export default function LeftColumn() {
  const {
    hero,
    heroName,
    saving,
    onSave,
    onDelete,
    audioSource,
    bgmDuration,
    statPages,
    statPageIndex,
    setStatPageIndex,
    hasParticipations,
    visibleStatSlides,
    selectedGameId,
    onSelectGame,
    selectedEntry,
    openEditPanel,
  } = useCharacterDashboardContext()

  return (
    <aside style={columnStyle}>
      <HeroProfileCard
        hero={hero}
        heroName={heroName}
        onOpenEdit={openEditPanel}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
        audioSource={audioSource}
        bgmDuration={bgmDuration}
      />
      <StatPageSelector
        statPages={statPages}
        statPageIndex={statPageIndex}
        onChangeStatPage={setStatPageIndex}
      />
      <GameStatCarousel
        hasParticipations={hasParticipations}
        visibleStatSlides={visibleStatSlides}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
        selectedEntry={selectedEntry}
      />
    </aside>
  )
}
