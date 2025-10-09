import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for session-meta API')
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
})

function parseBody(req) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return { error: 'invalid_payload' }
    }
  }
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_payload' }
  }
  return { payload }
}

function toTrimmedString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toOptionalUuid(value) {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return null
  return trimmed
}

function toOptionalInteger(value, { min = null } = {}) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const rounded = Math.floor(numeric)
  if (min !== null && rounded < min) return null
  return rounded
}

function safeClone(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return null
  }
}

const REALTIME_MODES = ['off', 'standard', 'pulse']

function sanitizeRealtimeMode(value) {
  const trimmed = toTrimmedString(value).toLowerCase()
  if (!trimmed) return 'off'
  if (REALTIME_MODES.includes(trimmed)) return trimmed
  return 'off'
}

function sanitizeMeta(rawMeta = {}) {
  const meta = typeof rawMeta === 'object' && rawMeta !== null ? rawMeta : {}
  const selected =
    toOptionalInteger(
      meta.selected_time_limit_seconds ?? meta.selectedTimeLimitSeconds ?? meta.turnTimerSeconds,
      { min: 1 },
    ) || null
  const dropInBonus =
    toOptionalInteger(meta.drop_in_bonus_seconds ?? meta.dropInBonusSeconds ?? meta.dropInBonus, {
      min: 0,
    }) || null
  const realtime = sanitizeRealtimeMode(meta.realtime_mode ?? meta.realtimeMode)
  const timeVote = safeClone(meta.time_vote ?? meta.timeVote)
  const turnState = safeClone(meta.turn_state ?? meta.turnState)
  const asyncFill = safeClone(meta.async_fill_snapshot ?? meta.asyncFillSnapshot)

  return {
    selected_time_limit_seconds: selected,
    drop_in_bonus_seconds: dropInBonus,
    realtime_mode: realtime,
    time_vote: timeVote,
    turn_state: turnState,
    async_fill_snapshot: asyncFill,
  }
}

function sanitizeTurnStateEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const turnState = safeClone(rawEvent.turn_state ?? rawEvent.turnState)
  if (!turnState) return null
  const turnNumber = toOptionalInteger(rawEvent.turn_number ?? rawEvent.turnNumber, { min: 0 })
  const emitter = toOptionalUuid(rawEvent.emitter_id ?? rawEvent.emitterId)
  const source = toTrimmedString(rawEvent.source)
  const extras = safeClone(rawEvent.extras)
  return {
    turn_state: turnState,
    turn_number: turnNumber,
    emitter_id: emitter,
    source: source || null,
    extras: extras || null,
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
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { payload, error } = parseBody(req)
  if (error) {
    return res.status(400).json({ error })
  }

  const sessionId = toOptionalUuid(payload.session_id ?? payload.sessionId)
  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' })
  }

  const metaPayload = sanitizeMeta(payload.meta)
  const eventPayload = sanitizeTurnStateEvent(payload.turn_state_event ?? payload.turnStateEvent)
  const rpcPayload = {
    p_session_id: sessionId,
    p_selected_time_limit: metaPayload.selected_time_limit_seconds,
    p_time_vote: metaPayload.time_vote,
    p_drop_in_bonus_seconds: metaPayload.drop_in_bonus_seconds,
    p_turn_state: metaPayload.turn_state,
    p_async_fill_snapshot: metaPayload.async_fill_snapshot,
    p_realtime_mode: metaPayload.realtime_mode,
  }

  const { data: metaResult, error: metaError } = await supabaseAdmin.rpc(
    'upsert_match_session_meta',
    rpcPayload,
  )

  if (metaError) {
    console.error('[session-meta] upsert failed:', metaError)
    return res.status(500).json({ error: 'upsert_failed' })
  }

  let eventResult = null
  if (eventPayload) {
    const { data: eventData, error: eventError } = await supabaseAdmin.rpc(
      'enqueue_rank_turn_state_event',
      {
        p_session_id: sessionId,
        p_turn_state: eventPayload.turn_state,
        p_turn_number: eventPayload.turn_number,
        p_source: eventPayload.source,
        p_emitter: eventPayload.emitter_id,
        p_extras: eventPayload.extras,
      },
    )
    if (eventError) {
      console.error('[session-meta] enqueue event failed:', eventError)
    } else {
      eventResult = eventData
    }
  }

  return res.status(200).json({
    ok: true,
    meta: Array.isArray(metaResult) ? metaResult[0] || null : metaResult || null,
    event: Array.isArray(eventResult) ? eventResult[0] || null : eventResult || null,
  })
}
