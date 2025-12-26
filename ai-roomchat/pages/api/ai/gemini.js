// Server-only endpoint to call Gemini with either a user key from Supabase keyring
// or a direct key from headers/body. This avoids any client-side Supabase usage.
// Route: POST /api/ai/gemini

import { createClient } from '@supabase/supabase-js';

import { decryptParts, fetchLatestGeminiKey } from '../../../lib/rank/userApiKeys';
import { sanitizeSupabaseUrl } from '../../../lib/supabaseEnv';
import { callWithContents } from '../../../lib/ai/llmRouter';

export const config = {
  api: {
    bodyParser: true,
  },
};

const supabaseUrl = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration for Gemini API route');
}

const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  },
});

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

async function resolveApiKey({ req, prefer, supabaseUser, accessToken, providerHint }) {
  const directKey = req.headers['x-ai-api-key'] || (req.body && req.body.apiKey);
  if (prefer === 'direct' && directKey) {
    return { apiKey: String(directKey), source: 'direct' };
  }

  const normalizedProvider =
    typeof providerHint === 'string' && providerHint.trim()
      ? providerHint.trim().toLowerCase()
      : null;

  if (prefer === 'keyring' || !prefer) {
    if (!supabaseUser) {
      if (prefer === 'keyring') {
        return {
          error: 'missing_keyring_token',
          status: 401,
          code: 'missing_keyring_token',
          detail: 'Authorization bearer token is required when prefer=keyring',
        };
      }
    } else {
      const secret = process.env.RANK_API_KEY_SECRET;
      if (!secret) {
        throw new HandlerError({
          message: 'Rank API key secret missing',
          status: 500,
          code: 'missing_rank_secret',
          detail: 'RANK_API_KEY_SECRET is required to decrypt stored Gemini keys',
        });
      }

      let latest = null;
      try {
        latest = await fetchLatestGeminiKey({
          userId: supabaseUser.id,
          provider: normalizedProvider || undefined,
        });
      } catch (err) {
        console.warn('[ai/gemini] Failed to fetch keyring via admin client', err);
      }

      if (!latest && accessToken) {
        try {
          latest = await fetchLatestGeminiKey({
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            accessToken,
          });
        } catch (err) {
          console.warn('[ai/gemini] Fallback REST keyring fetch failed', err);
          if (prefer === 'keyring') {
            throw new HandlerError({
              message: 'Failed to fetch keyring entry',
              status: 502,
              code: 'keyring_fetch_failed',
              detail: err?.message || String(err),
            });
          }
        }
      }

      if (latest) {
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
          provider: latest.provider || normalizedProvider || 'gemini',
          model: latest.model,
          mode: latest.geminiMode || 'v1beta',
          source: 'keyring',
        };
      }
    }

    if (prefer === 'keyring') {
      return {
        error: 'missing_keyring',
        status: 404,
        code: 'missing_keyring',
        detail:
          'No keyring entry found for this user' +
          (normalizedProvider ? ` (provider: ${normalizedProvider})` : ''),
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

async function callGemini({
  apiKey,
  model = 'gemini-2.5-flash',
  mode = 'v1beta',
  contents,
  generationConfig,
}) {
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

function convertContentsToOpenAIMessages(contents) {
  const messages = [];
  const list = Array.isArray(contents) ? contents : [];
  list.forEach((entry) => {
    if (!entry) return;
    const roleRaw = entry.role || 'user';
    const role =
      roleRaw === 'model'
        ? 'assistant'
        : roleRaw === 'assistant' || roleRaw === 'user' || roleRaw === 'system'
        ? roleRaw
        : 'user';
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    const text = parts
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (!text) return;
    messages.push({ role, content: text });
  });
  return messages;
}

async function callOpenAIChat({ apiKey, model, contents }) {
  const messages = convertContentsToOpenAIMessages(contents);
  const effectiveModel = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    throw new HandlerError({
      message: 'Failed to reach OpenAI API',
      status: 502,
      code: 'openai_fetch_failed',
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
    let code = 'openai_error';
    if (response.status === 403 || response.status === 429) {
      code = 'model_quota_exceeded';
    } else if (response.status === 400 || response.status === 401) {
      code = 'invalid_openai_request';
    }
    throw new HandlerError({
      message: detail?.error?.message || 'OpenAI call failed',
      status: response.status,
      code,
      detail,
    });
  }

  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content || '';
  const assistantText = typeof content === 'string' ? content : '';

  // Wrap OpenAI response in a Gemini-like envelope so callers
  // can continue to use extractGeminiText without changes.
  return {
    candidates: [
      {
        content: {
          parts: [{ text: assistantText || text }],
        },
      },
    ],
    _provider: 'openai',
    _raw: data || text,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  try {
    const { prefer, contents, generationConfig, model, provider: providerHint } = req.body || {};
    const accessToken = await getUserAccessTokenFromAuthHeader(req);
    let supabaseUser = null;
    if (accessToken) {
      try {
        const { data, error } = await anonClient.auth.getUser(accessToken);
        if (!error && data?.user) {
          supabaseUser = data.user;
        }
      } catch (err) {
        console.warn('[ai/gemini] Failed to verify Supabase user from token', err);
      }
    }
    const resolved = await resolveApiKey({
      req,
      prefer,
      supabaseUser,
      accessToken,
      providerHint,
    });
    if (!resolved || !resolved.apiKey) {
      return json(res, resolved?.status || 401, {
        error: resolved?.error || 'No API key available',
        code: resolved?.code || 'missing_api_key',
        detail: resolved?.detail || null,
      });
    }
    const provider = resolved.provider || providerHint || 'gemini';
    const effectiveModel = model || resolved.model || null;

    const out = await callWithContents({
      provider,
      apiKey: resolved.apiKey,
      model: effectiveModel,
      contents,
      generationConfig,
    });

    return json(res, 200, {
      ok: true,
      provider,
      model: effectiveModel,
      source: resolved.source,
      data: out,
    });
  } catch (e) {
    return json(res, e.status || 500, {
      error: e.message || String(e),
      code: e.code || 'internal_error',
      detail: e.detail || e.data || null,
    });
  }
}
