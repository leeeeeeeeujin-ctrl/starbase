import React, { useState } from 'react'

import BackgroundLayer from './sections/BackgroundLayer'
import LeftColumn from './sections/LeftColumn'
import RightColumn from './sections/RightColumn'
import FooterBar from './sections/FooterBar'
import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider } from './context'

export default function CharacterDashboard({
  dashboard,
  heroName,
  onStartBattle,
  onBack,
  onGoLobby,
}) {
  const [showEditPanel, setShowEditPanel] = useState(false)

  const {
    profile,
    participation,
    battles,
    heroName: dashboardHeroName,
  } = dashboard

  const contextValue = {
    hero: profile.hero,
    heroName: heroName || dashboardHeroName,
    edit: profile.edit,
    onChangeEdit: profile.actions.changeEdit,
    saving: profile.saving,
    onSave: profile.actions.save,
    onDelete: profile.actions.remove,
    backgroundPreview: profile.background.preview,
    backgroundError: profile.background.error,
    onBackgroundUpload: profile.actions.backgroundUpload,
    onClearBackground: profile.actions.backgroundClear,
    backgroundInputRef: profile.background.inputRef,
    bgmLabel: profile.bgm.label,
    bgmDuration: profile.audio.duration,
    onBgmUpload: profile.actions.bgmUpload,
    onClearBgm: profile.actions.bgmClear,
    bgmInputRef: profile.bgm.inputRef,
    bgmError: profile.bgm.error,
    abilityCards: profile.abilityCards,
    onAddAbility: profile.actions.addAbility,
    onReverseAbilities: profile.actions.reverseAbilities,
    onClearAbility: profile.actions.clearAbility,
    audioSource: profile.audio.source,
    statPages: participation.statsView.pages,
    statPageIndex: participation.statsView.pageIndex,
    setStatPageIndex: participation.statsView.setPageIndex,
    hasParticipations: participation.statsView.hasParticipations,
    visibleStatSlides: participation.statsView.visibleSlides,
    selectedGameId: participation.selectedGameId,
    onSelectGame: participation.actions.selectGame,
    selectedEntry: participation.selectedEntry,
    selectedGame: participation.selectedGame,
    selectedScoreboard: participation.scoreboard,
    heroLookup: participation.heroLookup,
    battleSummary: battles.summary,
    battleDetails: battles.details,
    visibleBattles: battles.visibleCount,
    onShowMoreBattles: battles.actions.showMore,
    battleLoading: battles.status.loading,
    battleError: battles.status.error,
    scoreboardRows: participation.scoreboard,
    openEditPanel: () => setShowEditPanel(true),
    closeEditPanel: () => setShowEditPanel(false),
    onStartBattle,
  }

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.root}>
        <BackgroundLayer
          backgroundUrl={
            profile.background.preview || profile.hero?.background_url
          }
        />
        <div style={styles.inner}>
          <div style={styles.grid}>
            <LeftColumn />
            <RightColumn />
          </div>
        </div>
        <FooterBar onBack={onBack} onGoLobby={onGoLobby} />
        <EditHeroModal
          open={showEditPanel}
          onClose={() => setShowEditPanel(false)}
        />
      </div>
    </CharacterDashboardProvider>
  )
}

const styles = {
  root: {
    position: 'relative',
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    fontFamily: '"Noto Sans CJK KR", sans-serif',
  },
  inner: {
    position: 'relative',
    zIndex: 1,
    padding: '32px 24px 120px',
    maxWidth: 1320,
    margin: '0 auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 380px) 1fr',
    gap: 28,
    alignItems: 'start',
  },
}

//
