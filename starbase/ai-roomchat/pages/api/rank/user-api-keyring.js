import { createClient } from '@supabase/supabase-js'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'

import {
  USER_API_KEYRING_LIMIT,
  activateUserApiKeyringEntry,
  countUserApiKeyringEntries,
  deleteUserApiKeyringEntry,
  fetchUserApiKeyring,
  insertUserApiKeyringEntry,
} from '@/lib/rank/userApiKeyring'
import { detectGeminiPreset } from '@/lib/rank/geminiModelsService'
import { detectOpenAIPreset } from '@/lib/rank/openaiDetection'
import { fetchUserApiKey, upsertUserApiKey } from '@/lib/rank/userApiKeys'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for user-api-keyring API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

async function resolveUser(req, res) {
  try {
    const supabase = createPagesServerClient({ req, res })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      return { user }
    }
  } catch (cookieError) {
    console.warn('[user-api-keyring] Failed to resolve user from cookies:', cookieError)
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { user: null }
  }

  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data?.user) {
    return { user: null }
  }

  return { user: data.user }
}

function normalizeEntryResponse(entry, options = {}) {
  if (!entry) return null
  const payload = {
    id: entry.id,
    provider: entry.provider,
    modelLabel: entry.modelLabel,
    apiVersion: entry.apiVersion,
    geminiMode: entry.geminiMode,
    geminiModel: entry.geminiModel,
    keySample: entry.keySample,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }

  if (typeof options.isActive === 'boolean') {
    payload.isActive = options.isActive
  }

  return payload
}

const OPENAI_KEY_PATTERNS = [
  /^sk-[a-z0-9]{16,}$/i,
  /^sk-(live|test|proj|proj-test|share)-[a-z0-9-]{8,}$/i,
]

const GEMINI_KEY_PATTERNS = [/^AIza[0-9A-Za-z_\-]{20,}$/, /^gk-[0-9a-z]{16,}$/i]

function heuristicDetectProvider(apiKey) {
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) return null

  if (OPENAI_KEY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      provider: 'openai',
      apiVersion: null,
      detail: '키 형식이 OpenAI 패턴과 일치합니다.',
    }
  }

  if (GEMINI_KEY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return {
      provider: 'gemini',
      geminiMode: 'v1beta',
      detail: '키 형식이 Gemini 패턴과 일치합니다.',
    }
  }

  if (trimmed.toLowerCase().startsWith('sk-')) {
    return {
      provider: 'openai',
      apiVersion: null,
      detail: '키 형식이 OpenAI 패턴과 일치합니다.',
    }
  }

  return null
}

async function handleList(req, res, user) {
  try {
    const [entries, active] = await Promise.all([
      fetchUserApiKeyring(user.id, { includeSecret: true }),
      fetchUserApiKey(user.id).catch(() => null),
    ])

    const activeKey = active?.apiKey || ''
    const sanitized = entries.map((entry) =>
      normalizeEntryResponse(entry, {
        isActive: !!activeKey && !!entry.apiKey && entry.apiKey === activeKey,
      }),
    )

    return res.status(200).json({
      ok: true,
      keys: sanitized,
      limit: USER_API_KEYRING_LIMIT,
    })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'failed_to_load_keyring' })
  }
}

async function detectProvider(apiKey) {
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmed) {
    return { ok: false, error: 'missing_api_key' }
  }

  const heuristic = heuristicDetectProvider(trimmed)

  const shouldTryOpenAI = !heuristic || heuristic.provider === 'openai'
  let openaiResult = null
  if (shouldTryOpenAI) {
    try {
      openaiResult = await detectOpenAIPreset({ apiKey: trimmed })
    } catch (error) {
      console.warn('[user-api-keyring] OpenAI detection failed:', error)
      openaiResult = { ok: false, errorCode: 'detect_failed', detail: error?.message || '' }
    }

    if (openaiResult?.ok) {
      return {
        ok: true,
        provider: 'openai',
        modelLabel: openaiResult.model || null,
        apiVersion: openaiResult.apiVersion || null,
        geminiMode: null,
        geminiModel: null,
        detail: openaiResult.detail || '',
        fallback: !!openaiResult.fallback,
      }
    }

    if (openaiResult?.errorCode === 'invalid_user_api_key') {
      return {
        ok: false,
        error: 'invalid_user_api_key',
        detail: openaiResult.detail || 'API 키가 올바르지 않습니다.',
      }
    }

    if (heuristic?.provider === 'openai') {
      return {
        ok: true,
        provider: 'openai',
        modelLabel: null,
        apiVersion: heuristic.apiVersion || null,
        geminiMode: null,
        geminiModel: null,
        detail:
          openaiResult?.detail ||
          (openaiResult?.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 OpenAI 키로 판단했습니다.'
            : heuristic.detail || ''),
        fallback: true,
      }
    }

    if (openaiResult) {
      return {
        ok: true,
        provider: 'openai',
        modelLabel: null,
        apiVersion: openaiResult.apiVersion || null,
        geminiMode: null,
        geminiModel: null,
        detail:
          openaiResult.detail ||
          (openaiResult.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 OpenAI 키로 판단했습니다.'
            : 'OpenAI 응답을 확인하지 못했지만 키 형식이 유효해 보입니다.'),
        fallback: true,
      }
    }
  }

  const shouldTryGemini = !heuristic || heuristic.provider === 'gemini'
  let geminiResult = null
  if (shouldTryGemini) {
    try {
      geminiResult = await detectGeminiPreset({ apiKey: trimmed })
    } catch (error) {
      console.warn('[user-api-keyring] Gemini detection failed:', error)
      geminiResult = { ok: false, errorCode: 'detect_failed', detail: error?.message || '' }
    }

    if (geminiResult?.ok) {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: geminiResult.model || null,
        apiVersion: null,
        geminiMode: geminiResult.mode || null,
        geminiModel: geminiResult.model || null,
        detail: geminiResult.detail || '',
        fallback: !!geminiResult.fallback,
      }
    }

    if (geminiResult?.errorCode === 'invalid_user_api_key') {
      return {
        ok: false,
        error: 'invalid_user_api_key',
        detail: geminiResult.detail || 'API 키가 올바르지 않습니다.',
      }
    }

    if (heuristic?.provider === 'gemini') {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: null,
        apiVersion: null,
        geminiMode: heuristic.geminiMode || null,
        geminiModel: heuristic.geminiModel || null,
        detail:
          geminiResult?.detail ||
          (geminiResult?.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 Gemini 키로 판단했습니다.'
            : heuristic.detail || ''),
        fallback: true,
      }
    }

    if (geminiResult) {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: null,
        apiVersion: null,
        geminiMode: geminiResult.mode || null,
        geminiModel: null,
        detail:
          geminiResult.detail ||
          (geminiResult.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 Gemini 키로 판단했습니다.'
            : 'Gemini 응답을 확인하지 못했지만 키 형식이 유효해 보입니다.'),
        fallback: true,
      }
    }
  }

  if (heuristic) {
    return {
      ok: true,
      provider: heuristic.provider,
      modelLabel: heuristic.modelLabel || null,
      apiVersion: heuristic.apiVersion || null,
      geminiMode: heuristic.geminiMode || null,
      geminiModel: heuristic.geminiModel || null,
      detail: heuristic.detail || '',
      fallback: true,
    }
  }

  return {
    ok: false,
    error: openaiResult?.errorCode || geminiResult?.errorCode || 'unrecognized_api_key',
    detail:
      openaiResult?.detail ||
      geminiResult?.detail ||
      'API 키 제공자를 확인하지 못했습니다.',
  }
}

async function handleCreate(req, res, user) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { apiKey, activate = true } = payload || {}
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmedKey) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  try {
    const currentCount = await countUserApiKeyringEntries(user.id)
    if (currentCount >= USER_API_KEYRING_LIMIT) {
      return res.status(400).json({ error: 'keyring_limit_reached' })
    }

    const detection = await detectProvider(trimmedKey)
    if (!detection.ok) {
      return res.status(400).json({ error: detection.error || 'detect_failed', detail: detection.detail })
    }

    const entry = await insertUserApiKeyringEntry({
      userId: user.id,
      apiKey: trimmedKey,
      provider: detection.provider,
      modelLabel: detection.modelLabel,
      apiVersion: detection.apiVersion,
      geminiMode: detection.geminiMode,
      geminiModel: detection.geminiModel,
    })

    if (activate !== false) {
      await upsertUserApiKey({
        userId: user.id,
        apiKey: trimmedKey,
        apiVersion: detection.apiVersion,
        geminiMode: detection.geminiMode,
        geminiModel: detection.geminiModel,
      })
    }

    return res.status(200).json({
      ok: true,
      entry: normalizeEntryResponse(entry, { isActive: activate !== false }),
      activated: activate !== false,
      detection,
    })
  } catch (error) {
    console.error('[user-api-keyring] Failed to store API key:', error)
    return res.status(400).json({ error: error.message || 'failed_to_store_api_key' })
  }
}

async function handleActivate(req, res, user) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { id } = payload || {}
  if (!id) {
    return res.status(400).json({ error: 'missing_entry_id' })
  }

  try {
    const entry = await activateUserApiKeyringEntry({
      userId: user.id,
      entryId: id,
      upsert: upsertUserApiKey,
    })

    return res.status(200).json({
      ok: true,
      entry: normalizeEntryResponse(entry, { isActive: true }),
    })
  } catch (error) {
    console.error('[user-api-keyring] Failed to activate API key:', error)
    return res.status(400).json({ error: error.message || 'failed_to_activate_api_key' })
  }
}

async function handleDelete(req, res, user) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { id } = payload || {}
  if (!id) {
    return res.status(400).json({ error: 'missing_entry_id' })
  }

  try {
    await deleteUserApiKeyringEntry({ userId: user.id, entryId: id })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('[user-api-keyring] Failed to delete API key:', error)
    return res.status(400).json({ error: error.message || 'failed_to_delete_api_key' })
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { user } = await resolveUser(req, res)
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  if (req.method === 'GET') {
    return handleList(req, res, user)
  }

  if (req.method === 'POST') {
    return handleCreate(req, res, user)
  }

  if (req.method === 'PATCH') {
    return handleActivate(req, res, user)
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, user)
  }

  return res.status(405).json({ error: 'method_not_allowed' })
}
