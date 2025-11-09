export const config = { runtime: 'nodejs' };
import { pushCreationLog } from '../../../../lib/server/creationLog.js';

const g = globalThis;
const STORE = (g.__SET_STORE__ ||= new Map()); // id -> { etag, files }
const SEEN = (g.__SET_SEEN__ ||= new Set()); // request-id dedupe

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const bodyLog = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    pushCreationLog({ kind: 'set', location: null, detail: { url: '/api/workspace/sets', payload: bodyLog, headers: { rid: req.headers['x-request-id'] || null } }, referer: req.headers['referer'] || null, ua: req.headers['user-agent'] || null });
  } catch {}

  const rid = req.headers['x-request-id'];
  if (rid && SEEN.has(rid)) {
    return res.status(200).json({ ok: true });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const { id } = body;
  if (!id) return res.status(400).json({ error: 'missing id' });

  if (!STORE.has(id)) {
    STORE.set(id, { etag: `"${Date.now()}"`, files: {} });
  }
  if (rid) SEEN.add(rid);
  return res.status(200).json({ ok: true });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

