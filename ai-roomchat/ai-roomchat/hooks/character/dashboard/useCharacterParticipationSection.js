import { useEffect, useMemo, useState } from 'react';

import useHeroParticipations from '../useHeroParticipations';

export function useCharacterParticipationSection({ hero }) {
  const participations = useHeroParticipations({ hero });
  const { statSlides, selectedGameId, setSelectedGameId } = participations;

  const statPages = useMemo(() => {
    if (!statSlides?.length) return [];
    const pages = [];
    for (let index = 0; index < statSlides.length; index += 6) {
      pages.push(statSlides.slice(index, index + 6));
    }
    return pages;
  }, [statSlides]);

  const [statPageIndex, setStatPageIndex] = useState(0);

  useEffect(() => {
    if (!statPages.length) {
      if (statPageIndex !== 0) setStatPageIndex(0);
      return;
    }
    if (statPageIndex >= statPages.length) {
      setStatPageIndex(statPages.length - 1);
    }
  }, [statPageIndex, statPages]);

  useEffect(() => {
    if (!statSlides?.length) return;
    if (!selectedGameId) {
      setSelectedGameId(statSlides[0].key);
      return;
    }
    const targetIndex = statPages.findIndex(page =>
      page.some(slide => slide.key === selectedGameId)
    );
    if (targetIndex >= 0 && targetIndex !== statPageIndex) {
      setStatPageIndex(targetIndex);
    }
  }, [statSlides, statPages, selectedGameId, statPageIndex, setSelectedGameId]);

  const visibleSlides = statPages.length
    ? statPages[Math.min(statPageIndex, statPages.length - 1)]
    : statSlides;

  return {
    status: {
      loading: participations.loading,
    },
    participations: participations.participations,
    selectedEntry: participations.selectedEntry,
    selectedGame: participations.selectedGame,
    selectedGameId: participations.selectedGameId,
    scoreboard: participations.selectedScoreboard || [],
    statSlides: participations.statSlides || [],
    heroLookup: participations.heroLookup || {},
    statsView: {
      pages: statPages,
      pageIndex: statPageIndex,
      visibleSlides: visibleSlides || [],
      hasParticipations: Boolean(statSlides?.length),
      setPageIndex: setStatPageIndex,
    },
    actions: {
      selectGame: setSelectedGameId,
      refresh: participations.refresh,
    },
  };
}
