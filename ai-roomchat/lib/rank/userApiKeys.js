// Minimal, server-side only helper to fetch and decrypt a user's AI API key
// from Supabase rank_user_api_keyring using the user's access token.
// Avoids using supabase-js in serverless/edge/worker contexts.

const crypto = require('crypto');

function b64ToBuf(b64) {
  return Buffer.from(b64, 'base64');
}

function deriveAesKey(secret) {
  // Deterministic 32-byte key by SHA-256 of secret string
  return crypto.createHash('sha256').update(String(secret || '')).digest();
}

async function decryptParts({ ciphertextB64, ivB64, tagB64 }, secret) {
  const key = deriveAesKey(secret);
  const iv = b64ToBuf(ivB64);
  const tag = b64ToBuf(tagB64);
  const ciphertext = b64ToBuf(ciphertextB64);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec1 = decipher.update(ciphertext);
  const dec2 = decipher.final();
  const out = Buffer.concat([dec1, dec2]).toString('utf8');
  return out;
}

async function fetchLatestGeminiKey({ supabaseUrl, anonKey, accessToken }) {
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

module.exports = {
  decryptParts,
  fetchLatestGeminiKey,
};

