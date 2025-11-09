export const config = { runtime: 'nodejs' };
import { pushCreationLog } from '../../../lib/server/creationLog.js';
import { getWorkspaceSetStore } from '../../../lib/workspace/store/index.js';

const g = globalThis;
const PROMPTS = (g.__PROMPTS_STORE__ ||= new Map()); // id -> { id, name, createdAt }
const SEEN = (g.__PROMPTS_SEEN__ ||= new Set()); // X-Request-Id dedupe
const SETS = (g.__SET_STORE__ ||= new Map()); // id -> { etag, files }
const WINDOW_MS = Number(process.env.CREATE_DEDUP_WINDOW_MS || 3000);
const LAST = (g.__CREATE_DEDUP_PROMPTS__ ||= new Map()); // key -> { at, response }

function dedupKey(req, body) {
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  const b = body || {};
  const ident = b.id || b.name || 'anon';
  return `${ip}|${ident}`;
}

function makeId() {
  try { return crypto.randomUUID(); } catch (_) { return String(Date.now()) + Math.random().toString(16).slice(1); }
}

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'GET') {
    const items = Array.from(PROMPTS.values());
    return res.status(200).json({ items });
  }

  if (method === 'POST') {
    const rid = req.headers['x-request-id'];
    try {
      const bodyLog = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      pushCreationLog({ kind: 'prompt', location: null, detail: { url: '/api/prompts', payload: bodyLog, headers: { rid } }, referer: req.headers['referer'] || null, ua: req.headers['user-agent'] || null });
    } catch {}

    if (rid && SEEN.has(rid)) {
      return res.status(200).json({ ok: true });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    // Time-window dedupe (3s default): if same client+id/name re-hits, return prior response
    try {
      const key = dedupKey(req, body);
      const now = Date.now();
      const prev = LAST.get(key);
      if (prev && now - prev.at < WINDOW_MS) {
        return res.status(200).json(prev.response || { ok: true, existed: true, id: body.id || body.name, name: body.name || body.id });
      }
    } catch {}
    let { id, name } = body;
    if (!id && !name) return res.status(400).json({ error: 'missing id or name' });
    if (!id) id = makeId();
    if (!name) name = id;

    // 1) Idempotency by name
    const byName = Array.from(PROMPTS.values()).find(p => p.name === name);
    if (byName) {
      try { await getWorkspaceSetStore().create(byName.id); } catch {}
      if (rid) SEEN.add(rid);
      await persistSupabase({ id: byName.id, name });
      return res.status(200).json({ ok: true, id: byName.id, name: byName.name, existed: true });
    }

    // 2) De-dupe by id
    if (!PROMPTS.has(id)) {
      const createdAt = new Date().toISOString();
      PROMPTS.set(id, { id, name, createdAt });
    }
    try { await getWorkspaceSetStore().create(id); } catch {}

    await persistSupabase({ id, name });
    if (rid) SEEN.add(rid);
    const payload = { ok: true, id, name };
    try {
      const key = dedupKey(req, { id, name });
      LAST.set(key, { at: Date.now(), response: payload });
    } catch {}
    return res.status(200).json(payload);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

async function persistSupabase(row) {
  try {
    if (process.env.USE_SUPABASE_SETS === '1') {
      const { getSupabaseAdmin } = require('../../../lib/server/supabaseAdmin.js');
      const sb = getSupabaseAdmin();
      if (!sb) return;
      const { error } = await sb.from('prompt_sets').upsert(row, { onConflict: 'id' });
      if (error) console.warn('[api/prompts] supabase upsert error', error);
    }
  } catch (e) {
    console.warn('[api/prompts] supabase upsert exception', e);
  }
}
