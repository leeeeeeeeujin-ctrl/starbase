// POST /api/runtime/external-proxy?setId=&path=
// Looks up /runtime/external.config.json in the given workspace set and enforces RPM + domain allowlist.

import { getSet } from '../../../lib/workspaceSetsStore';

const RATE_WINDOW_MS = 60 * 1000;
const DEFAULT_RPM = Number(process.env.EXTERNAL_PROXY_RPM || 30);
const memoryBuckets = new Map(); // key -> [timestamps]

function bucketKey(ip, setId) { return `${ip}::${setId}`; }

function allow(ip, setId, limit) {
  const now = Date.now();
  const key = bucketKey(ip, setId);
  const arr = memoryBuckets.get(key) || [];
  const kept = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (kept.length >= limit) return false;
  kept.push(now);
  memoryBuckets.set(key, kept);
  return true;
}

function readVfsFile(record, vfsPath) {
  const p = vfsPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const found = (record?.files || []).find((f) => f.path.replace(/^\/+/, '') === p);
  return found ? found.content : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const setId = typeof req.query.setId === 'string' ? req.query.setId : '';
  const outPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!setId || !outPath) return res.status(400).json({ error: 'Missing setId or path' });

  const record = getSet(setId);
  if (!record) return res.status(404).json({ error: 'Set not found' });

  const cfgRaw = readVfsFile(record, 'runtime/external.config.json');
  if (!cfgRaw) return res.status(400).json({ error: 'External config missing' });

  let cfg;
  try { cfg = JSON.parse(cfgRaw); } catch (e) { return res.status(400).json({ error: 'Invalid external.config.json' }); }
  const rpm = Number(cfg.rpm || DEFAULT_RPM);
  const domains = Array.isArray(cfg.domains) ? cfg.domains : [];

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '0.0.0.0').toString();
  if (!allow(ip, setId, rpm)) return res.status(429).json({ error: 'Rate limit exceeded' });

  // Validate URL against domain allowlist
  let url;
  try { url = new URL(outPath, cfg.base || undefined); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  const hostAllowed = domains.some((d) => typeof d === 'string' && url.hostname.endsWith(d));
  if (!hostAllowed) return res.status(403).json({ error: 'Domain not allowed' });

  // Forward POST with JSON body only (lightweight)
  let body;
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body || '{}'); } catch { body = {}; }
  } else {
    body = req.body || {};
  }

  let upstream;
  try {
    upstream = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'follow',
    });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: e?.message });
  }

  const text = await upstream.text();
  const ct = upstream.headers.get('content-type') || 'text/plain';
  res.setHeader('content-type', ct);
  return res.status(upstream.status).send(text);
}

