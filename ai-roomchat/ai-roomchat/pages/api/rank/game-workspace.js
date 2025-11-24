import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const gameId = typeof req.query.gameId === 'string' ? req.query.gameId.trim() : '';
  if (!gameId) {
    return res.status(400).json({ ok: false, error: 'missing_game_id' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_game_workspaces')
      .select('*')
      .eq('game_id', gameId)
      .limit(1);

    if (error) {
      // Missing table or other DB error – surface as generic failure.
      // This API should be best-effort; 메인게임 동작을 막지는 않는다.
      return res
        .status(500)
        .json({ ok: false, error: 'db_error', detail: error.message });
    }

    const row = Array.isArray(data) && data.length ? data[0] : null;
    return res.status(200).json({ ok: true, workspace: row });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: 'unexpected_error', detail: e?.message || String(e) });
  }
}

