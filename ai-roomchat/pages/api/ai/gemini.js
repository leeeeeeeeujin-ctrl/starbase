// Server-only endpoint to call Gemini with either a user key from Supabase keyring
// or a direct key from headers/body. This avoids any client-side Supabase usage.
// Route: POST /api/ai/gemini

import crypto from 'crypto';
import { decryptParts, fetchLatestGeminiKey } from '../../../lib/rank/userApiKeys';

export const config = {
  api: {
    bodyParser: true,
  },
};

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function getUserAccessTokenFromAuthHeader(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(String(auth));
  return m ? m[1] : null;
}

async function resolveApiKey({ req, prefer }) {
  // 1) direct: X-AI-API-KEY or body.apiKey
  const directKey = req.headers['x-ai-api-key'] || (req.body && req.body.apiKey);
  if (prefer === 'direct' && directKey) {
    return { apiKey: String(directKey), source: 'direct' };
  }

  // 2) keyring: Supabase user keyring by Authorization: Bearer <access token>
  if (prefer === 'keyring' || !prefer) {
    const accessToken = await getUserAccessTokenFromAuthHeader(req);
    if (accessToken) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const secret = process.env.RANK_API_KEY_SECRET;
      const latest = await fetchLatestGeminiKey({ supabaseUrl, anonKey, accessToken });
      if (!latest) return null;
      const apiKey = await decryptParts({
        ciphertextB64: latest.ciphertextB64,
        ivB64: latest.ivB64,
        tagB64: latest.tagB64,
      }, secret);
      return {
        apiKey,
        model: latest.model,
        mode: latest.geminiMode || 'v1beta',
        source: 'keyring',
      };
    }
  }

  // 3) fallback: direct if provided
  if (directKey) return { apiKey: String(directKey), source: 'direct' };
  return null;
}

async function callGemini({ apiKey, model = 'gemini-2.5-flash', mode = 'v1beta', contents, generationConfig }) {
  const endpoint = `https://generativelanguage.googleapis.com/${mode}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: contents || [],
    generationConfig: generationConfig || { temperature: 0.4 },
  };
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!r.ok) {
    const err = data || { error: text };
    throw Object.assign(new Error('Gemini call failed'), { status: r.status, data: err });
  }
  return data || { raw: text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  try {
    const { prefer, contents, generationConfig, model } = req.body || {};
    const resolved = await resolveApiKey({ req, prefer });
    if (!resolved || !resolved.apiKey) {
      return json(res, 401, { error: 'No API key available' });
    }
    const out = await callGemini({
      apiKey: resolved.apiKey,
      model: model || resolved.model || 'gemini-2.5-flash',
      mode: resolved.mode || 'v1beta',
      contents,
      generationConfig,
    });
    return json(res, 200, { ok: true, model: model || resolved.model, source: resolved.source, data: out });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || String(e), data: e.data || null });
  }
}

