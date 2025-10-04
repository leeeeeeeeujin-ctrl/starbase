import { supabaseAdmin } from '@/lib/supabaseAdmin'

import { decryptText, encryptText } from './encryption'

const TABLE = 'rank_user_api_keys'

function buildSample(apiKey) {
  if (!apiKey) return ''
  const trimmed = apiKey.trim()
  if (trimmed.length <= 8) return trimmed
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

export async function upsertUserApiKey({ userId, apiKey, apiVersion }) {
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) {
    throw new Error('apiKey is required')
  }
  if (!userId) {
    throw new Error('userId is required')
  }

  const encrypted = encryptText(trimmed)
  const payload = {
    user_id: userId,
    key_ciphertext: encrypted.ciphertext,
    key_iv: encrypted.iv,
    key_tag: encrypted.tag,
    key_version: encrypted.version,
    api_version: apiVersion || null,
    key_sample: buildSample(trimmed),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, api_version, key_sample, updated_at')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function fetchUserApiKey(userId) {
  if (!userId) {
    throw new Error('userId is required')
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('key_ciphertext, key_iv, key_tag, key_version, api_version')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const apiKey = decryptText({
    ciphertext: data.key_ciphertext,
    iv: data.key_iv,
    tag: data.key_tag,
    version: data.key_version,
  })

  return {
    apiKey,
    apiVersion: data.api_version || null,
  }
}

