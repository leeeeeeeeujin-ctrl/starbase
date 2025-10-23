import { supabase } from '@/lib/rank/db';
import { withTable } from '@/lib/supabaseTables';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rawGameId = Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId;
  const gameId = rawGameId ? String(rawGameId) : null;

  if (!gameId) {
    res.status(400).json({ error: 'Missing gameId' });
    return;
  }

  const [rolesResult, participantsResult] = await Promise.all([
    withTable(supabase, 'rank_game_roles', table =>
      supabase.from(table).select('*').eq('game_id', gameId)
    ),
    withTable(supabase, 'rank_participants', table =>
      supabase.from(table).select('*').eq('game_id', gameId)
    ),
  ]);

  const rolesError = rolesResult.error;
  const participantsError = participantsResult.error;

  if (rolesError || participantsError) {
    res.status(500).json({
      error: rolesError?.message || participantsError?.message || 'Failed to fetch game detail',
    });
    return;
  }

  let participants = participantsResult.data ?? [];

  const heroIds = Array.from(new Set(participants.map(row => row?.hero_id).filter(Boolean)));

  if (heroIds.length) {
    try {
      const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
      const { data: heroRows, error: heroError } = await withTable(supabaseAdmin, 'heroes', table =>
        supabaseAdmin
          .from(table)
          .select('id,name,image_url,description,owner_id,ability1,ability2,ability3,ability4')
          .in('id', heroIds)
      );

      if (!heroError) {
        const lookup = new Map((heroRows || []).map(hero => [hero.id, hero]));
        participants = participants.map(row => ({
          ...row,
          hero: lookup.get(row.hero_id) || null,
        }));
      }
    } catch (err) {
      console.warn('game-detail fallback hero fetch failed:', err);
    }
  }

  res.status(200).json({
    roles: rolesResult.data ?? [],
    participants,
  });
}

//
