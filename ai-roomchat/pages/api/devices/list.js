import { listDevices } from '../../../lib/devicesStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const adminEnv = process.env.ADMIN_PORTAL_PASSWORD || '';
  const adminPassword = req.headers['x-admin-password'] || req.query.adminPassword || null;
  if (adminEnv && adminEnv.length > 0) {
    if (!adminPassword || adminPassword !== adminEnv) return res.status(401).json({ error: 'admin_password_required' });
  }

  try {
    const r = await listDevices();
    return res.status(200).json({ ok: true, devices: r.rows || [] });
  } catch (e) {
    return res.status(500).json({ error: 'list_failed', detail: String(e) });
  }
}
