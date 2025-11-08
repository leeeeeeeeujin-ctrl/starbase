import { listEvents } from '../../../lib/devicesStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');
  try {
    const limit = Number(req.query.limit) || 100;
    const r = await listEvents(limit);
    return res.status(200).json({ ok: true, rows: r.rows });
  } catch (e) {
    return res.status(500).json({ error: 'list_events_failed', detail: String(e) });
  }
}
