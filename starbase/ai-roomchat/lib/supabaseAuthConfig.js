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
  try {
    sanitizeSupabaseUrl(supabaseUrl)
  } catch (error) {
    console.warn('[supabaseAuthConfig] Invalid Supabase URL supplied:', error)
  }

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

  return { ensureHeaders }
}

export function createSupabaseAuthConfig(supabaseUrl, { apikey, authorization } = {}) {
  const { ensureHeaders } = createAuthEnsurer(supabaseUrl, { apikey, authorization })

  const fetchWithAuth = async (input, init = {}) => {
    const applyHeaders = (headers) => ensureHeaders(headers)

    if (typeof Request !== 'undefined' && input instanceof Request) {
      const headers = applyHeaders(init.headers || input.headers)
      const request = new Request(input, { ...init, headers })
      return fetch(request)
    }

    const headers = applyHeaders(init.headers)
    const finalInit = { ...init, headers }
    return fetch(input, finalInit)
  }

  return {
    headers: ensureHeaders({}),
    fetch: fetchWithAuth,
  }
}
