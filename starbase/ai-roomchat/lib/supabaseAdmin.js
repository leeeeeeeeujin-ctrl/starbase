import { createClient } from '@supabase/supabase-js'

import { sanitizeSupabaseUrl } from './supabaseEnv'

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

function createAuthEnsurer(supabaseUrl, { apikey, authorization } = {}) {
  const parsed = new URL(supabaseUrl)
  const supabaseOrigin = parsed.origin
  const supabaseHost = parsed.host

  const ensureHeaders = (headers = {}) => {
    const normalized = normalizeHeaders(headers)

    const ensure = (name, value) => {
      if (!value) return
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

    ensure('apikey', apikey)
    ensure('Authorization', authorization)

    return normalized
  }

  const ensureUrl = (rawUrl) => {
    if (!apikey) return rawUrl
    try {
      const resolved = new URL(typeof rawUrl === 'string' ? rawUrl : rawUrl.toString(), supabaseOrigin)
      if (resolved.host !== supabaseHost) {
        return rawUrl
      }
      if (!resolved.searchParams.has('apikey')) {
        resolved.searchParams.append('apikey', apikey)
      }
      return resolved.toString()
    } catch (error) {
      return rawUrl
    }
  }

  return { ensureHeaders, ensureUrl }
}

export function createSupabaseAuthConfig(supabaseUrl, { apikey, authorization } = {}) {
  const { ensureHeaders, ensureUrl } = createAuthEnsurer(supabaseUrl, { apikey, authorization })

  const fetchWithAuth = async (input, init = {}) => {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const headers = ensureHeaders(init.headers || input.headers)
      const finalInit = { ...init, headers }
      return fetch(input, finalInit)
    }

    const headers = ensureHeaders(init.headers)
    const finalInit = { ...init, headers }

    if (typeof input === 'string') {
      return fetch(ensureUrl(input), finalInit)
    }

    if (input instanceof URL) {
      return fetch(ensureUrl(input.toString()), finalInit)
    }

    return fetch(input, finalInit)
  }

  return {
    headers: ensureHeaders({}),
    fetch: fetchWithAuth,
  }
}

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const key =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ server-only

if (!url || !key) throw new Error('Missing SUPABASE envs')

const serviceAuthConfig = createSupabaseAuthConfig(url, {
  apikey: key,
  authorization: `Bearer ${key}`,
})

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { ...serviceAuthConfig.headers },
    fetch: serviceAuthConfig.fetch,
  },
})
