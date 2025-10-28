import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { withTableQuery } from '@/lib/supabaseTables';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

// This endpoint is a development-only proxy to call Gemini (Google Generative Language)
// REST API from a trusted server. It is intentionally opt-in via DEV_GEMINI_ENABLED env var.

const SUPABASE_URL = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  // not throwing so build doesn't fail for environments without supabase config
}

const anonClient = SUPABASE_URL && SUPABASE_ANON
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false },
      global: { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
    })
  : null;

// very small in-memory rate limiter (POC)
const rateMap = new Map();
const RATE_LIMIT_COUNT = Number(process.env.DEV_GEMINI_RATE_LIMIT_COUNT || 5);
const RATE_LIMIT_WINDOW_MS = Number(process.env.DEV_GEMINI_RATE_LIMIT_WINDOW_MS || 10000);

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com';

export default async function handler(req, res) {
  // disabled by default unless explicitly enabled
  if (!process.env.DEV_GEMINI_ENABLED || process.env.DEV_GEMINI_ENABLED !== 'true') {
    res.setHeader('Allow', 'POST');
    return res.status(404).json({ error: 'not_found' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // authenticate caller via Supabase session token in Authorization header
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !anonClient) return res.status(401).json({ error: 'unauthorized' });

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user || null;
  if (userError || !user) return res.status(401).json({ error: 'unauthorized' });

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (err) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const model = (payload.model && String(payload.model)) || 'gemini-2.5-flash';
  const contents = payload.contents || payload.prompt || null;
  const idempotencyKey = payload.idempotencyKey || null;

  if (!contents) return res.status(400).json({ error: 'missing_contents' });

  // Basic input size guard
  const serialized = typeof contents === 'string' ? contents : JSON.stringify(contents);
  if (serialized.length > Number(process.env.DEV_GEMINI_MAX_INPUT_CHARS || 20000)) {
    return res.status(413).json({ error: 'input_too_large' });
  }

  // simple per-user rate limit
  try {
    const now = Date.now();
    const key = String(user.id);
    const arr = rateMap.get(key) || [];
    const pruned = arr.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (pruned.length >= RATE_LIMIT_COUNT) return res.status(429).json({ error: 'rate_limited' });
    pruned.push(now);
    rateMap.set(key, pruned);
  } catch (e) {
    // ignore rate limiter failures
  }

  // prepare Gemini REST call
  const base = process.env.DEV_GEMINI_API_BASE || DEFAULT_API_BASE;
  const apiKey = process.env.DEV_GEMINI_API_KEY || null;
  if (!apiKey) return res.status(503).json({ error: 'gemini_api_key_missing' });

  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    // keep caller-provided structure when possible
    ...(payload.body || {
      contents: Array.isArray(contents) ? contents : [{ parts: [{ text: String(contents) }] }],
    }),
  };

  try {
    const gemResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await gemResp.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (err) {
      json = { raw: text };
    }

    // basic output size guard
    const outString = typeof json === 'string' ? json : JSON.stringify(json || '');
    if (outString.length > Number(process.env.DEV_GEMINI_MAX_OUTPUT_CHARS || 200000)) {
      return res.status(502).json({ error: 'output_too_large' });
    }

    // write audit row (POC) into rank_action_logs if available
    try {
      await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
        supabaseAdmin.from(from).insert({
          request_id: idempotencyKey || null,
          session_id: null,
          user_id: user?.id || null,
          action_name: 'gemini_proxy',
          payload: { model, body },
          result: json || null,
          ok: true,
        })
      );
    } catch (err) {
      console.warn('[gemini-proxy] audit insert failed', err?.message || err);
    }

    return res.status(200).json({ ok: true, result: json });
  } catch (err) {
    console.error('[gemini-proxy] error', err);
    try {
      await withTableQuery(supabaseAdmin, 'rank_action_logs', from =>
        supabaseAdmin.from(from).insert({
          request_id: idempotencyKey || null,
          session_id: null,
          user_id: user?.id || null,
          action_name: 'gemini_proxy',
          payload: { model, body },
          result: null,
          ok: false,
          error: err?.message || 'internal_error',
        })
      );
    } catch (e) {
      console.warn('[gemini-proxy] audit insert failed', e?.message || e);
    }
    return res.status(500).json({ error: err?.message || 'internal_error' });
  }
}
