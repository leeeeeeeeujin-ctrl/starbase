import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'
import { withTableQuery } from '@/lib/supabaseTables'
import { buildDropInExtensionTimelineEvent } from '@/lib/rank/dropInTimeline'
import { mapTimelineEventToRow } from '@/lib/rank/timelineEvents'
import {
  broadcastRealtimeTimeline,
  notifyRealtimeTimelineWebhook,
} from '@/lib/rank/realtimeEventNotifications'

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

function parseCollaborators(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return []
  const unique = new Set()
  rawList.forEach((value) => {
    const normalized = toOptionalUuid(value)
    if (normalized) {
      unique.add(normalized)
    }
  })
  return Array.from(unique)
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

async function resolveSessionRoomId(sessionId, { fallbackRoomId = null, sessionOwnerId = null } = {}) {
  const normalizedSessionId = toOptionalUuid(sessionId)
  if (!normalizedSessionId) return null

  try {
    const { data, error } = await withTableQuery(supabaseAdmin, 'rank_matchmaking_logs', (from) =>
      from
        .select('room_id')
        .eq('session_id', normalizedSessionId)
        .order('created_at', { ascending: false })
        .limit(1),
    )

    if (error) {
      console.error('[session-meta] session room lookup failed:', error)
      return null
    }

    const row = Array.isArray(data) && data.length ? data[0] : null
    const matchedRoomId = toOptionalUuid(row?.room_id)
    if (matchedRoomId) {
      return matchedRoomId
    }
  } catch (lookupError) {
    console.error('[session-meta] session room query error:', lookupError)
  }

  const normalizedOwnerId = toOptionalUuid(sessionOwnerId)
  const normalizedFallbackRoomId = toOptionalUuid(fallbackRoomId)

  if (!normalizedFallbackRoomId || !normalizedOwnerId) {
    return null
  }

  try {
    const { data: roomRow, error: roomError } = await withTableQuery(supabaseAdmin, 'rank_rooms', (from) =>
      from.select('id').eq('id', normalizedFallbackRoomId).eq('owner_id', normalizedOwnerId).maybeSingle(),
    )

    if (roomError) {
      console.error('[session-meta] fallback room lookup failed:', roomError)
      return null
    }

    if (roomRow?.id === normalizedFallbackRoomId) {
      return normalizedFallbackRoomId
    }
  } catch (fallbackError) {
    console.error('[session-meta] fallback room query error:', fallbackError)
  }

  return null
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
  const userId = toOptionalUuid(userData?.user?.id)
  if (userError || !userId) {
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

  const gameId = toOptionalUuid(payload.game_id ?? payload.gameId)
  const roomId = toOptionalUuid(payload.room_id ?? payload.roomId)
  const matchInstanceId = toTrimmedString(payload.match_instance_id ?? payload.matchInstanceId)
  const collaborators = parseCollaborators(
    payload.collaborators ?? payload.shared_owners ?? payload.sharedOwners,
  )

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const {
    data: sessionRow,
    error: sessionError,
  } = await withTableQuery(userClient, 'rank_sessions', (from) =>
    from.select('id, owner_id, game_id').eq('id', sessionId).maybeSingle(),
  )

  if (sessionError) {
    console.error('[session-meta] session lookup failed:', sessionError)
    return res.status(400).json({ error: 'session_lookup_failed' })
  }

  if (!sessionRow) {
    return res.status(404).json({ error: 'session_not_found' })
  }

  const ownerId = toOptionalUuid(sessionRow.owner_id)
  const sessionGameId = toOptionalUuid(sessionRow.game_id)

  let authorized = !!ownerId && ownerId === userId
  let sessionRoomId = null

  if (!authorized) {
    sessionRoomId = await resolveSessionRoomId(sessionId, {
      fallbackRoomId: roomId,
      sessionOwnerId: ownerId,
    })
  }

  if (!authorized && sessionRoomId) {
    try {
      const { data: slotRow, error: slotError } = await withTableQuery(
        supabaseAdmin,
        'rank_room_slots',
        (from) =>
          from
            .select('occupant_owner_id, room_id')
            .eq('room_id', sessionRoomId)
            .eq('occupant_owner_id', userId)
            .maybeSingle(),
      )
      if (slotError) {
        console.error('[session-meta] room slot lookup failed:', slotError)
      } else if (slotRow) {
        let roomMatchesSession = true

        if (ownerId || sessionGameId) {
          try {
            const { data: roomRow, error: roomError } = await withTableQuery(
              supabaseAdmin,
              'rank_rooms',
              (from) => from.select('id, owner_id, game_id').eq('id', sessionRoomId).maybeSingle(),
            )

            if (roomError) {
              console.error('[session-meta] room lookup failed:', roomError)
              roomMatchesSession = false
            } else if (!roomRow) {
              roomMatchesSession = false
            } else {
              if (ownerId) {
                const roomOwnerId = toOptionalUuid(roomRow.owner_id)
                if (!roomOwnerId || roomOwnerId !== ownerId) {
                  roomMatchesSession = false
                }
              }

              if (roomMatchesSession && sessionGameId) {
                const roomGameId = toOptionalUuid(roomRow.game_id)
                if (roomGameId && roomGameId !== sessionGameId) {
                  roomMatchesSession = false
                }
              }
            }
          } catch (roomQueryError) {
            console.error('[session-meta] room query error:', roomQueryError)
            roomMatchesSession = false
          }
        }

        if (roomMatchesSession) {
          authorized = true
        }
      }
    } catch (roomError) {
      console.error('[session-meta] room slot query error:', roomError)
    }
  }

  if (!authorized && matchInstanceId) {
    try {
      const { data: rosterRow, error: rosterError } = await withTableQuery(
        supabaseAdmin,
        'rank_match_roster',
        (from) =>
          from
            .select('owner_id, game_id')
            .eq('match_instance_id', matchInstanceId)
            .eq('owner_id', userId)
            .maybeSingle(),
      )
      if (rosterError) {
        console.error('[session-meta] match roster lookup failed:', rosterError)
      } else if (rosterRow) {
        const rosterGameId = toOptionalUuid(rosterRow.game_id)
        if (!sessionGameId || !rosterGameId || rosterGameId === sessionGameId) {
          authorized = true
        }
      }
    } catch (rosterError) {
      console.error('[session-meta] match roster query error:', rosterError)
    }
  }

  if (!authorized && collaborators.length && collaborators.includes(userId)) {
    const participantGameId = sessionGameId || gameId
    if (participantGameId) {
      try {
        const { data: participantRow, error: participantError } = await withTableQuery(
          supabaseAdmin,
          'rank_participants',
          (from) =>
            from
              .select('owner_id, game_id')
              .eq('game_id', participantGameId)
              .eq('owner_id', userId)
              .maybeSingle(),
        )
        if (participantError) {
          console.error('[session-meta] participant lookup failed:', participantError)
        } else if (participantRow) {
          authorized = true
        }
      } catch (participantError) {
        console.error('[session-meta] participant query error:', participantError)
      }
    }
  }

  if (!authorized) {
    console.warn('[session-meta] unauthorized session meta attempt', {
      sessionId,
      userId,
    })
    return res.status(403).json({ error: 'forbidden' })
  }

  if (gameId && sessionGameId && sessionGameId !== gameId) {
    return res.status(409).json({ error: 'session_game_mismatch' })
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
  let timelineEvent = null
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

      const bonusSeconds = Number(
        eventPayload.extras?.dropInBonusSeconds ??
          eventPayload.turn_state?.dropInBonusSeconds ??
          metaPayload.drop_in_bonus_seconds ??
          0,
      )

      if (bonusSeconds > 0 && eventPayload.extras?.dropIn) {
        const appliedAt = Number(
          eventPayload.extras?.dropInBonusAppliedAt ??
            eventPayload.turn_state?.dropInBonusAppliedAt ??
            metaPayload.turn_state?.dropInBonusAppliedAt ??
            Date.now(),
        )

        const timelineCandidate = buildDropInExtensionTimelineEvent({
          extraSeconds: bonusSeconds,
          appliedAt,
          hasActiveDeadline:
            Number.isFinite(Number(eventPayload.turn_state?.deadline)) &&
            Number(eventPayload.turn_state.deadline) > 0,
          dropInMeta: eventPayload.extras.dropIn,
          arrivals: eventPayload.extras.dropIn.arrivals || [],
          mode: metaPayload.realtime_mode,
          turnNumber:
            eventPayload.turn_number ??
            eventPayload.turn_state?.turnNumber ??
            metaPayload.turn_state?.turnNumber ??
            null,
        })

        if (timelineCandidate) {
          const row = mapTimelineEventToRow(timelineCandidate, {
            sessionId,
            gameId: gameId || null,
          })

          if (row) {
            try {
              const { error: timelineError } = await withTableQuery(
                supabaseAdmin,
                'rank_session_timeline_events',
                (from) =>
                  from.upsert([row], {
                    onConflict: 'event_id',
                    ignoreDuplicates: false,
                  }),
              )

              if (!timelineError) {
                timelineEvent = timelineCandidate
                await broadcastRealtimeTimeline(sessionId, [timelineCandidate], {
                  turn: timelineCandidate.turn ?? null,
                  gameId: gameId || null,
                })
                await notifyRealtimeTimelineWebhook([timelineCandidate], {
                  sessionId,
                  gameId: gameId || null,
                })
              } else {
                console.error('[session-meta] timeline upsert failed', timelineError)
              }
            } catch (timelineError) {
              console.error('[session-meta] timeline persistence error', timelineError)
            }
          }
        }
      }
    }
  }

  return res.status(200).json({
    ok: true,
    meta: Array.isArray(metaResult) ? metaResult[0] || null : metaResult || null,
    event: Array.isArray(eventResult) ? eventResult[0] || null : eventResult || null,
    timelineEvent,
  })
}
