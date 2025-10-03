// lib/rank/ai.js

function safeParseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function sanitizeDetail(detail) {
  if (typeof detail !== 'string') {
    return ''
  }
  return detail.trim().slice(0, 500)
}

let cachedFetchImpl = null

async function getRuntimeFetch() {
  if (typeof fetch === 'function') {
    return fetch
  }
  if (!cachedFetchImpl) {
    const mod = await import('node-fetch')
    cachedFetchImpl = mod.default
  }
  return cachedFetchImpl
}

function buildNetworkError(error) {
  const detail = error?.message ? sanitizeDetail(error.message) : ''
  return detail ? { error: 'ai_network_error', detail } : { error: 'ai_network_error' }
}

function deriveGoogleError(status, rawBody) {
  const parsed = safeParseJson(rawBody)
  const message =
    parsed?.error?.message ||
    parsed?.error?.status ||
    (Array.isArray(parsed?.error?.details)
      ? parsed.error.details
          .map((entry) => entry?.reason || entry?.message || '')
          .filter(Boolean)
          .join('\n')
      : '') ||
    sanitizeDetail(rawBody)

  const lower = message.toLowerCase()
  if (status === 401) {
    return { error: 'invalid_user_api_key', detail: message }
  }
  if (status === 429) {
    return { error: 'quota_exhausted', detail: message }
  }
  if (status === 403 || lower.includes('permission') || lower.includes('api key not valid')) {
    return { error: 'invalid_user_api_key', detail: message }
  }
  if (status === 404 || lower.includes('model') && lower.includes('not found')) {
    return { retry: true, detail: message }
  }
  if (status === 400 && lower.includes('safety')) {
    return { error: 'ai_prompt_blocked', detail: message }
  }
  if (status === 400 && lower.includes('unsupported location')) {
    return { error: 'invalid_user_api_key', detail: message }
  }
  if (!message) {
    return { error: 'ai_failed', detail: '' }
  }
  return { error: 'ai_failed', detail: message }
}

async function callGemini({ apiKey, system, prompt }) {
  const runtimeFetch = await getRuntimeFetch()
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  }

  if (system) {
    body.systemInstruction = {
      role: 'system',
      parts: [{ text: system }],
    }
  }

  const endpoints = [
    {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      queryKey: true,
    },
    {
      url: 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent',
      queryKey: false,
    },
  ]

  let lastFailure = null

  for (const endpoint of endpoints) {
    const headers = {
      'Content-Type': 'application/json',
    }

    if (!endpoint.queryKey) {
      headers['x-goog-api-key'] = apiKey
    }

    const url = endpoint.queryKey
      ? `${endpoint.url}?key=${encodeURIComponent(apiKey)}`
      : endpoint.url

    let resp
    try {
      resp = await runtimeFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (error) {
      lastFailure = buildNetworkError(error)
      continue
    }

    let text = ''
    try {
      text = await resp.text()
    } catch (error) {
      lastFailure = buildNetworkError(error)
      continue
    }

    if (resp.ok) {
      const json = safeParseJson(text)
      const parts = json?.candidates?.[0]?.content?.parts
      const content = Array.isArray(parts)
        ? parts
            .filter((part) => typeof part?.text === 'string')
            .map((part) => part.text)
            .join('\n')
        : ''
      return { text: typeof content === 'string' ? content : '' }
    }

    const derived = deriveGoogleError(resp.status, text)
    if (derived.retry) {
      lastFailure = { error: 'ai_failed', detail: derived.detail }
      continue
    }
    return derived
  }

  return lastFailure || { error: 'ai_failed' }
}

function deriveOpenAIError(status, rawBody) {
  const parsed = safeParseJson(rawBody)
  const message =
    parsed?.error?.message ||
    parsed?.error?.code ||
    sanitizeDetail(rawBody)

  if (status === 401) {
    return { error: 'invalid_user_api_key', detail: message }
  }
  if (status === 429) {
    return { error: 'quota_exhausted', detail: message }
  }
  if (status === 403) {
    return { error: 'invalid_user_api_key', detail: message }
  }
  if (!message) {
    return { error: 'ai_failed', detail: '' }
  }
  return { error: 'ai_failed', detail: message }
}

async function callOpenAIResponses({ apiKey, system, prompt }) {
  const runtimeFetch = await getRuntimeFetch()
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  const input = []
  if (system) {
    input.push({
      role: 'system',
      content: [{ type: 'text', text: system }],
    })
  }
  input.push({
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  })

  let resp
  try {
    resp = await runtimeFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input,
        temperature: 0.7,
      }),
    })
  } catch (error) {
    return buildNetworkError(error)
  }

  let text = ''
  try {
    text = await resp.text()
  } catch (error) {
    return buildNetworkError(error)
  }
  if (!resp.ok) {
    return deriveOpenAIError(resp.status, text)
  }

  const json = safeParseJson(text)
  let value = ''
  if (Array.isArray(json?.output)) {
    value = json.output
      .filter((item) => item?.type === 'message')
      .flatMap((item) => item?.message?.content || [])
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
  }
  if (!value && typeof json?.output_text === 'string') {
    value = json.output_text
  }
  return { text: typeof value === 'string' ? value : '' }
}

async function callOpenAIChat({ apiKey, system, prompt }) {
  const runtimeFetch = await getRuntimeFetch()
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  let resp
  try {
    resp = await runtimeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    })
  } catch (error) {
    return buildNetworkError(error)
  }

  let text = ''
  try {
    text = await resp.text()
  } catch (error) {
    return buildNetworkError(error)
  }
  if (!resp.ok) {
    return deriveOpenAIError(resp.status, text)
  }

  const json = safeParseJson(text)
  const value = json?.choices?.[0]?.message?.content ?? ''
  return { text: typeof value === 'string' ? value : '' }
}

export async function callChat({ userApiKey, system, user, apiVersion = 'gemini' }) {
  const trimmedKey = typeof userApiKey === 'string' ? userApiKey.trim() : ''
  if (!trimmedKey) {
    return { error: 'missing_user_api_key' }
  }

  const trimmedPrompt = typeof user === 'string' ? user : ''
  if (!trimmedPrompt.trim()) {
    return { error: 'missing_prompt' }
  }

  const trimmedSystem = typeof system === 'string' ? system.trim() : ''

  try {
    if (apiVersion === 'gemini') {
      return await callGemini({ apiKey: trimmedKey, system: trimmedSystem, prompt: trimmedPrompt })
    }

    if (apiVersion === 'responses') {
      return await callOpenAIResponses({
        apiKey: trimmedKey,
        system: trimmedSystem,
        prompt: trimmedPrompt,
      })
    }

    return await callOpenAIChat({
      apiKey: trimmedKey,
      system: trimmedSystem,
      prompt: trimmedPrompt,
    })
  } catch (error) {
    return { error: 'ai_network_error' }
  }
}
