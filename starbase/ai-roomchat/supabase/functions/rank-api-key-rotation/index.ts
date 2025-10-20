import { serve } from 'https://deno.land/std@0.192.0/http/server.ts'

import { supabase } from '../_shared/supabaseClient.ts'
import {
  mapTimelineEventToRow,
  sanitizeTimelineEvents,
} from '../_shared/timeline.ts'
import {
  broadcastTimelineEvents,
  notifyTimelineWebhook,
} from '../_shared/notifications.ts'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
}

async function parsePayload(req: Request): Promise<Record<string, unknown> | null> {
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const data = await req.json()
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
    }
    const text = await req.text()
    if (!text) return null
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch (error) {
    console.error('[rank-api-key-rotation] Failed to parse payload', { error })
    return null
  }
}

function safeString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function safeNumber(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value == null) return null
  const text = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(text)) return true
  if (['false', '0', 'no', 'n'].includes(text)) return false
  return null
}

function buildMetadata(payload: Record<string, unknown>) {
  const timestamp =
    safeNumber(payload.timestamp) ??
    safeNumber(payload.occurred_at) ??
    safeNumber(payload.occurredAt) ??
    (() => {
      const iso = safeString(payload.occurred_at) ?? safeString(payload.occurredAt)
      const parsed = iso ? Date.parse(iso) : NaN
      return Number.isFinite(parsed) ? parsed : null
    })() ??
    Date.now()

  const reason =
    safeString(payload.reason) ??
    safeString(payload.reason_code) ??
    safeString(payload.reasonCode) ??
    null

  const viewerId =
    safeString(payload.viewer_id) ??
    safeString(payload.viewerId) ??
    null

  const newSample =
    safeString(payload.new_sample) ??
    safeString(payload.newSample) ??
    safeString(payload.key_sample) ??
    safeString(payload.keySample) ??
    null

  const replacedSample =
    safeString(payload.replaced_sample) ??
    safeString(payload.replacedSample) ??
    safeString(payload.previous_sample) ??
    safeString(payload.previousSample) ??
    null

  return {
    timestamp,
    reason,
    viewerId,
    newSample,
    replacedSample,
    metadata: {
      apiKeyPool: {
        source:
          safeString(payload.source) ??
          safeString(payload.pool_source) ??
          'edge:rank-api-key-rotation',
        provider:
          safeString(payload.provider) ??
          safeString(payload.api_provider) ??
          null,
        poolId:
          safeString(payload.pool_id) ??
          safeString(payload.poolId) ??
          null,
        rotationId:
          safeString(payload.rotation_id) ??
          safeString(payload.rotationId) ??
          null,
        reason,
        note: safeString(payload.note) ?? null,
        newSample,
        replacedSample,
        viewerId,
        poolSize:
          safeNumber(payload.pool_size) ??
          safeNumber(payload.poolSize) ??
          null,
        exhaustedCount:
          safeNumber(payload.exhausted_count) ??
          safeNumber(payload.exhaustedCount) ??
          null,
        available:
          safeNumber(payload.available) ??
          safeNumber(payload.available_count) ??
          null,
        cleared: safeBoolean(payload.cleared) ?? (newSample ? false : true),
      },
    },
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, {
      status: 405,
      headers: { Allow: 'POST' },
    })
  }

  const payload = await parsePayload(req)
  if (!payload) {
    return jsonResponse({ error: 'invalid_payload' }, { status: 400 })
  }

  const sessionId =
    safeString(payload.session_id) ??
    safeString(payload.sessionId) ??
    null
  const gameId = safeString(payload.game_id) ?? safeString(payload.gameId) ?? null

  if (!sessionId) {
    return jsonResponse({ error: 'missing_session_id' }, { status: 400 })
  }

  const meta = buildMetadata(payload)
  const turn =
    safeNumber(payload.turn) ??
    safeNumber(payload.turn_number) ??
    safeNumber(payload.turnNumber) ??
    null

  const reason = meta.reason ?? (meta.newSample ? 'updated' : 'cleared')

  const context = {
    actorLabel: '시스템',
    provider: meta.metadata.apiKeyPool.provider,
    source: meta.metadata.apiKeyPool.source,
    note: meta.metadata.apiKeyPool.note,
  }

  const event = {
    type: 'api_key_pool_replaced',
    ownerId: meta.viewerId,
    reason,
    turn,
    timestamp: meta.timestamp,
    context,
    metadata: meta.metadata,
    sessionId,
    gameId,
  }

  const row = mapTimelineEventToRow(event, { sessionId, gameId })
  if (!row || !row.event_id) {
    return jsonResponse({ error: 'invalid_event' }, { status: 400 })
  }

  const { error } = await supabase
    .from('rank_session_timeline_events')
    .upsert(row, { onConflict: 'event_id' })

  if (error) {
    console.error('[rank-api-key-rotation] Failed to persist timeline event', {
      sessionId,
      error,
    })
    return jsonResponse({ error: 'timeline_persist_failed', detail: error.message }, { status: 500 })
  }

  await Promise.allSettled([
    broadcastTimelineEvents(sessionId, [event], { source: 'edge:rank-api-key-rotation' }),
    notifyTimelineWebhook([event], { sessionId, gameId }),
  ])

  const [sanitized] = sanitizeTimelineEvents([event], { defaultTurn: turn ?? null })

  return jsonResponse({ success: true, event: sanitized ?? null })
})
