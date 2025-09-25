import { useMemo } from 'react'
import { useRouter } from 'next/router'

import useHeroProfile from './character/useHeroProfile'
import useHeroParticipations from './character/useHeroParticipations'
import useHeroBattles from './character/useHeroBattles'
import { buildAbilityCards } from '../utils/characterStats'

export default function useCharacterDashboard(heroId) {
  const router = useRouter()

  const profile = useHeroProfile({
    heroId,
    onRequireAuth: () => router.replace('/'),
    onMissingHero: () => router.replace('/roster'),
  })

  const participations = useHeroParticipations({ hero: profile.hero })
  const battles = useHeroBattles({ hero: profile.hero, selectedGameId: participations.selectedGameId })

  const abilityCards = useMemo(() => buildAbilityCards(profile.edit), [profile.edit])

  const overallLoading = profile.loading || (profile.hero ? participations.loading : false)

  return {
    loading: overallLoading,
    hero: profile.hero,
    edit: profile.edit,
    saving: profile.saving,
    participations: participations.participations,
    selectedEntry: participations.selectedEntry,
    selectedGame: participations.selectedGame,
    selectedGameId: participations.selectedGameId,
    selectedScoreboard: participations.selectedScoreboard,
    statSlides: participations.statSlides,
    heroLookup: participations.heroLookup,
    battleSummary: battles.battleSummary,
    battleDetails: battles.battleDetails,
    visibleBattles: battles.visibleBattles,
    battleLoading: battles.loading,
    battleError: battles.error,
    backgroundPreview: profile.backgroundPreview,
    backgroundInputRef: profile.backgroundInputRef,
    backgroundError: profile.backgroundError,
    bgmBlob: profile.bgmBlob,
    bgmLabel: profile.bgmLabel,
    bgmDuration: profile.bgmDuration,
    bgmError: profile.bgmError,
    bgmInputRef: profile.bgmInputRef,
    abilityCards,
    onChangeEdit: profile.onChangeEdit,
    onSelectGame: participations.setSelectedGameId,
    onShowMoreBattles: battles.showMore,
    onAddAbility: profile.onAddAbility,
    onReverseAbilities: profile.onReverseAbilities,
    onClearAbility: profile.onClearAbility,
    onBackgroundUpload: profile.onBackgroundUpload,
    onClearBackground: profile.onClearBackground,
    onBgmUpload: profile.onBgmUpload,
    onClearBgm: profile.onClearBgm,
    onSave: profile.onSave,
    onDelete: profile.onDelete,
  }
}

//
