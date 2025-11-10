import { appendEvent } from '../../../../lib/server/roomStore';

export default async function handler(req, res){
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'missing-id' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed'); }
  try {
    const { type, payload, userId } = req.body || {};
    const { room, event } = appendEvent(id, { type: String(type||'evt'), payload: payload||{}, userId: userId||null });
    return res.status(200).json({ ok: true, seq: room.seq, event });
  } catch (e) {
    try { console.warn('[rooms.event] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'rooms-event-failed' });
  }
}

export const config = { runtime: 'nodejs' };

