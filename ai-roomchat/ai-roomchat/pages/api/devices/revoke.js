import { removeDeviceByToken, getDeviceByToken, saveEvent } from '../../../lib/devicesStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const { token, adminPassword } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token_required' });

  const adminEnv = process.env.ADMIN_PORTAL_PASSWORD || '';
  if (adminEnv && adminEnv.length > 0) {
    if (!adminPassword || adminPassword !== adminEnv) return res.status(401).json({ error: 'admin_password_required' });
  }

  try {
    const stored = await getDeviceByToken(String(token));
    const r = await removeDeviceByToken(String(token));
    // record audit event
    try {
      const actor = req.body.actor || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      await saveEvent({ device_token: String(token), device_id: (stored && stored.row && (stored.row.device_id || stored.row.deviceId)) || null, event_type: 'revoke', detail: 'device revoked', actor });
    } catch (e) {
      // swallow audit errors
    }
    return res.status(200).json({ ok: true, removed: r.removed });
  } catch (e) {
    return res.status(500).json({ error: 'revoke_failed', detail: String(e) });
  }
}
