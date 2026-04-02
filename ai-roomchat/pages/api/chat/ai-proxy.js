import { createClient } from '@supabase/supabase-js';

import { callChat } from '@/lib/rank/ai';
import { fetchUserApiKey } from '@/lib/rank/userApiKeys';
import { fetchUserApiKeyring } from '@/lib/rank/userApiKeyring';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for chat AI proxy');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolvePreferredUserApiKey(userId) {
  const [activeKey, keyringEntries] = await Promise.all([
    fetchUserApiKey(userId).catch(() => null),
    fetchUserApiKeyring(userId, { includeSecret: true }).catch(() => []),
  ]);

  const entries = Array.isArray(keyringEntries) ? keyringEntries.filter(Boolean) : [];
  if (!entries.length) {
    return activeKey || null;
  }

  if (activeKey?.apiKey) {
    const matched = entries.find(
      entry =>
        typeof entry?.apiKey === 'string' &&
        entry.apiKey.trim() &&
        entry.apiKey.trim() === String(activeKey.apiKey).trim()
    );
    if (matched) {
      return {
        apiKey: matched.apiKey,
        apiVersion: activeKey.apiVersion || matched.provider || 'gemini',
        geminiMode: activeKey.geminiMode || matched.geminiMode || null,
        geminiModel: activeKey.geminiModel || matched.geminiModel || null,
        provider: matched.provider || null,
      };
    }
  }

  const latest = entries
    .slice()
    .sort(
      (a, b) =>
        toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt)
    )[0];

  if (!latest?.apiKey) {
    return activeKey || null;
  }

  return {
    apiKey: latest.apiKey,
    apiVersion: latest.provider || activeKey?.apiVersion || 'gemini',
    geminiMode: latest.geminiMode || activeKey?.geminiMode || null,
    geminiModel: latest.geminiModel || activeKey?.geminiModel || null,
    provider: latest.provider || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
    const accept = typeof req.headers.accept === 'string' ? req.headers.accept : '';
    const secFetchMode =
      typeof req.headers['sec-fetch-mode'] === 'string' ? req.headers['sec-fetch-mode'] : '';

    if (
      req.method === 'GET' &&
      secFetchMode === 'navigate' &&
      accept.includes('text/html') &&
      referer
    ) {
      return res.redirect(303, referer);
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const tokenHeader = req.headers.authorization || '';
  const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data: userResult, error: userError } = await anonClient.auth.getUser(token);
  const user = userResult?.user || null;
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      payload = null;
    }
  }

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ error: 'missing_prompt' });
  }

  let storedKey;
  try {
    storedKey = await resolvePreferredUserApiKey(user.id);
  } catch (error) {
    console.warn('[chat-ai-proxy] Failed to load API key:', error);
  }

  if (!storedKey?.apiKey) {
    return res.status(400).json({ error: 'missing_user_api_key' });
  }

  const apiVersion = storedKey.apiVersion || 'gemini';
  const providerOptions =
    apiVersion === 'gemini'
      ? { geminiMode: storedKey.geminiMode || 'v1beta', geminiModel: storedKey.geminiModel || null }
      : {};

  const result = await callChat({
    userApiKey: storedKey.apiKey,
    system: '',
    user: prompt,
    apiVersion,
    history: [],
    providerOptions,
  });

  if (result?.error) {
    return res.status(400).json(result);
  }

  return res.status(200).json({ ok: true, text: result?.text || '' });
}
