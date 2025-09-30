// pages/api/rank/run-turn.js
import { createClient } from '@supabase/supabase-js'

import { callChat } from '@/lib/rank/ai'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
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
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('rank_sessions')
    .select('id, owner_id, game_id, status, turn')
    .eq('id', sessionId)
    .maybeSingle()

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
    userApiKey: apiKey,
    system: typeof system === 'string' ? system : '',
    user: prompt,
    apiVersion,
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

  const { data: lastTurn, error: lastError } = await supabaseAdmin
    .from('rank_turns')
    .select('idx')
    .eq('session_id', sessionId)
    .order('idx', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastError) {
    return res.status(400).json({ error: lastError.message })
  }

  let nextIdx = 0
  const lastIdx = Number(lastTurn?.idx)
  if (Number.isFinite(lastIdx)) {
    nextIdx = Math.floor(lastIdx) + 1
  }

  const rows = []
  const trimmedPrompt = String(prompt)
  if (trimmedPrompt.trim().length) {
    rows.push({
      session_id: sessionId,
      idx: nextIdx,
      role: promptRole,
      public: false,
      content: trimmedPrompt,
    })
  }

  if (responseText) {
    rows.push({
      session_id: sessionId,
      idx: nextIdx + rows.length,
      role: responseRole,
      public: responsePublic,
      content: responseText,
    })
  }

  let inserted = []
  if (rows.length) {
    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('rank_turns')
      .insert(rows)
      .select('id, idx, role, public, content, created_at')

    if (insertError) {
      return res.status(400).json({ error: insertError.message })
    }
    inserted = insertedRows || []
  }

  const now = new Date().toISOString()
  const previousTurn = Number(session.turn) || 0
  const nextTurnNumber = previousTurn + 1

  const { error: updateError } = await supabaseAdmin
    .from('rank_sessions')
    .update({ updated_at: now, turn: nextTurnNumber })
    .eq('id', sessionId)

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
