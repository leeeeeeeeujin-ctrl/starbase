export const config = { runtime: 'nodejs' };
import { pushCreationLog } from '../../../../lib/server/creationLog.js';
import { getWorkspaceSetStore } from '../../../../lib/workspace/store/index.js';

const g = globalThis;
const STORE = (g.__SET_STORE__ ||= new Map()); // id -> { etag, files }
const SEEN = (g.__SET_SEEN__ ||= new Set()); // request-id dedupe
const WINDOW_MS = Number(process.env.CREATE_DEDUP_WINDOW_MS || 3000);
const LAST = (g.__CREATE_DEDUP_SETS__ ||= new Map()); // key -> { at, ok }

function dedupKey(req, body) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  const b = body || {};
  const ident = b.id || 'anon';
  return `${ip}|${ident}`;
}

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
  // Time-window dedupe (3s default)
  try {
    const key = dedupKey(req, body);
    const now = Date.now();
    const prev = LAST.get(key);
    if (prev && now - prev.at < WINDOW_MS) {
      return res.status(200).json({ ok: true });
    }
  } catch {}
  const { id } = body;
  if (!id) return res.status(400).json({ error: 'missing id' });

  try {
    const store = getWorkspaceSetStore();
    await store.create(id);
  } catch {}
  if (rid) SEEN.add(rid);
  try {
    const key = dedupKey(req, body);
    LAST.set(key, { at: Date.now(), ok: true });
  } catch {}
  return res.status(200).json({ ok: true });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
