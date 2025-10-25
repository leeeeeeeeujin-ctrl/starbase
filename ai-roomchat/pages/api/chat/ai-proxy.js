import { createClient } from '@supabase/supabase-js';

import { callChat } from '@/lib/rank/ai';
import { fetchUserApiKey } from '@/lib/rank/userApiKeys';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
    storedKey = await fetchUserApiKey(user.id);
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
