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
  const parsedUrl = (() => {
    try {
      const sanitised = sanitizeSupabaseUrl(supabaseUrl)
      return sanitised ? new URL(sanitised) : null
    } catch (error) {
      console.warn('[supabaseAuthConfig] Invalid Supabase URL supplied:', error)
      return null
    }
  })()

  const supabaseOrigin = parsedUrl?.origin ?? null
  const supabaseHost = parsedUrl?.host ?? null

  const ensureHeaders = (headers = {}) => {
    const normalised = normalizeHeaders(headers)

    const ensure = (name, value) => {
      if (!value) return
      const existingKey = Object.keys(normalised).find(
        (headerKey) => headerKey && headerKey.toLowerCase() === name.toLowerCase(),
      )
      if (existingKey) {
        if (!normalised[existingKey]) {
          normalised[existingKey] = value
        }
        return
      }
      normalised[name] = value
    }

    ensure('apikey', apikey)
    ensure('Authorization', authorization)

    return normalised
  }

  const ensureUrl = (rawUrl) => {
    if (!apikey || !rawUrl) return rawUrl
    if (!supabaseOrigin || !supabaseHost) return rawUrl

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
