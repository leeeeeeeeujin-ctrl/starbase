// pages/api/rank/run-turn.js
import { createClient } from '@supabase/supabase-js'

import { callChat } from '@/lib/rank/ai'
import { fetchUserApiKey, upsertUserApiKey } from '@/lib/rank/userApiKeys'
import { buildTurnSummaryPayload } from '@/lib/rank/turnSummary'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for run-turn API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

function sanitizeRole(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length) {
      return trimmed
    }
  }
  return fallback
}

function coerceBoolean(value, fallback = true) {
  if (value === undefined) return fallback
  return Boolean(value)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
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

  const {
    apiKey,
    prompt,
    system = '',
    apiVersion = 'gemini',
    geminiMode,
    geminiModel,
    session_id: sessionId,
    game_id: gameId,
    prompt_role: promptRoleInput,
    response_role: responseRoleInput,
    response_public: responsePublicInput,
  } = payload || {}

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'missing_session_id' })
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'missing_prompt' })
  }
  const trimmedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''

  const providedGeminiMode = typeof geminiMode === 'string' ? geminiMode.trim() : ''
  const providedGeminiModel = typeof geminiModel === 'string' ? geminiModel.trim() : ''

  if (trimmedApiKey) {
    try {
      await upsertUserApiKey({
        userId: user.id,
        apiKey: trimmedApiKey,
        apiVersion,
        geminiMode: providedGeminiMode,
        geminiModel: providedGeminiModel,
      })
    } catch (error) {
      console.warn('[run-turn] Failed to persist API key:', error)
    }
  }

  let effectiveApiKey = trimmedApiKey
  let effectiveApiVersion = apiVersion
  let effectiveGeminiMode = providedGeminiMode
  let effectiveGeminiModel = providedGeminiModel

  if (!effectiveApiKey) {
    try {
      const stored = await fetchUserApiKey(user.id)
      if (stored?.apiKey) {
        effectiveApiKey = stored.apiKey
        if (!effectiveApiVersion && stored.apiVersion) {
          effectiveApiVersion = stored.apiVersion
        }
        if (!effectiveGeminiMode && stored.geminiMode) {
          effectiveGeminiMode = stored.geminiMode
        }
        if (!effectiveGeminiModel && stored.geminiModel) {
          effectiveGeminiModel = stored.geminiModel
        }
      }
    } catch (error) {
      console.warn('[run-turn] Failed to load stored API key:', error)
    }
  }

  if (!effectiveApiKey) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const { data: session, error: sessionError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    (from) =>
      from
        .select('id, owner_id, game_id, status, turn')
        .eq('id', sessionId)
        .maybeSingle(),
  )

  if (sessionError) {
    return res.status(400).json({ error: sessionError.message })
  }

  if (!session || session.owner_id !== user.id) {
    return res.status(403).json({ error: 'forbidden' })
  }

  if (gameId && session.game_id && session.game_id !== gameId) {
    return res.status(409).json({ error: 'session_game_mismatch' })
  }

  if (session.status && session.status !== 'active') {
    return res.status(409).json({ error: 'session_inactive' })
  }

  const result = await callChat({
    userApiKey: effectiveApiKey,
    system: typeof system === 'string' ? system : '',
    user: prompt,
    apiVersion: effectiveApiVersion || 'gemini',
    providerOptions:
      (effectiveApiVersion || 'gemini') === 'gemini'
        ? { geminiMode: effectiveGeminiMode, geminiModel: effectiveGeminiModel }
        : {},
  })

  if (result?.error) {
    return res.status(400).json(result)
  }

  const responseText =
    (typeof result?.text === 'string' && result.text.trim()) ||
    ''

  const promptRole = sanitizeRole(promptRoleInput, 'system')
  const responseRole = sanitizeRole(responseRoleInput, 'assistant')
  const responsePublic = coerceBoolean(responsePublicInput, true)

  const { data: lastTurn, error: lastError } = await withTableQuery(
    supabaseAdmin,
    'rank_turns',
    (from) =>
      from
        .select('idx')
        .eq('session_id', sessionId)
        .order('idx', { ascending: false })
        .limit(1)
        .maybeSingle(),
  )

  if (lastError) {
    return res.status(400).json({ error: lastError.message })
  }

  let nextIdx = 0
  const lastIdx = Number(lastTurn?.idx)
  if (Number.isFinite(lastIdx)) {
    nextIdx = Math.floor(lastIdx) + 1
  }

  const previousTurn = Number(session.turn) || 0
  const nextTurnNumber = previousTurn + 1

  const rows = []
  const trimmedPrompt = String(prompt)
  let currentIdx = nextIdx

  if (trimmedPrompt.trim().length) {
    const promptSummary = buildTurnSummaryPayload({
      role: promptRole,
      content: trimmedPrompt,
      session: { id: sessionId, turn: nextTurnNumber },
      idx: currentIdx,
    })

    rows.push({
      session_id: sessionId,
      idx: currentIdx,
      role: promptRole,
      public: false,
      is_visible: false,
      content: trimmedPrompt,
      summary_payload: promptSummary,
    })

    currentIdx += 1
  }

  if (responseText) {
    const responseSummary = buildTurnSummaryPayload({
      role: responseRole,
      content: responseText,
      prompt: trimmedPrompt,
      session: { id: sessionId, turn: nextTurnNumber },
      idx: currentIdx,
    })

    rows.push({
      session_id: sessionId,
      idx: currentIdx,
      role: responseRole,
      public: responsePublic,
      is_visible: responsePublic !== false,
      content: responseText,
      summary_payload: responseSummary,
    })
  }

  let inserted = []
  if (rows.length) {
    const { data: insertedRows, error: insertError } = await withTableQuery(
      supabaseAdmin,
      'rank_turns',
      (from) =>
        from.insert(rows).select('id, idx, role, public, is_visible, content, summary_payload, created_at'),
    )

    if (insertError) {
      return res.status(400).json({ error: insertError.message })
    }
    inserted = insertedRows || []
  }

  const now = new Date().toISOString()

  const { error: updateError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    (from) => from.update({ updated_at: now, turn: nextTurnNumber }).eq('id', sessionId),
  )

  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  return res.status(200).json({
    ...result,
    text: responseText,
    logged: rows.length > 0,
    entries: inserted,
    turn_number: nextTurnNumber,
  })
}
