// Long-term memory API (Supabase-backed with in-memory fallback)
import { createClient } from '@supabase/supabase-js';

// Ephemeral fallback store (dev only)
const memoryFallback = new Map(); // userId => Map(key => { content, used_count, updated_at })

function getBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getUserIdFromToken(supabase, token) {
  if (!token || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return null;
    return data?.user?.id || null;
  } catch (_) {
    return null;
  }
}

function readFallback(userId) {
  const m = memoryFallback.get(userId) || new Map();
  return Array.from(m.entries()).map(([key, v]) => ({
    key,
    content: v.content,
    usedCount: v.used_count || 0,
    updatedAt: v.updated_at || new Date().toISOString(),
  }));
}

function writeFallback(userId, key, content) {
  const m = memoryFallback.get(userId) || new Map();
  m.set(key, { content, used_count: 0, updated_at: new Date().toISOString() });
  memoryFallback.set(userId, m);
}

function deleteFallback(userId, key) {
  const m = memoryFallback.get(userId) || new Map();
  m.delete(key);
  memoryFallback.set(userId, m);
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const token = getBearer(req);
  const userId = await getUserIdFromToken(supabase, token);

  // Require auth for remote; otherwise fallback is per missing userId
  const useFallback = !supabase || !userId;

  try {
    if (req.method === 'GET') {
      if (useFallback) {
        if (!userId) return res.status(200).json({ ok: true, items: [] });
        const items = readFallback(userId);
        return res.status(200).json({ ok: true, items });
      }
      const { data, error } = await supabase
        .from('ai_long_memory')
        .select('key, content, used_count, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const items = (data || []).map((r) => ({
        key: r.key,
        content: r.content,
        usedCount: r.used_count || 0,
        updatedAt: r.updated_at,
      }));
      return res.status(200).json({ ok: true, items });
    }

    if (req.method === 'POST') {
      const { key, content } = req.body || {};
      if (!key || typeof content !== 'string') {
        return res.status(400).json({ ok: false, error: 'invalid_args' });
      }
      if (useFallback) {
        if (!userId) return res.status(200).json({ ok: true });
        writeFallback(userId, String(key), String(content));
        return res.status(200).json({ ok: true });
      }
      const { error } = await supabase
        .from('ai_long_memory')
        .upsert({ user_id: userId, key: String(key), content: String(content) }, {
          onConflict: 'user_id,key',
        });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const key = String(req.query?.key || '').trim();
      if (!key) return res.status(400).json({ ok: false, error: 'invalid_args' });
      if (useFallback) {
        if (!userId) return res.status(200).json({ ok: true });
        deleteFallback(userId, key);
        return res.status(200).json({ ok: true });
      }
      const { error } = await supabase
        .from('ai_long_memory')
        .delete()
        .match({ user_id: userId, key });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
}

