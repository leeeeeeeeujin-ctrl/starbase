import { getSnapshot } from '../../../../lib/server/roomStore';

export default async function handler(req, res){
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end('Method Not Allowed'); }
  try {
    const snap = getSnapshot(id);
    if (!snap) return res.status(404).json({ error: 'not-found' });
    return res.status(200).json(snap);
  } catch (e) {
    try { console.warn('[rooms.get] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'rooms-get-failed' });
  }
}

export const config = { runtime: 'nodejs' };

