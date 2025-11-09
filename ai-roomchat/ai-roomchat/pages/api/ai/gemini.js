import { createClient } from '@supabase/supabase-js';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';
import { fetchUserApiKey } from '@/lib/rank/userApiKeys';

const SUPA_URL = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';

// Optional server key fallback (not recommended for untrusted/public use)
const SERVER_API_KEY = process.env.AI_GEMINI_SERVER_API_KEY || process.env.DEV_GEMINI_API_KEY || null;
const ALLOW_SERVER_KEY = String(process.env.AI_GEMINI_ALLOW_SERVER_KEY || 'false') === 'true';

const anonClient =
  SUPA_URL && SUPA_ANON
    ? createClient(SUPA_URL, SUPA_ANON, {
        auth: { persistSession: false },
        global: { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
      })
    : null;

async function resolveUserFromRequest(req) {
  // Prefer Authorization: Bearer <supabase access token>
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token && anonClient) {
    try {
      const { data, error } = await anonClient.auth.getUser(token);
      if (!error && data?.user) return data.user;
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!SUPA_URL || !SUPA_ANON) {
    return res.status(500).json({ error: 'supabase_not_configured' });
  }

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch { return res.status(400).json({ error: 'invalid_payload' }); }
  }

  const model = (payload.model && String(payload.model)) || 'gemini-2.5-flash';
  const contents = payload.contents || payload.prompt || null;
  const bodyOverride = payload.body || null;
  const prefer = (payload.prefer && String(payload.prefer)) || 'keyring'; // 'keyring' | 'server'

  if (!contents && !bodyOverride) return res.status(400).json({ error: 'missing_contents' });

  const url = `${DEFAULT_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  // Build request body
  const body = bodyOverride || {
    contents: Array.isArray(contents) ? contents : [{ parts: [{ text: String(contents) }] }],
  };

  // Resolve user and user key (if any)
  const user = await resolveUserFromRequest(req);
  let apiKeyToUse = null;

  if (prefer === 'keyring') {
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    try {
      const active = await fetchUserApiKey(user.id);
      apiKeyToUse = active?.apiKey || null;
      if (!apiKeyToUse) return res.status(400).json({ error: 'missing_user_api_key' });
    } catch (e) {
      return res.status(500).json({ error: 'failed_to_load_user_api_key' });
    }
  } else if (prefer === 'server') {
    if (!ALLOW_SERVER_KEY || !SERVER_API_KEY) return res.status(503).json({ error: 'server_key_unavailable' });
    apiKeyToUse = SERVER_API_KEY;
  } else {
    return res.status(400).json({ error: 'invalid_prefer' });
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKeyToUse },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!resp.ok) return res.status(resp.status).json({ error: 'upstream_error', result: json });
    return res.status(200).json({ ok: true, result: json });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
}

