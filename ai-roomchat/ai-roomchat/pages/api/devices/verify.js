const { verifyToken } = require('../../../lib/security/token');
const { getDeviceByToken, saveEvent } = require('../../../lib/devicesStore');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token_required' });

  const secret = process.env.RUN_DEVICE_SECRET || process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || '';
  if (!secret) return res.status(500).json({ error: 'server_secret_not_configured' });

  try {
    const payload = verifyToken(String(token), secret);
    if (!payload) return res.status(401).json({ error: 'invalid_or_expired' });

    // check store
    const stored = await getDeviceByToken(String(token));
    if (!stored || !stored.row) return res.status(404).json({ error: 'device_not_found' });
    try {
      const actor = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      await saveEvent({ device_token: String(token), device_id: (stored && stored.row && (stored.row.device_id || stored.row.deviceId)) || null, event_type: 'verify', detail: 'device token verified', actor });
    } catch (e) {
      // ignore audit failures
    }

    return res.status(200).json({ ok: true, payload, device: stored.row });
  } catch (e) {
    return res.status(500).json({ error: 'verify_failed', detail: String(e) });
  }
}
