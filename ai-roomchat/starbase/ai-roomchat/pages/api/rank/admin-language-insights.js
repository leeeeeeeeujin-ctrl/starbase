import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildAdminLanguageInsights } from '@/lib/rank/adminLanguageInsights';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeLimit(raw) {
  const numeric = Number.parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  if (!Number.isFinite(numeric)) return 250;
  return Math.min(Math.max(numeric, 50), 1000);
}

function normalizeUuid(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!UUID_REGEX.test(trimmed)) return null;
  return trimmed;
}

function toObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
}

function collectSeasonIds(candidate) {
  const result = [];
  function push(value) {
    if (value === null || value === undefined) return;
    const stringValue = `${value}`.trim();
    if (stringValue) {
      result.push(stringValue);
    }
  }

  if (!candidate) return result;

  if (Array.isArray(candidate)) {
    candidate.forEach(item => {
      if (item && typeof item === 'object') {
        push(item.id ?? item.seasonId ?? item.season_id);
      } else {
        push(item);
      }
    });
    return result;
  }

  if (typeof candidate === 'object') {
    push(candidate.id ?? candidate.seasonId ?? candidate.season_id);
    if (candidate.season) {
      result.push(...collectSeasonIds(candidate.season));
    }
    if (candidate.meta) {
      result.push(...collectSeasonIds(candidate.meta));
    }
    return result;
  }

  push(candidate);
  return result;
}

function matchesSeasonFilter(row, seasonId) {
  if (!seasonId) return true;
  const meta = toObject(row?.meta);
  const battle = row?.battle && typeof row.battle === 'object' ? row.battle : {};
  const battleMeta = toObject(battle.meta);

  const candidates = [
    meta.seasonId,
    meta.season_id,
    meta.season,
    meta.match,
    meta.session,
    battle.seasonId,
    battle.season_id,
    battle.season,
    battleMeta.seasonId,
    battleMeta.season_id,
    battleMeta.season,
  ].reduce((acc, value) => {
    acc.push(...collectSeasonIds(value));
    return acc;
  }, []);

  return candidates.some(value => value === seasonId);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const limit = normalizeLimit(req.query.limit);
  const gameId = normalizeUuid(req.query.gameId);
  const seasonId = normalizeUuid(req.query.seasonId);

  try {
    let query = supabaseAdmin
      .from('rank_battle_logs')
      .select(
        `
        battle_id,
        game_id,
        prompt,
        ai_response,
        meta,
        created_at,
        battle:rank_battles!inner(result, hidden, created_at, meta)
      `
      )
      .eq('turn_no', 1)
      .eq('battle.hidden', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (gameId) {
      query = query.eq('game_id', gameId);
    }

    const { data, error } = await query;

    if (error) {
      const missingTable =
        error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '');

      if (missingTable) {
        return res.status(200).json({
          baseline: { wins: 0, losses: 0, draws: 0, winRate: null },
          tokens: { total: 0, maxMatches: 1, topByFrequency: [], topPositive: [], topNegative: [] },
          sentences: {
            tiers: { S: [], A: [], B: [], C: [], D: [] },
            topPositive: [],
            topNegative: [],
          },
          sampleSize: 0,
          meta: { missingTable: true, limit, gameId: gameId || null, seasonId: seasonId || null },
        });
      }

      console.error('[admin-language-insights] select failed', error);
      return res.status(500).json({ error: 'language_insights_failed' });
    }

    const rows = Array.isArray(data) ? data.filter(row => matchesSeasonFilter(row, seasonId)) : [];
    const insights = buildAdminLanguageInsights(rows);
    return res.status(200).json({
      ...insights,
      meta: {
        limit,
        gameId: gameId || null,
        seasonId: seasonId || null,
        totalRows: Array.isArray(data) ? data.length : 0,
      },
    });
  } catch (error) {
    console.error('[admin-language-insights] unexpected failure', error);
    return res.status(500).json({ error: 'language_insights_failed' });
  }
}
