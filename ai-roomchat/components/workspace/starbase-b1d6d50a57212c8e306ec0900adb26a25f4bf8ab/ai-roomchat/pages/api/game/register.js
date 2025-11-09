// Production-safe, stateless registration API.
// Instead of storing JSON server-side, we encode the published template URL
// to a Base64URL id. This works across serverless instances and deployments.

function toBase64Url(str) {
  return Buffer.from(String(str), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(b64url) {
  const padLength = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(b64, 'base64').toString('utf8');
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const url = String(body?.url || '').trim();
      if (!url) {
        return res.status(400).json({ error: 'url required' });
      }
      const id = toBase64Url(url);
      return res.status(200).json({ id });
    } catch (e) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  }

  if (req.method === 'GET') {
    try {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const url = fromBase64Url(String(id));
      // minimal validation
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'invalid_id' });
      return res.status(200).json({ url });
    } catch (e) {
      return res.status(400).json({ error: 'decode_failed' });
    }
  }

  res.setHeader('Allow', 'POST, GET');
  return res.status(405).end('Method Not Allowed');
}
