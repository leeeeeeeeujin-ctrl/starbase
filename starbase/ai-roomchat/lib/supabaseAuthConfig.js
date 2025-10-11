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

function stripApiKeyQuery(targetUrl, baseUrl) {
  if (!targetUrl) return targetUrl

  try {
    const parsed = new URL(targetUrl, baseUrl || undefined)
    if (!parsed.searchParams.has('apikey')) {
      return targetUrl
    }
    parsed.searchParams.delete('apikey')
    return parsed.toString()
  } catch (error) {
    return targetUrl
  }
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

    const sanitiseRequest = (url, options = {}) => {
      const headers = applyHeaders(options.headers)
      const nextInit = { ...options, headers }
      const rawUrl =
        typeof url === 'string'
          ? url
          : url && typeof url.toString === 'function'
          ? url.toString()
          : url
      const strippedUrl = stripApiKeyQuery(rawUrl, supabaseUrl)
      return { url: strippedUrl, init: nextInit }
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      const { url, init: nextInit } = sanitiseRequest(input.url, {
        method: input.method,
        headers: init.headers || input.headers,
        body: init.body ?? input.body,
        mode: init.mode ?? input.mode,
        credentials: init.credentials ?? input.credentials,
        cache: init.cache ?? input.cache,
        redirect: init.redirect ?? input.redirect,
        referrer: init.referrer ?? input.referrer,
        referrerPolicy: init.referrerPolicy ?? input.referrerPolicy,
        integrity: init.integrity ?? input.integrity,
        keepalive: init.keepalive ?? input.keepalive,
        signal: init.signal ?? input.signal,
      })

      const request = new Request(url, nextInit)
      return fetch(request)
    }

    const target = typeof input === 'string' ? input : input?.url
    const { url, init: nextInit } = sanitiseRequest(target || input, init)
    return fetch(url, nextInit)
  }

  return {
    headers: ensureHeaders({}),
    fetch: fetchWithAuth,
  }
}
