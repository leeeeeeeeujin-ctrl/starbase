import { supabaseAdmin } from '@/lib/supabaseAdmin';

function mapGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '이름 없음',
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function mapSeason(row) {
  if (!row) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name || '시즌',
    status: row.status || null,
    startedAt: row.started_at || row.startedAt || null,
    endedAt: row.ended_at || row.endedAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const [gamesResult, seasonsResult] = await Promise.all([
      supabaseAdmin
        .from('rank_games')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('rank_game_seasons')
        .select('id, game_id, name, status, started_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(400),
    ]);

    if (gamesResult.error) {
      console.error('[admin-language-insights-options] games query failed', gamesResult.error);
      return res.status(500).json({ error: 'language_filters_failed' });
    }

    if (seasonsResult.error) {
      console.error('[admin-language-insights-options] seasons query failed', seasonsResult.error);
      return res.status(500).json({ error: 'language_filters_failed' });
    }

    const games = (gamesResult.data || []).map(mapGame).filter(Boolean);
    const seasons = (seasonsResult.data || []).map(mapSeason).filter(Boolean);

    return res.status(200).json({ games, seasons });
  } catch (error) {
    console.error('[admin-language-insights-options] unexpected failure', error);
    return res.status(500).json({ error: 'language_filters_failed' });
  }
}
