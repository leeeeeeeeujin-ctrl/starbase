import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchHeroParticipationBundle } from '../../modules/character/participation';
import { buildStatSlides } from '../../utils/characterStats';
import { formatKoreanDate } from '../../utils/dateFormatting';

const INITIAL_STATE = {
  loading: false,
  error: null,
  participations: [],
  scoreboardMap: {},
  heroLookup: {},
  selectedGameId: null,
};

export default function useHeroParticipations({ hero }) {
  const [state, setState] = useState(INITIAL_STATE);
  const requestRef = useRef(0);

  const heroId = hero?.id || null;

  const heroSeed = useMemo(() => {
    if (!heroId) return null;
    return {
      id: heroId,
      name: hero?.name ?? null,
      image_url: hero?.image_url ?? null,
      ability1: hero?.ability1 ?? null,
      ability2: hero?.ability2 ?? null,
      ability3: hero?.ability3 ?? null,
      ability4: hero?.ability4 ?? null,
      owner_id: hero?.owner_id ?? null,
    };
  }, [
    hero?.ability1,
    hero?.ability2,
    hero?.ability3,
    hero?.ability4,
    hero?.image_url,
    hero?.name,
    hero?.owner_id,
    heroId,
  ]);

  const resetState = useCallback(() => {
    setState({
      ...INITIAL_STATE,
      heroLookup: heroSeed?.id ? { [heroSeed.id]: heroSeed } : {},
    });
  }, [heroSeed]);

  const loadParticipations = useCallback(
    async ({ silent } = {}) => {
      const requestId = ++requestRef.current;

      if (!heroId) {
        resetState();
        return;
      }

      if (!silent) {
        setState(prev => ({
          ...prev,
          loading: true,
          error: null,
        }));
      }

      try {
        const bundle = await fetchHeroParticipationBundle(heroId, { heroSeed });

        const participations = bundle.participations.map(row => ({
          ...row,
          latestSessionAt: row.latestSessionAt ? formatKoreanDate(row.latestSessionAt) : null,
          firstSessionAt: row.firstSessionAt ? formatKoreanDate(row.firstSessionAt) : null,
        }));

        const scoreboardMap = bundle.scoreboardMap || {};
        const heroLookup = bundle.heroLookup || {};

        if (requestId !== requestRef.current) {
          return;
        }

        setState(prev => {
          const previousSelection = prev.selectedGameId;
          const nextSelection =
            previousSelection && participations.some(row => row.game_id === previousSelection)
              ? previousSelection
              : participations[0]?.game_id || null;

          return {
            loading: false,
            error: null,
            participations,
            scoreboardMap,
            heroLookup,
            selectedGameId: nextSelection,
          };
        });
      } catch (error) {
        console.error('Failed to load hero participations:', error);
        if (requestId !== requestRef.current) {
          return;
        }
        setState(prev => ({
          ...prev,
          loading: false,
          error: error?.message || '참가 기록을 불러오지 못했습니다.',
        }));
      }
    },
    [heroId, heroSeed, resetState]
  );

  useEffect(() => {
    loadParticipations({ silent: false });
    return () => {
      requestRef.current += 1;
    };
  }, [loadParticipations]);

  const refresh = useCallback(() => {
    loadParticipations({ silent: false });
  }, [loadParticipations]);

  const setSelectedGameId = useCallback(gameId => {
    setState(prev => ({
      ...prev,
      selectedGameId: gameId,
    }));
  }, []);

  const selectedEntry = useMemo(
    () => state.participations.find(row => row.game_id === state.selectedGameId) || null,
    [state.participations, state.selectedGameId]
  );

  const selectedScoreboard = useMemo(() => {
    if (!state.selectedGameId) return [];
    const rows = state.scoreboardMap[state.selectedGameId] || [];
    return [...rows].sort((a, b) => {
      const left = a.slot_no ?? Number.MAX_SAFE_INTEGER;
      const right = b.slot_no ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  }, [state.scoreboardMap, state.selectedGameId]);

  const selectedGame = useMemo(() => {
    if (!state.selectedGameId) return null;
    return state.participations.find(row => row.game_id === state.selectedGameId)?.game || null;
  }, [state.participations, state.selectedGameId]);

  const statSlides = useMemo(
    () => buildStatSlides(state.participations, state.scoreboardMap, heroId),
    [state.participations, state.scoreboardMap, heroId]
  );

  return {
    loading: state.loading,
    error: state.error,
    participations: state.participations,
    selectedEntry,
    selectedGame,
    selectedGameId: state.selectedGameId,
    selectedScoreboard,
    statSlides,
    heroLookup: state.heroLookup,
    setSelectedGameId,
    refresh,
  };
}
