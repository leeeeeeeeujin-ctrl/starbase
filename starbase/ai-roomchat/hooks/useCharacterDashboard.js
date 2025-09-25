import { useRouter } from 'next/router'

import { useCharacterProfileSection } from './character/dashboard/useCharacterProfileSection'
import { useCharacterParticipationSection } from './character/dashboard/useCharacterParticipationSection'
import { useCharacterBattleSection } from './character/dashboard/useCharacterBattleSection'

export default function useCharacterDashboard(heroId) {
  const router = useRouter()
  const profile = useCharacterProfileSection({
    heroId,
    onRequireAuth: () => router.replace('/'),
    onMissingHero: () => router.replace('/roster'),
  })

  const participation = useCharacterParticipationSection({ hero: profile.hero })
  const battles = useCharacterBattleSection({
    hero: profile.hero,
    selectedGameId: participation.selectedGameId,
  })

  const overallLoading =
    profile.status.loading || (profile.hero ? participation.status.loading : false)

  return {
    status: {
      loading: overallLoading,
    },
    heroName: profile.heroName,
    profile,
    participation,
    battles,
    // Backwards-compatible surface for existing consumers
    loading: overallLoading,
    hero: profile.hero,
    edit: profile.edit,
    saving: profile.saving,
    backgroundPreview: profile.background.preview,
    backgroundInputRef: profile.background.inputRef,
    backgroundError: profile.background.error,
    bgmBlob: profile.bgm.blob,
    bgmLabel: profile.bgm.label,
    bgmDuration: profile.audio.duration,
    bgmError: profile.bgm.error,
    bgmInputRef: profile.bgm.inputRef,
    abilityCards: profile.abilityCards,
    onChangeEdit: profile.actions.changeEdit,
    onAddAbility: profile.actions.addAbility,
    onReverseAbilities: profile.actions.reverseAbilities,
    onClearAbility: profile.actions.clearAbility,
    onBackgroundUpload: profile.actions.backgroundUpload,
    onClearBackground: profile.actions.backgroundClear,
    onBgmUpload: profile.actions.bgmUpload,
    onClearBgm: profile.actions.bgmClear,
    onSave: profile.actions.save,
    onDelete: profile.actions.remove,
    statSlides: participation.statSlides,
    selectedEntry: participation.selectedEntry,
    selectedGame: participation.selectedGame,
    selectedGameId: participation.selectedGameId,
    selectedScoreboard: participation.scoreboard,
    heroLookup: participation.heroLookup,
    statPages: participation.statsView.pages,
    statPageIndex: participation.statsView.pageIndex,
    setStatPageIndex: participation.statsView.setPageIndex,
    visibleStatSlides: participation.statsView.visibleSlides,
    hasParticipations: participation.statsView.hasParticipations,
    onSelectGame: participation.actions.selectGame,
    onShowMoreBattles: battles.actions.showMore,
    battleSummary: battles.summary,
    battleDetails: battles.details,
    visibleBattles: battles.visibleCount,
    battleLoading: battles.status.loading,
    battleError: battles.status.error,
    audioSource: profile.audio.source,
    scoreboardRows: participation.scoreboard,
  }
}

//
