import { createClient } from '@supabase/supabase-js'

import { sanitizeSupabaseUrl } from './supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const key =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ server-only

if (!url || !key) throw new Error('Missing SUPABASE envs')

function normalizeHeaders(input) {
  if (!input) return {}
  if (typeof Headers !== 'undefined' && input instanceof Headers) {
    const entries = {}
    input.forEach((value, headerKey) => {
      entries[headerKey] = value
    })
    return entries
  }
  if (Array.isArray(input)) {
    return input.reduce((acc, [headerKey, value]) => {
      acc[headerKey] = value
      return acc
    }, {})
  }
  if (typeof input === 'object') {
    return { ...input }
  }
  return {}
}

function ensureServiceHeaders(headers = {}) {
  const normalized = normalizeHeaders(headers)

  const ensure = (name, value) => {
    const existingKey = Object.keys(normalized).find(
      (headerKey) => headerKey && headerKey.toLowerCase() === name.toLowerCase(),
    )
    if (existingKey) {
      if (!normalized[existingKey]) {
        normalized[existingKey] = value
      }
      return
    }
    normalized[name] = value
  }

  ensure('apikey', key)
  ensure('Authorization', `Bearer ${key}`)

  return normalized
}

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    fetch: async (input, init = {}) => {
      const headers = ensureServiceHeaders(init.headers)
      return fetch(input, { ...init, headers })
    },
  },
})
