const { createToken } = require('../../../lib/security/token');

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const adminPassword = process.env.ADMIN_PORTAL_PASSWORD || '';
  const body = req.body || {};
  const provided = body.password || body.adminPassword || '';
  if (!adminPassword) return res.status(500).json({ error: 'server_misconfigured' });
  if (provided !== adminPassword) return res.status(401).json({ error: 'unauthorized' });

  const secret = process.env.RUN_CAPABILITY_SECRET || process.env.RUN_SIGNING_SECRET || '';
  if (!secret) return res.status(500).json({ error: 'server_misconfigured' });

  const ttl = Number(body.ttl || 300);
  const token = createToken({ sub: 'capability', scope: body.scope || 'default' }, secret, ttl);
  return res.status(200).json({ token, exp: Math.floor(Date.now() / 1000) + ttl });
}
