import { createClient } from '@supabase/supabase-js';

import { fetchUserApiKey, upsertUserApiKey } from '@/lib/rank/userApiKeys';
import { fetchUserApiKeyring } from '@/lib/rank/userApiKeyring';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for user-api-key API');
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
        apiVersion: activeKey.apiVersion || matched.provider || null,
        geminiMode: activeKey.geminiMode || matched.geminiMode || null,
        geminiModel: activeKey.geminiModel || matched.geminiModel || null,
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
    apiVersion: latest.provider || activeKey?.apiVersion || null,
    geminiMode: latest.geminiMode || activeKey?.geminiMode || null,
    geminiModel: latest.geminiModel || activeKey?.geminiModel || null,
  };
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user || null;
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const stored = await resolvePreferredUserApiKey(user.id);
      if (!stored) {
        return res.status(200).json({ ok: false });
      }
      return res.status(200).json({
        ok: true,
        apiKey: stored.apiKey || '',
        apiVersion: stored.apiVersion || null,
        geminiMode: stored.geminiMode || null,
        geminiModel: stored.geminiModel || null,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'failed_to_load_api_key' });
    }
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { apiKey, apiVersion, geminiMode, geminiModel } = payload || {};
  const trimmedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!trimmedApiKey) {
    return res.status(400).json({ error: 'missing_user_api_key' });
  }

  try {
    const result = await upsertUserApiKey({
      userId: user.id,
      apiKey: trimmedApiKey,
      apiVersion: typeof apiVersion === 'string' ? apiVersion.trim() || null : null,
      geminiMode: typeof geminiMode === 'string' ? geminiMode.trim() || null : null,
      geminiModel: typeof geminiModel === 'string' ? geminiModel.trim() || null : null,
    });

    return res.status(200).json({
      ok: true,
      key_sample: result?.key_sample || '',
      api_version: result?.api_version || null,
      gemini_mode: result?.gemini_mode || null,
      gemini_model: result?.gemini_model || null,
      updated_at: result?.updated_at || null,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'failed_to_store_api_key' });
  }
}
