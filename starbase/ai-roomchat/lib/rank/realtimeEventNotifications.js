import { supabaseAdmin } from '../supabaseAdmin'

const REALTIME_EVENT_NAME = 'rank:timeline-event'
const REALTIME_CHANNEL_PREFIX = process.env.RANK_REALTIME_EVENT_CHANNEL_PREFIX || 'rank-session'

const WEBHOOK_URL =
  process.env.RANK_REALTIME_EVENT_WEBHOOK_URL ||
  process.env.SLACK_RANK_REALTIME_EVENT_WEBHOOK_URL ||
  ''
const WEBHOOK_AUTH_HEADER =
  process.env.RANK_REALTIME_EVENT_WEBHOOK_AUTHORIZATION ||
  process.env.RANK_REALTIME_EVENT_WEBHOOK_TOKEN ||
  ''

function buildChannelName(sessionId) {
  const suffix = String(sessionId || '').trim()
  if (!suffix) return null
  return `${REALTIME_CHANNEL_PREFIX}:${suffix}`
}

function sanitizeEvents(events = []) {
  if (!Array.isArray(events)) return []
  return events
    .map((event) => {
      if (!event || typeof event !== 'object') return null
      const type = typeof event.type === 'string' ? event.type.trim() : ''
      if (!type) return null
      const ownerId =
        event.ownerId ??
        event.owner_id ??
        event.ownerID ??
        (typeof event.owner === 'string' ? event.owner : null) ??
        null
      const strike = Number.isFinite(Number(event.strike)) ? Number(event.strike) : null
      const remaining = Number.isFinite(Number(event.remaining)) ? Number(event.remaining) : null
      const limit = Number.isFinite(Number(event.limit)) ? Number(event.limit) : null
      const turn = Number.isFinite(Number(event.turn)) ? Number(event.turn) : null
      const rawTimestamp = Number.isFinite(Number(event.timestamp))
        ? Number(event.timestamp)
        : Date.parse(event.timestamp)
      const timestamp = Number.isFinite(rawTimestamp) ? rawTimestamp : Date.now()
      const id =
        event.id ||
        event.eventId ||
        (ownerId || type
          ? `${type}:${ownerId || 'unknown'}:${turn ?? 'na'}:${timestamp}`
          : null)

      return {
        id,
        type,
        ownerId,
        strike,
        remaining,
        limit,
        reason: event.reason || null,
        turn,
        timestamp,
        status: event.status || null,
      }
    })
    .filter(Boolean)
}

export async function broadcastRealtimeTimeline(sessionId, events, context = {}) {
  const channelName = buildChannelName(sessionId)
  if (!channelName) return false

  const payloadEvents = sanitizeEvents(events)
  if (!payloadEvents.length) return false

  const channel = supabaseAdmin.channel(channelName, {
    config: { broadcast: { ack: true } },
  })

  try {
    await channel.subscribe()
    const result = await channel.send({
      type: 'broadcast',
      event: REALTIME_EVENT_NAME,
      payload: {
        sessionId,
        emittedAt: new Date().toISOString(),
        context,
        events: payloadEvents,
      },
    })

    if (result !== 'ok') {
      throw new Error(`Realtime broadcast returned ${result}`)
    }

    return true
  } catch (error) {
    console.error('[realtime-events] Failed to broadcast timeline', {
      sessionId,
      error,
    })
    return false
  } finally {
    try {
      await channel.unsubscribe()
    } catch (unsubscribeError) {
      // ignore cleanup errors but surface in logs for debugging
      console.warn('[realtime-events] Failed to unsubscribe channel', {
        sessionId,
        error: unsubscribeError,
      })
    }
    supabaseAdmin.removeChannel(channel)
  }
}

function formatSlackText(event, { sessionId, gameId } = {}) {
  const lines = []
  const header =
    event.type === 'proxy_escalated'
      ? ':rotating_light: 대역 전환'
      : event.type === 'warning'
        ? ':warning: 경고 누적'
        : ':information_source: 실시간 이벤트'
  lines.push(header)

  if (event.ownerId) {
    lines.push(`• 플레이어: ${event.ownerId}`)
  }
  lines.push(`• 유형: ${event.type}`)
  if (event.turn != null) {
    lines.push(`• 턴: ${event.turn}`)
  }
  if (event.strike != null) {
    lines.push(`• 경고 누적: ${event.strike}회`)
  }
  if (event.remaining != null) {
    lines.push(`• 남은 기회: ${event.remaining}회`)
  }
  if (event.limit != null) {
    lines.push(`• 경고 한도: ${event.limit}회`)
  }
  if (event.reason) {
    lines.push(`• 사유: ${event.reason}`)
  }
  if (gameId) {
    lines.push(`• 게임 ID: ${gameId}`)
  }
  if (sessionId) {
    lines.push(`• 세션 ID: ${sessionId}`)
  }
  if (event.timestamp) {
    lines.push(`• 발생 시각: ${new Date(event.timestamp).toISOString()}`)
  }

  return lines.join('\n')
}

export async function notifyRealtimeTimelineWebhook(events, { sessionId, gameId } = {}) {
  if (!WEBHOOK_URL) return false
  const payloadEvents = sanitizeEvents(events)
  if (!payloadEvents.length) return false

  const textBlocks = payloadEvents.map((event) => formatSlackText(event, { sessionId, gameId }))
  const body = {
    type: 'rank.session.timeline',
    sessionId,
    gameId,
    events: payloadEvents,
    text: textBlocks.join('\n\n'),
  }

  const headers = { 'Content-Type': 'application/json' }
  if (WEBHOOK_AUTH_HEADER) {
    headers.Authorization = WEBHOOK_AUTH_HEADER
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Webhook responded with ${response.status} ${response.statusText}: ${detail}`)
    }

    return true
  } catch (error) {
    console.error('[realtime-events] Failed to notify webhook', {
      sessionId,
      gameId,
      error,
    })
    return false
  }
}
