import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { buildPokerogueRoster } from '../../../lib/pokerogue/participantProfile.js';

const HERO_COLUMNS = [
  'id',
  'name',
  'image_url',
  'ingame_image_url',
  'scene_background_description',
  'bgm_url',
  'pokerogue_enabled',
  'pokerogue_front_sprite_url',
  'pokerogue_back_sprite_url',
  'pokerogue_icon_url',
  'pokerogue_region',
  'pokerogue_tier',
  'pokerogue_playable',
  'pokerogue_profile',
  'updated_at',
].join(',');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
  }

  const readyOnly = req.query?.ready === '1' || req.query?.ready === 'true';

  try {
    const query = supabaseAdmin
      .from('heroes')
      .select(HERO_COLUMNS)
      .eq('pokerogue_enabled', true)
      .order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        ok: false,
        error: 'heroes_query_failed',
        detail: error.message || null,
      });
    }

    const roster = buildPokerogueRoster(data, { readyOnly });
    const readyCount = roster.filter(entry => entry.ready).length;

    return res.status(200).json({
      ok: true,
      readyOnly,
      count: roster.length,
      readyCount,
      entries: roster,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: error?.message || String(error),
    });
  }
}
