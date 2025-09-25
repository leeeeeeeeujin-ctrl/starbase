import useHeroBattles from '../useHeroBattles'

export function useCharacterBattleSection({ hero, selectedGameId }) {
  const battles = useHeroBattles({ hero, selectedGameId })

  return {
    status: {
      loading: battles.loading,
      error: battles.error,
    },
    summary: battles.battleSummary,
    details: battles.battleDetails,
    visibleCount: battles.visibleBattles,
    actions: {
      showMore: battles.showMore,
    },
  }
}
