import { supabaseAdmin } from '@/lib/supabaseAdmin';

import { decryptText, encryptText } from './encryption';
import { normalizeGeminiMode, normalizeGeminiModelId } from './geminiConfig';

export const USER_API_KEYRING_LIMIT = 5;

const TABLE = 'rank_user_api_keyring';

function buildSample(apiKey) {
  if (!apiKey) return '';
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function sanitizeRow(row, options = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    userId: row.user_id,
    provider: row.provider || 'unknown',
    modelLabel: row.model_label || null,
    apiVersion: row.api_version || null,
    geminiMode: row.gemini_mode || null,
    geminiModel: row.gemini_model || null,
    keySample: row.key_sample || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };

  if (options.includeSecret) {
    base.apiKey = decryptText({
      ciphertext: row.key_ciphertext,
      iv: row.key_iv,
      tag: row.key_tag,
      version: row.key_version,
    });
  }

  return base;
}

export async function fetchUserApiKeyring(userId, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const includeSecret = !!options.includeSecret;

  const columns = [
    'id',
    'user_id',
    'provider',
    'model_label',
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
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(row => sanitizeRow(row, { includeSecret }));
}

export async function countUserApiKeyringEntries(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function insertUserApiKeyringEntry({
  userId,
  apiKey,
  provider,
  modelLabel,
  apiVersion,
  geminiMode,
  geminiModel,
}) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedKey) {
    throw new Error('apiKey is required');
  }
  if (!userId) {
    throw new Error('userId is required');
  }
  const normalizedProvider =
    typeof provider === 'string' ? provider.trim().toLowerCase() : 'unknown';

  const encrypted = encryptText(trimmedKey);
  const payload = {
    user_id: userId,
    provider: normalizedProvider,
    model_label: typeof modelLabel === 'string' ? modelLabel.trim() || null : null,
    api_version: typeof apiVersion === 'string' ? apiVersion.trim() || null : null,
    gemini_mode: geminiMode ? normalizeGeminiMode(geminiMode) : null,
    gemini_model: geminiModel ? normalizeGeminiModelId(geminiModel) : null,
    key_ciphertext: encrypted.ciphertext,
    key_iv: encrypted.iv,
    key_tag: encrypted.tag,
    key_version: encrypted.version,
    key_sample: buildSample(trimmedKey),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select(
      [
        'id',
        'user_id',
        'provider',
        'model_label',
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

  return sanitizeRow(data);
}

export async function deleteUserApiKeyringEntry({ userId, entryId }) {
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!entryId) {
    throw new Error('entryId is required');
  }

  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return true;
}

export async function fetchUserApiKeyringEntry({ userId, entryId, includeSecret = false }) {
  if (!userId) {
    throw new Error('userId is required');
  }
  if (!entryId) {
    throw new Error('entryId is required');
  }

  const columns = [
    'id',
    'user_id',
    'provider',
    'model_label',
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
    .eq('id', entryId)
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

export async function activateUserApiKeyringEntry({ userId, entryId, upsert }) {
  if (!upsert || typeof upsert !== 'function') {
    throw new Error('upsert handler is required');
  }

  const entry = await fetchUserApiKeyringEntry({ userId, entryId, includeSecret: true });
  if (!entry) {
    throw new Error('api_key_entry_not_found');
  }
  if (!entry.apiKey) {
    throw new Error('api_key_missing_secret');
  }

  await upsert({
    userId,
    apiKey: entry.apiKey,
    apiVersion: entry.apiVersion,
    geminiMode: entry.geminiMode,
    geminiModel: entry.geminiModel,
  });

  return entry;
}
