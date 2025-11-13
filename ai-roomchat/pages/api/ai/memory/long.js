import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withTableQuery } from '@/lib/supabaseTables';

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

  async function getRemoteItems(uid) {
    try {
      const { data, error } = await withTableQuery(
        supabaseAdmin,
        'ai_long_memory',
        from => supabaseAdmin.from(from).select('key, content, used_count, updated_at').eq('user_id', uid)
      );
      if (error) throw error;
      return (data || []).map((r) => ({
        key: String(r.key || ''),
        content: String(r.content || ''),
        usedCount: Number(r.used_count || 0),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : 0,
      }));
    } catch (e) {
      throw e;
    }
  }

  async function upsertRemote(uid, key, content) {
    const row = { user_id: uid, key, content, used_count: 0 };
    const { error } = await withTableQuery(
      supabaseAdmin,
      'ai_long_memory',
      from => supabaseAdmin.from(from).upsert(row, { onConflict: 'user_id,key' })
    );
    if (error) throw error;
  }

  async function deleteRemote(uid, key) {
    const { error } = await withTableQuery(
      supabaseAdmin,
      'ai_long_memory',
      from => supabaseAdmin.from(from).delete().eq('user_id', uid).eq('key', key)
    );
    if (error) throw error;
  }

  try {
    if (method === 'GET') {
      // prefer remote if available
      try {
        const items = await getRemoteItems(userId);
        return res.status(200).json({ ok: true, items });
      } catch {
        const m = ensureUserMap(userId);
        const items = Array.from(m.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return res.status(200).json({ ok: true, items });
      }
    }
    if (method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const key = String(body.key || '').trim();
      const content = String(body.content || '').trim();
      if (!key || !content) return res.status(400).json({ ok: false, error: 'invalid_payload' });
      try {
        await upsertRemote(userId, key, content);
        return res.status(200).json({ ok: true, remote: true });
      } catch {
        const m = ensureUserMap(userId);
        const now = Date.now();
        const prev = m.get(key) || { key, content: '', usedCount: 0, updatedAt: 0 };
        m.set(key, { key, content, usedCount: prev.usedCount || 0, updatedAt: now });
        return res.status(200).json({ ok: true, remote: false });
      }
    }
    if (method === 'DELETE') {
      const key = String(req.query.key || '').trim();
      if (!key) return res.status(400).json({ ok: false, error: 'invalid_key' });
      try {
        await deleteRemote(userId, key);
        return res.status(200).json({ ok: true, remote: true });
      } catch {
        const m = ensureUserMap(userId);
        m.delete(key);
        return res.status(200).json({ ok: true, remote: false });
      }
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'internal_error' });
  }
}
