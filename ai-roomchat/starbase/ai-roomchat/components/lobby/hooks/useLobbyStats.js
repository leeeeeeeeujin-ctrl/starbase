import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { withTable } from '../../../lib/supabaseTables';

export default function useLobbyStats({ heroId, enabled } = {}) {
  const [viewerId, setViewerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [games, setGames] = useState([]);
  const [seasonMap, setSeasonMap] = useState({});
  const [battleMap, setBattleMap] = useState({});
  const [summary, setSummary] = useState({
    overallWinRate: null,
    averageRating: null,
    favouriteTags: [],
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function loadViewer() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!error && data?.user) {
        setViewerId(data.user.id);
      } else {
        setViewerId(null);
      }
    }
    loadViewer();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!viewerId) return;
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError(null);

      const participantsResult = await withTable(supabase, 'rank_participants', table => {
        let query = supabase.from(table).select('*').eq('owner_id', viewerId);
        if (heroId) {
          query = query.or(`hero_id.eq.${heroId},hero_ids.cs.{${heroId}}`);
        }
        return query;
      });

      if (cancelled) return;

      if (participantsResult.error) {
        console.error(participantsResult.error);
        setError('참여 정보를 불러오지 못했습니다.');
        setGames([]);
        setSeasonMap({});
        setBattleMap({});
        setSummary({ overallWinRate: null, averageRating: null, favouriteTags: [] });
        setLoading(false);
        return;
      }

      const participantRows = participantsResult.data || [];
      if (!participantRows.length) {
        setGames([]);
        setSeasonMap({});
        setBattleMap({});
        setSummary({ overallWinRate: null, averageRating: null, favouriteTags: [] });
        setLoading(false);
        return;
      }

      const gameIds = Array.from(new Set(participantRows.map(row => row.game_id).filter(Boolean)));

      const [gamesResult, seasonsResult, battlesResult, tagResult] = await Promise.all([
        withTable(supabase, 'rank_games', table =>
          supabase.from(table).select('id, name, description, image_url').in('id', gameIds)
        ),
        withTable(supabase, 'rank_game_seasons', table =>
          supabase
            .from(table)
            .select('*')
            .in('game_id', gameIds)
            .order('started_at', { ascending: false })
        ),
        withTable(supabase, 'rank_battles', table =>
          supabase
            .from(table)
            .select('*')
            .in('game_id', gameIds)
            .order('created_at', { ascending: false })
            .limit(160)
        ),
        withTable(supabase, 'rank_game_tags', table =>
          supabase.from(table).select('game_id, tag').in('game_id', gameIds)
        ),
      ]);

      if (cancelled) return;

      if (gamesResult.error) {
        console.error(gamesResult.error);
      }
      if (seasonsResult.error) {
        console.error(seasonsResult.error);
      }
      if (battlesResult.error) {
        console.error(battlesResult.error);
      }
      if (tagResult.error) {
        console.error(tagResult.error);
      }

      const gameMap = new Map((gamesResult.data || []).map(game => [game.id, game]));

      const heroIdSet = new Set();
      let totalBattles = 0;
      let weightedWins = 0;
      let ratingSum = 0;
      let ratingCount = 0;

      const participationView = participantRows.map(row => {
        const game = gameMap.get(row.game_id);
        const heroMatches = [row.hero_id, ...(row.hero_ids || [])].filter(Boolean);
        heroMatches.forEach(value => {
          if (value) heroIdSet.add(value);
        });
        const battles = row.battles ?? 0;
        const winRate = row.win_rate ?? null;
        const rating = row.rating ?? null;
        totalBattles += battles;
        if (winRate !== null && winRate !== undefined) {
          weightedWins += battles * winRate;
        }
        if (Number.isFinite(rating)) {
          ratingSum += rating;
          ratingCount += 1;
        }
        return {
          id: row.id,
          gameId: row.game_id,
          gameName: game?.name || '알 수 없는 게임',
          rating,
          battles,
          winRate,
          role: row.role || null,
          status: row.status || null,
          joinedAt: row.created_at,
          heroIds: heroMatches,
        };
      });

      const seasonRows = (seasonsResult.data || []).map(row => ({
        id: row.id,
        gameId: row.game_id,
        name: row.name,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        leaderboard: row.leaderboard || [],
      }));

      const relevantBattles = (battlesResult.data || []).filter(battle => {
        if (!battle) return false;
        if (battle.attacker_owner_id === viewerId) return true;
        if (battle.defender_owner_id === viewerId) return true;
        return false;
      });

      const heroLookupIds = new Set();
      for (const battle of relevantBattles) {
        if (battle.attacker_hero_id) heroLookupIds.add(battle.attacker_hero_id);
        if (battle.defender_hero_id) heroLookupIds.add(battle.defender_hero_id);
      }

      let heroLookup = new Map();
      if (heroLookupIds.size) {
        const heroResult = await withTable(supabase, 'heroes', table =>
          supabase.from(table).select('id, name').in('id', Array.from(heroLookupIds))
        );
        if (!cancelled) {
          if (heroResult.error) {
            console.error(heroResult.error);
          }
          heroLookup = new Map((heroResult.data || []).map(row => [row.id, row]));
        }
      }

      const battlesByGame = {};
      for (const battle of relevantBattles) {
        const viewerIsAttacker = battle.attacker_owner_id === viewerId;
        const opponentHeroId = viewerIsAttacker ? battle.defender_hero_id : battle.attacker_hero_id;
        const opponent = opponentHeroId ? heroLookup.get(opponentHeroId) : null;
        const normalized = `${battle.result || ''}`.toLowerCase();
        let outcome = '알 수 없음';
        if (normalized.includes('draw') || normalized.includes('tie')) {
          outcome = '무승부';
        } else if (normalized.includes('attacker')) {
          const attackerWon = normalized.includes('win');
          outcome = attackerWon === viewerIsAttacker ? '승리' : '패배';
        } else if (normalized.includes('defender')) {
          const defenderWon = normalized.includes('win');
          outcome = defenderWon
            ? viewerIsAttacker
              ? '패배'
              : '승리'
            : viewerIsAttacker
              ? '승리'
              : '패배';
        } else if (normalized.includes('win')) {
          outcome = viewerIsAttacker ? '승리' : '패배';
        } else if (normalized.includes('loss') || normalized.includes('lose')) {
          outcome = viewerIsAttacker ? '패배' : '승리';
        }

        let scoreDelta = null;
        if (Number.isFinite(battle.score_delta)) {
          scoreDelta = viewerIsAttacker ? battle.score_delta : -battle.score_delta;
        }

        if (!battlesByGame[battle.game_id]) {
          battlesByGame[battle.game_id] = [];
        }
        battlesByGame[battle.game_id].push({
          id: battle.id,
          createdAt: battle.created_at,
          gameId: battle.game_id,
          opponentHeroId,
          opponentName: opponent?.name || '알 수 없는 영웅',
          outcome,
          scoreDelta,
        });
      }

      Object.values(battlesByGame).forEach(list =>
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );

      const seasonsByGame = {};
      for (const season of seasonRows) {
        const leaderboard = Array.isArray(season.leaderboard) ? season.leaderboard : [];
        const viewerEntry = leaderboard.find(entry => {
          const heroMatch = entry?.hero_id || entry?.heroId;
          if (heroMatch && heroIdSet.has(heroMatch)) return true;
          const ownerMatch = entry?.owner_id || entry?.ownerId;
          return ownerMatch && ownerMatch === viewerId;
        });
        const metrics = viewerEntry || {};
        const wins = metrics.wins ?? metrics.win_count ?? null;
        const losses = metrics.losses ?? metrics.loss_count ?? null;
        const matches =
          metrics.battles ??
          metrics.match_count ??
          (Number.isFinite(wins) && Number.isFinite(losses) ? wins + losses : null);
        let winRate = metrics.win_rate ?? null;
        if (winRate === null && Number.isFinite(wins) && Number.isFinite(matches) && matches > 0) {
          winRate = wins / matches;
        }
        const payload = {
          id: season.id,
          name: season.name,
          status: season.status,
          startedAt: season.startedAt,
          endedAt: season.endedAt,
          rating: metrics.rating ?? metrics.score ?? null,
          matches,
          wins,
          losses,
          winRate,
          rank: metrics.rank ?? null,
          bestRank: metrics.best_rank ?? metrics.bestRank ?? null,
        };
        if (!seasonsByGame[season.gameId]) {
          seasonsByGame[season.gameId] = [];
        }
        seasonsByGame[season.gameId].push(payload);
      }

      Object.values(seasonsByGame).forEach(list =>
        list.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0))
      );

      const tagCounts = new Map();
      for (const row of tagResult.data || []) {
        if (!row?.tag) continue;
        tagCounts.set(row.tag, (tagCounts.get(row.tag) || 0) + 1);
      }

      const favouriteTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'))
        .slice(0, 8);

      const averageRating = ratingCount > 0 ? ratingSum / ratingCount : null;
      const overallWinRate = totalBattles > 0 ? weightedWins / totalBattles : null;

      setGames(participationView);
      setSeasonMap(seasonsByGame);
      setBattleMap(battlesByGame);
      setSummary({ overallWinRate, averageRating, favouriteTags });
      setLoading(false);
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [enabled, viewerId, heroId, refreshKey]);

  const leaveGame = useCallback(
    async participantId => {
      if (!participantId) {
        return { ok: false, error: '참여 정보를 찾을 수 없습니다.' };
      }
      const { error } = await withTable(supabase, 'rank_participants', table =>
        supabase.from(table).delete().eq('id', participantId)
      );
      if (error) {
        console.error(error);
        return { ok: false, error: error.message || '참여를 해제할 수 없습니다.' };
      }
      refresh();
      return { ok: true };
    },
    [refresh]
  );

  return {
    loading,
    error,
    games,
    seasons: seasonMap,
    battles: battleMap,
    summary,
    leaveGame,
    refresh,
  };
}
