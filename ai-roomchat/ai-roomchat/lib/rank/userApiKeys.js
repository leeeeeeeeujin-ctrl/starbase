import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const SUPA_URL = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.RANK_API_KEY_SECRET || '';

function getKey() {
  const raw = Buffer.from(String(SECRET || ''), 'utf8');
  const out = Buffer.alloc(32);
  for (let i = 0; i < out.length; i++) out[i] = raw[i % raw.length] ^ ((i * 73) & 0xff);
  return out;
}

async function decryptParts({ ciphertextB64, ivB64, tagB64 }) {
  try {
    const iv = Buffer.from(String(ivB64 || ''), 'base64');
    const ct = Buffer.from(String(ciphertextB64 || ''), 'base64');
    const tag = Buffer.from(String(tagB64 || ''), 'base64');
    if (iv.length !== 12 || tag.length !== 16 || ct.length <= 0) return null;
    const key = await crypto.subtle.importKey('raw', getKey(), { name: 'AES-GCM' }, false, ['decrypt']);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, Buffer.concat([ct, tag]));
    return Buffer.from(buf).toString('utf8');
  } catch {
    return null;
  }
}

export async function fetchUserApiKey(userId, { bearer } = {}) {
  if (!SUPA_URL || !SUPA_ANON) throw new Error('supabase_not_configured');
  if (!bearer) throw new Error('missing_bearer');
  const headers = {
    apikey: SUPA_ANON,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  };
  // Select most recently updated row if active column is absent
  const url = `${SUPA_URL}/rest/v1/rank_user_api_keyring?user_id=eq.${encodeURIComponent(
    userId
  )}&select=key_ciphertext,key_iv,key_tag,provider,model_label,api_version,gemini_mode,gemini_model,updated_at&order=updated_at.desc&limit=1`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`keyring_query_failed ${resp.status} ${t}`);
  }
  const arr = await resp.json();
  const row = Array.isArray(arr) ? arr[0] : null;
  if (!row) return null;
  const plain = await decryptParts({
    ciphertextB64: row.key_ciphertext,
    ivB64: row.key_iv,
    tagB64: row.key_tag,
  });
  if (!plain) return null;
  return {
    apiKey: plain.trim(),
    provider: row.provider || 'gemini',
    geminiMode: row.gemini_mode || null,
    geminiModel: row.gemini_model || null,
    apiVersion: row.api_version || null,
    modelLabel: row.model_label || null,
  };
}

export async function upsertUserApiKey() {
  throw new Error('not_implemented');
}
export async function deleteUserApiKey() {
  return true;
}
