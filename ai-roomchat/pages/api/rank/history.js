import { loadBattleHistoryBySession, loadBattleHistoryByGame } from '../../lib/rank/battleHistoryStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Simple auth gate (placeholder): require x-api-key header for now.
  const apiKey = process.env.RANK_API_KEY || null;
  const strictUser = process.env.RANK_STRICT_USER === '1';
  const requesterUserId = req.headers['x-user-id'] || null;
  if (apiKey) {
    const provided = req.headers['x-api-key'];
    if (!provided || provided !== apiKey) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const sessionId = req.query.sessionId || req.query.session_id;
  const gameId = req.query.gameId || req.query.game_id;
  const limit = req.query.limit || req.query.take;
  const offset = req.query.offset || req.query.skip;
  if ((!sessionId && !gameId) || (sessionId && typeof sessionId !== 'string') || (gameId && typeof gameId !== 'string')) {
    return res.status(400).json({ ok: false, error: 'missing_ids' });
  }

  if (sessionId) {
    const data = await loadBattleHistoryBySession(sessionId);
    if (!data) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (strictUser && !apiKey) {
      const owner = data?.meta?.userId || data?.meta?.user_id || null;
      if (!owner || !requesterUserId || String(owner) !== String(requesterUserId)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
    }
    return res.status(200).json({ ok: true, ...data });
  }

  // gameId lookup returns list (latest first)
  const list = await loadBattleHistoryByGame(gameId, limit ? Number(limit) : 10, offset ? Number(offset) : 0);
  if (!list || !list.length) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  if (strictUser && !apiKey) {
    const filtered = list.filter((item) => {
      const owner = item?.meta?.userId || item?.meta?.user_id || null;
      return owner && requesterUserId && String(owner) === String(requesterUserId);
    });
    if (!filtered.length) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    return res.status(200).json({
      ok: true,
      items: filtered,
      nextOffset: (offset ? Number(offset) : 0) + (limit ? Number(limit) : 10),
    });
  }
  return res.status(200).json({ ok: true, items: list, nextOffset: (offset ? Number(offset) : 0) + (limit ? Number(limit) : 10) });
}
