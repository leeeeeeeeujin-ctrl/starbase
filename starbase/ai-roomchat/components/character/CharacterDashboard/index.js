import React, { useMemo, useState } from 'react'

import BackgroundLayer from './sections/BackgroundLayer'
import FooterBar from './sections/FooterBar'
import EditHeroModal from './sections/EditHeroModal'
import { CharacterDashboardProvider } from './context'
import OverviewPanel from './sections/panels/OverviewPanel'
import StatsPanel from './sections/panels/StatsPanel'
import InstantBattlePanel from './sections/panels/InstantBattlePanel'
import RankingPanel from './sections/panels/RankingPanel'
import BattleLogPanel from './sections/panels/BattleLogPanel'

export default function CharacterDashboard({
  dashboard,
  heroName,
  onStartBattle,
  onBack,
  onGoLobby,
}) {
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')

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

  const sections = useMemo(
    () => [
      { id: 'overview', label: '개요', component: OverviewPanel },
      { id: 'stats', label: '통계', component: StatsPanel },
      { id: 'instant', label: '즉시 전투', component: InstantBattlePanel },
      { id: 'ranking', label: '랭킹', component: RankingPanel },
      { id: 'battle-log', label: '전투 기록', component: BattleLogPanel },
    ],
    [],
  )

  const active =
    sections.find((section) => section.id === activeSection) || sections[0]

  const ActiveComponent = active.component

  return (
    <CharacterDashboardProvider value={contextValue}>
      <div style={styles.root}>
        <BackgroundLayer
          backgroundUrl={
            profile.background.preview || profile.hero?.background_url
          }
        />
        <div style={styles.inner}>
          <header style={styles.header}>
            <div>
              <span style={styles.headerLabel}>선택한 영웅</span>
              <h1 style={styles.heroTitle}>{contextValue.heroName}</h1>
            </div>
            <div style={styles.tabBar}>
              {sections.map((section) => {
                const activeMatch = section.id === active.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    style={{
                      ...styles.tabButton,
                      background: activeMatch
                        ? 'linear-gradient(90deg, rgba(56,189,248,0.45), rgba(59,130,246,0.65))'
                        : 'rgba(15, 23, 42, 0.55)',
                      border: activeMatch
                        ? '1px solid rgba(59, 130, 246, 0.8)'
                        : '1px solid rgba(148, 163, 184, 0.35)',
                      color: activeMatch ? '#e0f2fe' : '#cbd5f5',
                    }}
                  >
                    {section.label}
                  </button>
                )
              })}
            </div>
          </header>
          <div style={styles.panelArea}>
            <ActiveComponent />
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
    maxWidth: 960,
    margin: '0 auto',
  },
  header: {
    display: 'grid',
    gap: 16,
    marginBottom: 28,
  },
  headerLabel: {
    fontSize: 13,
    color: '#94a3b8',
    letterSpacing: 0.6,
  },
  heroTitle: {
    margin: 0,
    fontSize: 36,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  tabBar: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  tabButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.55)',
    color: '#cbd5f5',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease, border 0.2s ease, color 0.2s ease',
  },
  panelArea: {
    display: 'grid',
    gap: 24,
  },
}
