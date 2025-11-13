import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const anonClient = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

// Ephemeral in-memory store keyed by userId
// Structure: Map<userId, Map<key, { key, content, usedCount, updatedAt }>>
const mem = new Map();

function ensureUserMap(userId) {
  let m = mem.get(userId);
  if (!m) {
    m = new Map();
    mem.set(userId, m);
  }
  return m;
}

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (!anonClient) {
    // Still serve from ephemeral memory without auth (dev fallback)
  }

  // Auth (best-effort)
  let userId = null;
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token && anonClient) {
      const { data } = await anonClient.auth.getUser(token);
      userId = data?.user?.id || null;
    }
  } catch {}
  // Fallback to per-request salt if no auth (dev only)
  if (!userId) userId = 'anon:' + (req.headers['x-forwarded-for'] || 'local');

  try {
    if (method === 'GET') {
      const m = ensureUserMap(userId);
      const items = Array.from(m.values())
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return res.status(200).json({ ok: true, items });
    }
    if (method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const key = String(body.key || '').trim();
      const content = String(body.content || '').trim();
      if (!key || !content) return res.status(400).json({ ok: false, error: 'invalid_payload' });
      const m = ensureUserMap(userId);
      const now = Date.now();
      const prev = m.get(key) || { key, content: '', usedCount: 0, updatedAt: 0 };
      m.set(key, { key, content, usedCount: prev.usedCount || 0, updatedAt: now });
      return res.status(200).json({ ok: true });
    }
    if (method === 'DELETE') {
      const key = String(req.query.key || '').trim();
      if (!key) return res.status(400).json({ ok: false, error: 'invalid_key' });
      const m = ensureUserMap(userId);
      m.delete(key);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
}

