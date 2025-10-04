const DEFAULT_EVENT_TYPE = 'event'

function normalizeOwnerId(value) {
  if (value == null) return null
  const asString = String(value).trim()
  return asString ? asString : null
}

export function normalizeTimelineStatus(value) {
  if (!value) return null
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  if (
    [
      'defeated',
      'lost',
      'dead',
      'eliminated',
      'retired',
      '패배',
      '탈락',
    ].includes(normalized)
  ) {
    return 'defeated'
  }
  if (['spectator', 'spectating', 'observer', '관전'].includes(normalized)) {
    return 'spectating'
  }
  if (['proxy', 'stand-in', 'ai', 'bot', '대역'].includes(normalized)) {
    return 'proxy'
  }
  if (['active', 'playing', 'alive', '참여', 'in_battle'].includes(normalized)) {
    return 'active'
  }
  if (['pending', 'waiting', '대기'].includes(normalized)) {
    return 'pending'
  }
  return normalized
}

function sanitizeContext(value) {
  if (!value || typeof value !== 'object') {
    return null
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return null
  }
}

export function normalizeTimelineEvent(event, { defaultTurn = null, defaultType = DEFAULT_EVENT_TYPE } = {}) {
  if (!event || typeof event !== 'object') return null

  const rawType =
    typeof event.type === 'string'
      ? event.type.trim()
      : typeof event.eventType === 'string'
        ? event.eventType.trim()
        : typeof event.action === 'string'
          ? event.action.trim()
          : ''

  const type = rawType || defaultType
  if (!type) return null

  const ownerId =
    normalizeOwnerId(event.ownerId) ??
    normalizeOwnerId(event.owner_id) ??
    normalizeOwnerId(event.ownerID) ??
    (typeof event.owner === 'string' ? normalizeOwnerId(event.owner) : null)

  const strike = Number.isFinite(Number(event.strike)) ? Number(event.strike) : null
  const remaining = Number.isFinite(Number(event.remaining)) ? Number(event.remaining) : null
  const limit = Number.isFinite(Number(event.limit)) ? Number(event.limit) : null
  const turn = Number.isFinite(Number(event.turn)) ? Number(event.turn) : defaultTurn

  let timestamp = Number.isFinite(Number(event.timestamp))
    ? Number(event.timestamp)
    : Date.parse(event.timestamp)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    timestamp = Date.now()
  }

  const reason =
    typeof event.reason === 'string'
      ? event.reason
      : typeof event.reasonCode === 'string'
        ? event.reasonCode
        : null

  const status = normalizeTimelineStatus(event.status)
  const context = sanitizeContext(event.context ?? event.meta ?? event.metadata)

  let id =
    event.id ||
    event.eventId ||
    (type || ownerId
      ? `${type}:${ownerId || 'unknown'}:${turn ?? 'na'}:${timestamp}`
      : null)

  const metadata = sanitizeContext(event.metadata ?? event.meta ?? null)

  return {
    id,
    type,
    ownerId,
    strike,
    remaining,
    limit,
    reason,
    turn,
    timestamp,
    status: status || null,
    context,
    metadata,
  }
}

export function buildTimelineEventKey(event) {
  if (!event) return null
  if (event.id) {
    return `id:${String(event.id)}`
  }
  const ownerId = event.ownerId ? String(event.ownerId) : 'unknown'
  const type = event.type || DEFAULT_EVENT_TYPE
  const turn = event.turn != null ? event.turn : 'na'
  const timestamp = event.timestamp != null ? event.timestamp : 'ts'
  return `${type}:${ownerId}:${turn}:${timestamp}`
}

export function mergeTimelineEvents(existing = [], incoming = [], options = {}) {
  const { defaultTurn = null, defaultType = DEFAULT_EVENT_TYPE, order = 'asc' } = options
  const map = new Map()

  const upsert = (payload) => {
    const normalized = normalizeTimelineEvent(payload, { defaultTurn, defaultType })
    if (!normalized) return
    const key = buildTimelineEventKey(normalized)
    if (!key) return
    const previous = map.get(key) || {}
    map.set(key, { ...previous, ...payload, ...normalized })
  }

  existing.forEach(upsert)
  incoming.forEach(upsert)

  const sorted = Array.from(map.values()).sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
  )
  if (order === 'desc') {
    sorted.reverse()
  }
  return sorted
}

export function normalizeTimelineEvents(events = [], options = {}) {
  return mergeTimelineEvents([], Array.isArray(events) ? events : [], options)
}

export function sanitizeTimelineEvents(events = [], options = {}) {
  const normalized = normalizeTimelineEvents(events, options)
  return normalized.map((event) => ({
    id: event.id,
    type: event.type,
    ownerId: event.ownerId,
    strike: event.strike,
    remaining: event.remaining,
    limit: event.limit,
    reason: event.reason || null,
    turn: event.turn,
    timestamp: event.timestamp,
    status: event.status || null,
    context: event.context || null,
    metadata: event.metadata || null,
  }))
}

export function mapTimelineEventToRow(event, { sessionId = null, gameId = null } = {}) {
  const normalized = normalizeTimelineEvent(event)
  if (!normalized) return null

  const timestamp = Number.isFinite(normalized.timestamp)
    ? normalized.timestamp
    : Date.parse(event?.timestamp)

  const occurredAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()

  return {
    session_id: sessionId || event?.sessionId || null,
    game_id: gameId || event?.gameId || null,
    event_id: normalized.id,
    event_type: normalized.type,
    owner_id: normalized.ownerId || null,
    reason: normalized.reason || null,
    strike: normalized.strike,
    remaining: normalized.remaining,
    limit: normalized.limit,
    status: normalized.status || null,
    turn: Number.isFinite(normalized.turn) ? normalized.turn : null,
    event_timestamp: occurredAt,
    context: normalized.context || null,
    metadata: normalized.metadata || null,
  }
}

export function mapTimelineRowToEvent(row, { defaultTurn = null } = {}) {
  if (!row || typeof row !== 'object') return null
  const timestampMs = (() => {
    if (Number.isFinite(Number(row.timestamp_ms))) {
      return Number(row.timestamp_ms)
    }
    const parsed = Date.parse(row.event_timestamp || row.created_at)
    if (Number.isFinite(parsed)) {
      return parsed
    }
    return Date.now()
  })()

  const normalized = normalizeTimelineEvent(
    {
      id: row.event_id || row.id,
      type: row.event_type || row.type,
      ownerId: row.owner_id,
      strike: row.strike,
      remaining: row.remaining,
      limit: row.limit,
      reason: row.reason,
      status: row.status,
      turn: row.turn,
      timestamp: timestampMs,
      context: row.context,
      metadata: row.metadata,
    },
    { defaultTurn },
  )

  if (!normalized) return null

  return {
    ...normalized,
    sessionId: row.session_id || null,
    gameId: row.game_id || null,
  }
}

export function formatRelativeTimelineLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return ''
  const now = Date.now()
  const diff = now - timestamp
  const abs = Math.abs(diff)

  if (abs < 30_000) {
    return diff >= 0 ? '방금 전' : '곧'
  }

  const minutes = Math.round(abs / 60_000)
  if (minutes < 60) {
    return diff >= 0 ? `${minutes}분 전` : `${minutes}분 후`
  }

  const hours = Math.round(abs / 3_600_000)
  if (hours < 24) {
    return diff >= 0 ? `${hours}시간 전` : `${hours}시간 후`
  }

  const days = Math.round(abs / 86_400_000)
  return diff >= 0 ? `${days}일 전` : `${days}일 후`
}

export function formatAbsoluteTimelineLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return ''
  try {
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch (error) {
    return ''
  }
}
