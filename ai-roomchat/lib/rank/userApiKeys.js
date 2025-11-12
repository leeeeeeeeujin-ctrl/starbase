import crypto from 'crypto';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { encryptText, decryptText } from './encryption';

const TABLE = 'rank_user_api_keys';

function buildSample(apiKey) {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function sanitizeRow(row, { includeSecret = false } = {}) {
  if (!row) return null;
  const base = {
    userId: row.user_id,
    apiVersion: row.api_version || null,
    geminiMode: row.gemini_mode || null,
    geminiModel: row.gemini_model || null,
    keySample: row.key_sample || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };

  if (includeSecret) {
    base.apiKey = decryptText({
      ciphertext: row.key_ciphertext,
      iv: row.key_iv,
      tag: row.key_tag,
      version: row.key_version,
    });
  }

  return base;
}

export async function fetchUserApiKey(userId, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const includeSecret = options.includeSecret !== false;
  const columns = [
    'user_id',
    'api_version',
    'gemini_mode',
    'gemini_model',
    'key_sample',
    'created_at',
    'updated_at',
  ];

  if (includeSecret) {
    columns.push('key_ciphertext', 'key_iv', 'key_tag', 'key_version');
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(columns.join(', '))
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return sanitizeRow(data, { includeSecret });
}

export async function upsertUserApiKey({
  userId,
  apiKey,
  apiVersion,
  geminiMode,
  geminiModel,
}) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!trimmedKey) {
    throw new Error('apiKey is required');
  }

  const encrypted = encryptText(trimmedKey);
  const payload = {
    user_id: userId,
    key_ciphertext: encrypted.ciphertext,
    key_iv: encrypted.iv,
    key_tag: encrypted.tag,
    key_version: encrypted.version,
    api_version: normalizeOptional(apiVersion),
    gemini_mode: normalizeOptional(geminiMode),
    gemini_model: normalizeOptional(geminiModel),
    key_sample: buildSample(trimmedKey),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select(
      [
        'user_id',
        'api_version',
        'gemini_mode',
        'gemini_model',
        'key_sample',
        'created_at',
        'updated_at',
      ].join(', ')
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function deleteUserApiKey({ userId }) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const { error } = await supabaseAdmin.from(TABLE).delete().eq('user_id', userId);
  if (error) {
    throw error;
  }
  return true;
}

function b64ToBuf(b64) {
  return Buffer.from(b64, 'base64');
}

function deriveAesKey(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest();
}

export async function decryptParts({ ciphertextB64, ivB64, tagB64 }, secret) {
  const key = deriveAesKey(secret);
  const iv = b64ToBuf(ivB64);
  const tag = b64ToBuf(tagB64);
  const ciphertext = b64ToBuf(ciphertextB64);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec1 = decipher.update(ciphertext);
  const dec2 = decipher.final();
  return Buffer.concat([dec1, dec2]).toString('utf8');
}

export async function fetchLatestGeminiKey(options = {}) {
  const { userId, supabaseUrl, anonKey, accessToken } = options;

  if (userId) {
    const { data, error } = await supabaseAdmin
      .from('rank_user_api_keyring')
      .select(
        [
          'provider',
          'model_label',
          'api_version',
          'gemini_mode',
          'gemini_model',
          'key_ciphertext',
          'key_iv',
          'key_tag',
          'updated_at',
        ].join(', ')
      )
      .eq('user_id', userId)
      .eq('provider', 'gemini')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      model: data.gemini_model || data.model_label || 'gemini-2.5-flash',
      apiVersion: data.api_version || null,
      geminiMode: data.gemini_mode || 'v1beta',
      ciphertextB64: data.key_ciphertext,
      ivB64: data.key_iv,
      tagB64: data.key_tag,
    };
  }

  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL');
  if (!anonKey) throw new Error('Missing SUPABASE_ANON_KEY');
  if (!accessToken) throw new Error('Missing user access token');

  const url = new URL('/rest/v1/rank_user_api_keyring', supabaseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('provider', 'eq.gemini');
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`keyring fetch failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const row = rows[0] || {};
  return {
    model: row.gemini_model || row.model_label || 'gemini-2.5-flash',
    apiVersion: row.api_version || null,
    geminiMode: row.gemini_mode || 'v1beta',
    ciphertextB64: row.key_ciphertext,
    ivB64: row.key_iv,
    tagB64: row.key_tag,
  };
}
