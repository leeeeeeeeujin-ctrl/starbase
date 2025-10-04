import { createClient } from '@supabase/supabase-js'

import {
  getFallbackGeminiModels,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for gemini-models API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

function sanitizeDetail(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 500)
}

function parseErrorMessage(text) {
  if (!text) return ''
  const trimmed = sanitizeDetail(text)
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed)
    return (
      parsed?.error?.message ||
      parsed?.error?.status ||
      (Array.isArray(parsed?.error?.details)
        ? parsed.error.details
            .map((entry) => entry?.reason || entry?.message || '')
            .filter(Boolean)
            .join('\n')
        : '') ||
      ''
    )
  } catch (error) {
    return trimmed
  }
}

function extractModelMetadata(model = {}) {
  const id = normalizeGeminiModelId(model?.id || model?.name)
  if (!id) return null
  const supported =
    model?.supportedGenerationMethods || model?.supported_generation_methods || []
  const supportsGenerateContent = Array.isArray(supported)
    ? supported.some((method) => method === 'generateContent')
    : false
  if (!supportsGenerateContent) {
    return null
  }
  const displayName =
    typeof model?.displayName === 'string' ? model.displayName.trim() : ''
  const label = displayName && displayName.toLowerCase() !== id.toLowerCase()
    ? `${displayName} (${id})`
    : displayName || id
  const inputTokenLimit = Number.isFinite(Number(model?.inputTokenLimit))
    ? Number(model.inputTokenLimit)
    : Number.isFinite(Number(model?.input_token_limit))
    ? Number(model.input_token_limit)
    : null
  const outputTokenLimit = Number.isFinite(Number(model?.outputTokenLimit))
    ? Number(model.outputTokenLimit)
    : Number.isFinite(Number(model?.output_token_limit))
    ? Number(model.output_token_limit)
    : null

  return {
    id,
    label,
    displayName: displayName || id,
    inputTokenLimit,
    outputTokenLimit,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { apiKey, mode } = payload || {}
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmedKey) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const normalizedMode = normalizeGeminiMode(mode)
  const endpointBase =
    normalizedMode === 'v1'
      ? 'https://generativelanguage.googleapis.com/v1/models'
      : 'https://generativelanguage.googleapis.com/v1beta/models'

  const listUrl = `${endpointBase}?pageSize=200&key=${encodeURIComponent(trimmedKey)}`

  let response
  try {
    response = await fetch(listUrl)
  } catch (error) {
    return res
      .status(502)
      .json({ error: 'ai_network_error', detail: sanitizeDetail(error.message) })
  }

  let text = ''
  try {
    text = await response.text()
  } catch (error) {
    return res
      .status(502)
      .json({ error: 'ai_network_error', detail: sanitizeDetail(error.message) })
  }

  if (!response.ok) {
    const detail = parseErrorMessage(text) || '모델 목록을 불러오지 못했습니다.'
    const status = response.status || 500
    if (status === 401 || status === 403) {
      return res.status(status).json({ error: 'invalid_user_api_key', detail })
    }
    if (status === 429) {
      return res.status(status).json({ error: 'quota_exhausted', detail })
    }
    if (status === 404) {
      return res.status(status).json({ error: 'model_not_found', detail })
    }
    return res.status(status).json({ error: 'list_models_failed', detail })
  }

  let data = null
  try {
    data = JSON.parse(text || '{}')
  } catch (error) {
    data = null
  }

  const models = Array.isArray(data?.models) ? data.models : []
  const entries = []
  const seen = new Set()
  models.forEach((model) => {
    const mapped = extractModelMetadata(model)
    if (!mapped) return
    if (seen.has(mapped.id)) return
    seen.add(mapped.id)
    entries.push(mapped)
  })

  if (!entries.length) {
    const fallback = getFallbackGeminiModels(normalizedMode)
    return res.status(200).json({
      ok: true,
      mode: normalizedMode,
      models: fallback.map((entry) => ({
        id: entry.id,
        label: entry.label,
        displayName: entry.label,
        inputTokenLimit: null,
        outputTokenLimit: null,
      })),
      fallback: true,
    })
  }

  entries.sort((a, b) => a.label.localeCompare(b.label))

  return res.status(200).json({ ok: true, mode: normalizedMode, models: entries })
}
