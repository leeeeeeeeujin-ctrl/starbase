import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { mapTimelineRowToEvent, sanitizeTimelineEvents } from '@/lib/rank/timelineEvents'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const supabaseUrl = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
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

  const { gameId, limit: rawLimit, turnLimit: rawTurnLimit, timelineLimit: rawTimelineLimit } = req.query || {}
  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const limit = clamp(rawLimit, { min: 1, max: 20, fallback: 5 })
  const turnLimit = clamp(rawTurnLimit, { min: 1, max: 80, fallback: 30 })
  const timelineLimit = clamp(rawTimelineLimit, { min: 0, max: 120, fallback: 40 })

  const { data: sessionRows, error: sessionError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    (from) =>
      from
        .select('id, game_id, owner_id, status, turn, created_at, updated_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(limit),
  )

  if (sessionError) {
    return res.status(400).json({ error: sessionError.message })
  }

  const sessions = Array.isArray(sessionRows) ? sessionRows : []
  const sessionIds = sessions.map((session) => session.id).filter(Boolean)

  let turnsBySession = new Map()
  let timelineBySession = new Map()

  if (sessionIds.length) {
    const { data: turnRows, error: turnError } = await withTableQuery(
      supabaseAdmin,
      'rank_turns',
      (from) =>
        from
          .select('id, session_id, idx, role, public, is_visible, content, summary_payload, created_at')
          .in('session_id', sessionIds)
          .order('session_id', { ascending: true })
          .order('idx', { ascending: true }),
    )

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

  if (timelineLimit > 0 && sessionIds.length) {
    const totalLimit = timelineLimit * sessionIds.length
    const { data: timelineRows, error: timelineError } = await withTableQuery(
      supabaseAdmin,
      'rank_session_timeline_events',
      (from) =>
        from
          .select(
            'session_id, game_id, event_id, event_type, owner_id, reason, strike, remaining, limit, status, turn, event_timestamp, context, metadata',
          )
          .in('session_id', sessionIds)
          .order('event_timestamp', { ascending: false })
          .limit(totalLimit),
    )

    if (timelineError) {
      return res.status(400).json({ error: timelineError.message })
    }

    timelineBySession = new Map()
    ;(Array.isArray(timelineRows) ? timelineRows : []).forEach((row) => {
      if (!row?.session_id) return
      const event = mapTimelineRowToEvent(row, { defaultTurn: row?.turn })
      if (!event) return
      if (!timelineBySession.has(row.session_id)) {
        timelineBySession.set(row.session_id, [])
      }
      const bucket = timelineBySession.get(row.session_id)
      if (bucket.length >= timelineLimit) {
        return
      }
      bucket.push(event)
    })

    timelineBySession.forEach((bucket, key) => {
      if (Array.isArray(bucket)) {
        bucket.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      } else {
        timelineBySession.set(key, [])
      }
    })
  }

  let battleLogsBySession = new Map()
  if (sessionIds.length) {
    const { data: battleRows, error: battleError } = await withTableQuery(
      supabaseAdmin,
      'rank_session_battle_logs',
      (from) =>
        from
          .select('session_id, result, reason, payload, created_at, updated_at')
          .in('session_id', sessionIds),
    )

    if (battleError) {
      return res.status(400).json({ error: battleError.message })
    }

    battleLogsBySession = new Map()
    ;(Array.isArray(battleRows) ? battleRows : []).forEach((row) => {
      if (!row?.session_id) return
      battleLogsBySession.set(row.session_id, row)
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

    const timelineEvents = sanitizeTimelineEvents(timelineBySession.get(session.id) || [])

    const battleRow = battleLogsBySession.get(session.id) || null
    let battleLog = null
    if (battleRow && typeof battleRow === 'object') {
      let payload = null
      if (battleRow.payload && typeof battleRow.payload === 'object') {
        try {
          payload = JSON.parse(JSON.stringify(battleRow.payload))
        } catch (error) {
          payload = null
        }
      }
      battleLog = {
        result: battleRow.result || null,
        reason: battleRow.reason || null,
        payload,
        created_at: battleRow.created_at || null,
        updated_at: battleRow.updated_at || null,
      }
    }

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
      timeline_events: timelineEvents,
      battle_log: battleLog,
    }
  })

  const nextCursor = sessions.length === limit ? sessions[sessions.length - 1]?.created_at ?? null : null

  return res.status(200).json({ sessions: payload, nextCursor })
}
