import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing Supabase configuration for sessions API')
}

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
})

function clamp(value, { min, max, fallback }) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  if (min != null && numeric < min) {
    return min
  }
  if (max != null && numeric > max) {
    return max
  }
  return numeric
}

function mapTurn(row) {
  return {
    id: row.id,
    idx: row.idx,
    role: row.role,
    public: row.public !== false,
    is_visible: row.is_visible !== false,
    content: row.content,
    summary_payload: row.summary_payload || null,
    created_at: row.created_at,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: authData, error: authError } = await anonClient.auth.getUser(token)
  const viewer = authData?.user || null
  if (authError || !viewer) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { gameId, limit: rawLimit, turnLimit: rawTurnLimit } = req.query || {}
  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const limit = clamp(rawLimit, { min: 1, max: 20, fallback: 5 })
  const turnLimit = clamp(rawTurnLimit, { min: 1, max: 80, fallback: 30 })

  const { data: sessionRows, error: sessionError } = await supabaseAdmin
    .from('rank_sessions')
    .select('id, game_id, owner_id, status, turn, created_at, updated_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (sessionError) {
    return res.status(400).json({ error: sessionError.message })
  }

  const sessions = Array.isArray(sessionRows) ? sessionRows : []
  const sessionIds = sessions.map((session) => session.id).filter(Boolean)

  let turnsBySession = new Map()

  if (sessionIds.length) {
    const { data: turnRows, error: turnError } = await supabaseAdmin
      .from('rank_turns')
      .select('id, session_id, idx, role, public, is_visible, content, summary_payload, created_at')
      .in('session_id', sessionIds)
      .order('session_id', { ascending: true })
      .order('idx', { ascending: true })

    if (turnError) {
      return res.status(400).json({ error: turnError.message })
    }

    turnsBySession = new Map()
    ;(Array.isArray(turnRows) ? turnRows : []).forEach((turn) => {
      if (!turn?.session_id) return
      if (!turnsBySession.has(turn.session_id)) {
        turnsBySession.set(turn.session_id, [])
      }
      turnsBySession.get(turn.session_id).push(turn)
    })
  }

  const viewerId = viewer.id

  const payload = sessions.map((session) => {
    const rawTurns = turnsBySession.get(session.id) || []
    const viewerIsOwner = !!viewerId && session.owner_id === viewerId

    const visibleTurns = viewerIsOwner
      ? rawTurns
      : rawTurns.filter((turn) => turn?.public !== false && turn?.is_visible !== false)

    const limitedTurns = turnLimit > 0 ? visibleTurns.slice(-turnLimit) : visibleTurns
    const hiddenPrivateCount = viewerIsOwner
      ? 0
      : rawTurns.length - visibleTurns.length
    const trimmedCount = Math.max(visibleTurns.length - limitedTurns.length, 0)

    const latestSummarySource = [...rawTurns].reverse().find((turn) => turn?.summary_payload)

    return {
      id: session.id,
      owner_id: session.owner_id,
      status: session.status,
      turn: session.turn,
      created_at: session.created_at,
      updated_at: session.updated_at,
      viewer_is_owner: viewerIsOwner,
      total_visible_turns: visibleTurns.length,
      hidden_private_count: hiddenPrivateCount,
      trimmed_count: trimmedCount,
      latest_summary: latestSummarySource?.summary_payload || null,
      turns: limitedTurns.map(mapTurn),
    }
  })

  const nextCursor = sessions.length === limit ? sessions[sessions.length - 1]?.created_at ?? null : null

  return res.status(200).json({ sessions: payload, nextCursor })
}
