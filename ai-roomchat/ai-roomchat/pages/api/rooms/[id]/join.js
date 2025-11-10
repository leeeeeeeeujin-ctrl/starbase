import { joinRoom } from '../../../../lib/server/roomStore';

export default async function handler(req, res){
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed'); }
  try {
    const { user } = req.body || {};
    const r = joinRoom(id, user||{});
    return res.status(200).json({ id: r.room.id, seq: r.room.seq, userId: r.userId });
  } catch (e) {
    try { console.warn('[rooms.join] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'rooms-join-failed' });
  }
}

export const config = { runtime: 'nodejs' };

