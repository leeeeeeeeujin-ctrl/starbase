import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for save-battle-log API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

function sanitizeDraft(input) {
  if (!input || typeof input !== 'object') {
    return null
  }

  try {
    return JSON.parse(JSON.stringify(input))
  } catch (error) {
    return null
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

  const { game_id: gameId, session_id: sessionId, draft } = payload || {}

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'missing_session_id' })
  }

  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const normalizedDraft = sanitizeDraft(draft)
  if (!normalizedDraft) {
    return res.status(400).json({ error: 'invalid_draft' })
  }

  const meta = normalizedDraft.meta || {}
  if (meta.sessionId && meta.sessionId !== sessionId) {
    return res.status(400).json({ error: 'session_mismatch' })
  }
  if (meta.gameId && meta.gameId !== gameId) {
    return res.status(400).json({ error: 'game_mismatch' })
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('rank_sessions')
    .select('id, owner_id, game_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError) {
    return res.status(400).json({ error: sessionError.message })
  }

  if (!session || session.owner_id !== user.id) {
    return res.status(403).json({ error: 'forbidden' })
  }

  if (session.game_id && session.game_id !== gameId) {
    return res.status(409).json({ error: 'session_game_mismatch' })
  }

  const now = new Date().toISOString()
  const resultLabel = typeof meta.result === 'string' ? meta.result : null
  const reasonLabel = typeof meta.reason === 'string' ? meta.reason : null

  const upsertPayload = {
    session_id: sessionId,
    game_id: gameId,
    owner_id: user.id,
    result: resultLabel,
    reason: reasonLabel,
    payload: normalizedDraft,
    updated_at: now,
  }

  try {
    const { error: upsertError } = await supabaseAdmin
      .from('rank_session_battle_logs')
      .upsert(upsertPayload, { onConflict: 'session_id' })

    if (upsertError) {
      throw upsertError
    }
  } catch (error) {
    return res.status(500).json({ error: 'failed_to_save', detail: error.message || String(error) })
  }

  return res.status(200).json({ ok: true })
}

