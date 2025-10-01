// lib/rank/slotCleanup.js
//
// Worker helpers that keep rank game slots tidy. The functions in this file are
// intentionally isolated from API handlers so they can be reused by cron jobs,
// edge functions, or even local scripts when we need to sweep stale slot
// claims.

import { withTable } from '../supabaseTables'

const DEFAULT_TIMEOUT_MINUTES = 15

const FINALIZED_STATUSES = new Set([
  'defeated',
  'lost',
  'dead',
  'eliminated',
  'retired',
  'out',
  'kicked',
  'removed',
  'banned',
  'timeout',
  'timed_out',
  'expired',
  'disconnected',
])

const TIMEOUT_CANDIDATE_STATUSES = new Set([
  'ready',
  'waiting',
  'queued',
  'pending',
  'matching',
  'engaged',
])

const QUEUE_TIMEOUT_STATUSES = new Set(['timeout', 'expired', 'cancelled'])

function normalizeStatus(value) {
  if (!value || typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function parseTimestamp(value) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function buildParticipantKey(gameId, ownerId) {
  return `${gameId || ''}::${ownerId || ''}`
}

async function loadOccupiedSlots(supabaseClient, { gameId } = {}) {
  const result = await withTable(supabaseClient, 'rank_game_slots', (table) => {
    let query = supabaseClient
      .from(table)
      .select('id, game_id, role, hero_id, hero_owner_id, updated_at')
      .not('hero_owner_id', 'is', null)
    if (gameId) {
      query = query.eq('game_id', gameId)
    }
    return query
  })

  if (result?.error) {
    throw result.error
  }

  return Array.isArray(result?.data) ? result.data : []
}

async function loadParticipants(supabaseClient, { gameIds, ownerIds }) {
  if (!ownerIds.length || !gameIds.length) {
    return []
  }

  const result = await withTable(supabaseClient, 'rank_participants', (table) => {
    let query = supabaseClient
      .from(table)
      .select('id, game_id, owner_id, status, updated_at')
      .in('owner_id', ownerIds)

    query = gameIds.length === 1 ? query.eq('game_id', gameIds[0]) : query.in('game_id', gameIds)

    return query
  })

  if (result?.error) {
    throw result.error
  }

  return Array.isArray(result?.data) ? result.data : []
}

async function loadQueueStatuses(supabaseClient, { gameIds, ownerIds }) {
  if (!ownerIds.length || !gameIds.length) {
    return []
  }

  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient
      .from(table)
      .select('id, game_id, owner_id, status, joined_at, updated_at')
      .in('owner_id', ownerIds)

    query = gameIds.length === 1 ? query.eq('game_id', gameIds[0]) : query.in('game_id', gameIds)

    return query
  })

  if (result?.error) {
    throw result.error
  }

  return Array.isArray(result?.data) ? result.data : []
}

function evaluateRelease({ slot, participant, queueEntry, nowMs, timeoutMs }) {
  if (!slot?.hero_owner_id) {
    return { release: false }
  }

  if (!participant) {
    return { release: true, reason: 'missing_participant' }
  }

  const status = normalizeStatus(participant.status)
  if (FINALIZED_STATUSES.has(status)) {
    if (status === 'kicked') {
      return { release: true, reason: 'host_kick' }
    }
    if (status === 'timeout' || status === 'timed_out' || status === 'expired') {
      return { release: true, reason: 'timeout_status' }
    }
    return { release: true, reason: `final_status_${status || 'unknown'}` }
  }

  const queueStatus = normalizeStatus(queueEntry?.status)
  if (queueStatus && QUEUE_TIMEOUT_STATUSES.has(queueStatus)) {
    return { release: true, reason: `queue_${queueStatus}` }
  }

  if (!timeoutMs || timeoutMs <= 0) {
    return { release: false }
  }

  const slotUpdatedMs = parseTimestamp(slot.updated_at)
  const participantUpdatedMs = parseTimestamp(participant.updated_at)
  const queueUpdatedMs = parseTimestamp(queueEntry?.updated_at || queueEntry?.joined_at)

  const staleSlot = slotUpdatedMs ? nowMs - slotUpdatedMs > timeoutMs : true
  const staleParticipant = participantUpdatedMs ? nowMs - participantUpdatedMs > timeoutMs : true
  const staleQueue = queueUpdatedMs ? nowMs - queueUpdatedMs > timeoutMs : true

  if (
    TIMEOUT_CANDIDATE_STATUSES.has(status) &&
    staleSlot &&
    staleParticipant &&
    staleQueue
  ) {
    return { release: true, reason: 'timeout_stale' }
  }

  return { release: false }
}

export async function releaseStaleSlots(
  supabaseClient,
  { gameId = null, olderThanMinutes = DEFAULT_TIMEOUT_MINUTES } = {},
) {
  const slots = await loadOccupiedSlots(supabaseClient, { gameId })
  if (!slots.length) {
    return { ok: true, processed: 0, released: 0, reasons: [] }
  }

  const gameIds = Array.from(new Set(slots.map((slot) => slot.game_id).filter(Boolean)))
  const ownerIds = Array.from(new Set(slots.map((slot) => slot.hero_owner_id).filter(Boolean)))

  const [participants, queueEntries] = await Promise.all([
    loadParticipants(supabaseClient, { gameIds, ownerIds }),
    loadQueueStatuses(supabaseClient, { gameIds, ownerIds }),
  ])

  const participantMap = new Map()
  participants.forEach((participant) => {
    const key = buildParticipantKey(participant.game_id, participant.owner_id)
    participantMap.set(key, participant)
  })

  const queueMap = new Map()
  queueEntries.forEach((entry) => {
    const key = buildParticipantKey(entry.game_id, entry.owner_id)
    queueMap.set(key, entry)
  })

  const nowMs = Date.now()
  const timeoutMs = Number.isFinite(Number(olderThanMinutes))
    ? Math.max(Number(olderThanMinutes), 0) * 60 * 1000
    : DEFAULT_TIMEOUT_MINUTES * 60 * 1000

  const releases = []

  slots.forEach((slot) => {
    const key = buildParticipantKey(slot.game_id, slot.hero_owner_id)
    const participant = participantMap.get(key) || null
    const queueEntry = queueMap.get(key) || null
    const evaluation = evaluateRelease({ slot, participant, queueEntry, nowMs, timeoutMs })
    if (evaluation.release) {
      releases.push({ slot, participant, reason: evaluation.reason })
    }
  })

  if (!releases.length) {
    return { ok: true, processed: slots.length, released: 0, reasons: [] }
  }

  const nowIso = new Date(nowMs).toISOString()
  const slotIds = releases.map((entry) => entry.slot.id)

  const updateResult = await withTable(supabaseClient, 'rank_game_slots', (table) =>
    supabaseClient
      .from(table)
      .update({ hero_id: null, hero_owner_id: null, updated_at: nowIso })
      .in('id', slotIds),
  )

  if (updateResult?.error) {
    throw updateResult.error
  }

  const statusesToUpdate = []
  releases.forEach(({ participant, reason }) => {
    if (!participant?.id) return
    const status = normalizeStatus(participant.status)
    if (FINALIZED_STATUSES.has(status)) return
    if (reason === 'timeout_stale' || reason === 'timeout_status') {
      statusesToUpdate.push({ id: participant.id, status: 'timeout' })
    } else if (reason === 'missing_participant') {
      statusesToUpdate.push({ id: participant.id, status: 'out' })
    }
  })

  if (statusesToUpdate.length) {
    const grouped = new Map()
    statusesToUpdate.forEach(({ id, status }) => {
      const key = status || 'out'
      const bucket = grouped.get(key) || []
      bucket.push(id)
      grouped.set(key, bucket)
    })

    for (const [status, ids] of grouped.entries()) {
      const statusResult = await withTable(supabaseClient, 'rank_participants', (table) =>
        supabaseClient
          .from(table)
          .update({ status, updated_at: nowIso })
          .in('id', ids),
      )

      if (statusResult?.error) {
        throw statusResult.error
      }
    }
  }

  return {
    ok: true,
    processed: slots.length,
    released: releases.length,
    reasons: releases.map(({ slot, reason }) => ({
      slot_id: slot.id,
      game_id: slot.game_id,
      owner_id: slot.hero_owner_id,
      reason,
    })),
  }
}

