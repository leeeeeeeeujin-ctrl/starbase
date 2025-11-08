// Delete a rank game (DB rows) and its storage assets under games/{gameId}/**
// Body: { gameId: string }
// Auth: Bearer token required. TODO: enforce ownership/role-based authorization.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const auth = req.headers.authorization || '';
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { gameId } = req.body || {};
    const raw = String(gameId || '').trim();
    if (!raw) return res.status(400).json({ error: 'gameId required' });
    const safeGameId = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeGameId) return res.status(400).json({ error: 'invalid gameId' });

    // Delete DB records
    let dbDeleted = false;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (!supabaseUrl || !supabaseKey) throw new Error('supabase not configured');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Best-effort explicit child deletion first (in case FK cascade isn’t present)
      try { await supabase.from('rank_game_slots').delete().eq('game_id', safeGameId); } catch {}
      try { await supabase.from('rank_game_roles').delete().eq('game_id', safeGameId); } catch {}
      const { error: delErr } = await supabase.from('rank_games').delete().eq('id', safeGameId);
      if (delErr) return res.status(400).json({ error: delErr.message || 'game_delete_failed' });
      dbDeleted = true;
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'db_delete_failed' });
    }

    // Cleanup storage via internal handler reuse
    let storageDeleted = 0;
    try {
      const deleteGameAssets = (await import('./delete-game-assets.js')).default;
      const { req: mReq, res: mRes } = mockReqRes({ method: 'POST', headers: { authorization: auth }, body: { gameId: safeGameId, totalLimit: 50000 } });
      await deleteGameAssets(mReq, mRes);
      if (mRes._status >= 400) {
        // Return OK but include warning
        return res.status(200).json({ ok: true, gameId: safeGameId, storage: { ok: false, error: mRes._json?.error || 'cleanup_failed' } });
      }
      storageDeleted = mRes._json?.deleted || 0;
    } catch {
      // Ignore storage cleanup failures, but report
      return res.status(200).json({ ok: true, gameId: safeGameId, storage: { ok: false } });
    }

    return res.status(200).json({ ok: true, gameId: safeGameId, storage: { ok: true, deleted: storageDeleted } });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ error: e?.message || 'delete_game_failed' });
  }
}

function mockReqRes({ method = 'POST', body = {}, headers = {} } = {}) {
  const req = { method, body, headers };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status(code){ statusCode = code; return this; },
    json(obj){ jsonBody = obj; return this; },
    get _status(){ return statusCode; },
    get _json(){ return jsonBody; },
  };
  return { req, res };
}
