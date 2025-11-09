export const config = { runtime: 'nodejs' };
import { pushCreationLog, readCreationLogs } from '../../../lib/server/creationLog.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'POST') {
    try {
      const now = Date.now();
      const bodyRaw = await readBody(req);
      const body = safeJson(bodyRaw);
      const entry = { referer: req.headers['referer'] || null, ua: req.headers['user-agent'] || null, ...body };
      pushCreationLog(entry);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e && e.message || e) });
    }
  }

  if (method === 'GET') {
    const n = Number(req.query.n || 50);
    const { count, items } = readCreationLogs(n);
    return res.status(200).json({ count, items });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
