import React, { useCallback, useMemo, useState } from 'react'

import DashboardShell from './layout/DashboardShell'
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

  const { profile, participation, battles, heroName: dashboardHeroName } = dashboard

  const handleOpenEdit = useCallback(() => setShowEditPanel(true), [])
  const handleCloseEdit = useCallback(() => setShowEditPanel(false), [])

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
    openEditPanel: handleOpenEdit,
    closeEditPanel: handleCloseEdit,
    onStartBattle,
  }

  const sections = useMemo(
    () => [
      {
        id: 'overview',
        label: '개요',
        description: '프로필과 소개 요약',
        component: OverviewPanel,
      },
      {
        id: 'stats',
        label: '통계',
        description: '랭크 참가 현황과 지표',
        component: StatsPanel,
      },
      {
        id: 'instant',
        label: '즉시 전투',
        description: '선택한 게임으로 바로 전투',
        component: InstantBattlePanel,
      },
      {
        id: 'ranking',
        label: '랭킹',
        description: '상세 랭킹과 점수판',
        component: RankingPanel,
      },
      {
        id: 'battle-log',
        label: '전투 기록',
        description: '최근 전투와 로그',
        component: BattleLogPanel,
      },
    ],
    [],
  )

  const active = sections.find((section) => section.id === activeSection) || sections[0]
  const ActiveComponent = active.component

  const heroSubtitle = participation.selectedGame?.name
    ? `현재 선택한 게임 · ${participation.selectedGame.name}`
    : '영웅 정보를 편집하여 자신만의 전장을 준비하세요.'

  const heroMeta = useMemo(() => {
    const items = []
    const statSlides = participation.statSlides || []
    if (statSlides.length) {
      items.push({ id: 'games', label: '참여 게임', value: `${statSlides.length}개` })
    }

    const selectedEntry = participation.selectedEntry
    const ratingValue =
      selectedEntry?.rating ??
      (typeof selectedEntry?.score === 'number' ? selectedEntry.score : selectedEntry?.score || null)
    if (ratingValue != null && ratingValue !== '') {
      const value =
        typeof ratingValue === 'number' ? ratingValue.toLocaleString() : String(ratingValue)
      items.push({ id: 'rating', label: '현재 점수', value })
    }

    const summary = battles.summary || {}
    const battleCount = summary.total ?? selectedEntry?.battles
    if (battleCount != null) {
      const numeric = Number(battleCount)
      const value = Number.isFinite(numeric) ? numeric.toLocaleString() : String(battleCount)
      items.push({ id: 'battles', label: '전투 수', value: `${value}회` })
    }

    let winRate = summary.rate
    if (winRate == null && typeof selectedEntry?.win_rate === 'number') {
      winRate = selectedEntry.win_rate > 1 ? selectedEntry.win_rate : selectedEntry.win_rate * 100
    }
    if (typeof winRate === 'number' && Number.isFinite(winRate)) {
      const safeRate = Math.max(0, Math.min(100, Math.round(winRate)))
      items.push({ id: 'winRate', label: '승률', value: `${safeRate}%` })
    }

    return items
  }, [participation.statSlides, participation.selectedEntry, battles.summary])

  const quickActions = useMemo(
    () => [
      {
        id: 'start-battle',
        label: '선택한 게임으로 전투 시작',
        description: '대시보드에서 선택한 게임과 규칙으로 세션을 생성합니다.',
        onSelect: onStartBattle,
        tone: 'primary',
        disabled: !participation.selectedGameId,
      },
      {
        id: 'edit-hero',
        label: '영웅 프로필 편집',
        description: '이미지, 배경, 능력치를 수정하고 저장합니다.',
        onSelect: handleOpenEdit,
        tone: 'muted',
      },
    ],
    [onStartBattle, participation.selectedGameId, handleOpenEdit],
  )

  const handleSelectSection = useCallback((sectionId) => {
    setActiveSection(sectionId)
  }, [])

  return (
    <CharacterDashboardProvider value={contextValue}>
      <DashboardShell
        backgroundUrl={profile.background.preview || profile.hero?.background_url}
        heroName={contextValue.heroName}
        heroSubtitle={heroSubtitle}
        heroMeta={heroMeta}
        sections={sections}
        activeSectionId={active.id}
        onSelectSection={handleSelectSection}
        quickActions={quickActions}
      >
        <ActiveComponent />
      </DashboardShell>
      <FooterBar onBack={onBack} onGoLobby={onGoLobby} />
      <EditHeroModal open={showEditPanel} onClose={handleCloseEdit} />
    </CharacterDashboardProvider>
  )
}
