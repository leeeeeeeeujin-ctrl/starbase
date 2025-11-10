import { createRoom } from '../../../lib/server/roomStore';

export default async function handler(req, res){
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed'); }
  try {
    const { id, state } = req.body || {};
    const room = createRoom(id, { state });
    return res.status(200).json({ id: room.id, seq: room.seq, createdAt: room.createdAt });
  } catch (e) {
    try { console.warn('[rooms.create] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'rooms-create-failed' });
  }
}

export const config = { runtime: 'nodejs' };

