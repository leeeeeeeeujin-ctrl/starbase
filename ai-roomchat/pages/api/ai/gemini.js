// Server-only endpoint to call Gemini with either a user key from Supabase keyring
// or a direct key from headers/body. This avoids any client-side Supabase usage.
// Route: POST /api/ai/gemini

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

class HandlerError extends Error {
  constructor({ message, status = 500, code = 'internal_error', detail = null }) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function resolveApiKey({ req, prefer }) {
  const directKey = req.headers['x-ai-api-key'] || (req.body && req.body.apiKey);
  if (prefer === 'direct' && directKey) {
    return { apiKey: String(directKey), source: 'direct' };
  }

  if (prefer === 'keyring' || !prefer) {
    const accessToken = await getUserAccessTokenFromAuthHeader(req);
    if (accessToken) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const secret = process.env.RANK_API_KEY_SECRET;
      if (!supabaseUrl || !anonKey) {
        throw new HandlerError({
          message: 'Supabase configuration missing',
          status: 500,
          code: 'missing_supabase_env',
          detail: 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set',
        });
      }
      if (!secret) {
        throw new HandlerError({
          message: 'Rank API key secret missing',
          status: 500,
          code: 'missing_rank_secret',
          detail: 'RANK_API_KEY_SECRET is required to decrypt stored Gemini keys',
        });
      }
      let latest;
      try {
        latest = await fetchLatestGeminiKey({ supabaseUrl, anonKey, accessToken });
      } catch (err) {
        throw new HandlerError({
          message: 'Failed to fetch keyring entry',
          status: 502,
          code: 'keyring_fetch_failed',
          detail: err?.message || String(err),
        });
      }
      if (!latest) {
        if (prefer === 'keyring') {
          return {
            error: 'missing_keyring',
            status: 404,
            code: 'missing_keyring',
            detail: 'No Gemini keyring entry found for this user',
          };
        }
        return null;
      }
      let apiKey;
      try {
        apiKey = await decryptParts(
          {
            ciphertextB64: latest.ciphertextB64,
            ivB64: latest.ivB64,
            tagB64: latest.tagB64,
          },
          secret
        );
      } catch (err) {
        throw new HandlerError({
          message: 'Failed to decrypt Gemini keyring entry',
          status: 500,
          code: 'keyring_decryption_failed',
          detail: err?.message || String(err),
        });
      }
      return {
        apiKey,
        model: latest.model,
        mode: latest.geminiMode || 'v1beta',
        source: 'keyring',
      };
    }
    if (prefer === 'keyring') {
      return {
        error: 'missing_keyring_token',
        status: 401,
        code: 'missing_keyring_token',
        detail: 'Authorization bearer token is required when prefer=keyring',
      };
    }
  }

  if (directKey) return { apiKey: String(directKey), source: 'direct' };
  return {
    error: 'missing_api_key',
    status: 401,
    code: 'missing_api_key',
    detail: 'No API key found via headers/body or keyring',
  };
}

async function callGemini({ apiKey, model = 'gemini-2.5-flash', mode = 'v1beta', contents, generationConfig }) {
  const endpoint = `https://generativelanguage.googleapis.com/${mode}/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: contents || [],
    generationConfig: generationConfig || { temperature: 0.4 },
  };
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new HandlerError({
      message: 'Failed to reach Gemini API',
      status: 502,
      code: 'gemini_fetch_failed',
      detail: err?.message || String(err),
    });
  }
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw fallback
  }
  if (!response.ok) {
    const detail = data || { error: text };
    let code = 'gemini_error';
    if (response.status === 403 || response.status === 429) {
      code = 'model_quota_exceeded';
    } else if (response.status === 400) {
      code = 'invalid_gemini_request';
    }
    throw new HandlerError({
      message: detail?.error?.message || 'Gemini call failed',
      status: response.status,
      code,
      detail,
    });
  }
  return data || { raw: text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  try {
    const { prefer, contents, generationConfig, model } = req.body || {};
    const resolved = await resolveApiKey({ req, prefer });
    if (!resolved || !resolved.apiKey) {
      return json(res, resolved?.status || 401, {
        error: resolved?.error || 'No API key available',
        code: resolved?.code || 'missing_api_key',
        detail: resolved?.detail || null,
      });
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
    return json(res, e.status || 500, {
      error: e.message || String(e),
      code: e.code || 'internal_error',
      detail: e.detail || e.data || null,
    });
  }
}
