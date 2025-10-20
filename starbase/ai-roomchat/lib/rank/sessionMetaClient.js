'use client'

import { sanitizeSecondsOption, sanitizeTurnTimerVote } from './turnTimerMeta'
import { normalizeRealtimeMode, REALTIME_MODES } from './realtimeModes'

function safeClone(value) {
  if (value === null || value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return null
  }
}

function sanitizeTurnStateForRequest(state) {
  if (!state || typeof state !== 'object') return null
  const clone = safeClone(state)
  if (!clone) return null

  const toInt = (value, { min = null } = {}) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    const rounded = Math.floor(numeric)
    if (min !== null && rounded < min) return null
    return rounded
  }

  const toTimestamp = (value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) return 0
    return Math.floor(numeric)
  }

  const sanitized = {
    version: toInt(clone.version, { min: 1 }) ?? 1,
    turnNumber: toInt(clone.turnNumber, { min: 0 }) ?? 0,
    scheduledAt: toTimestamp(clone.scheduledAt),
    deadline: toTimestamp(clone.deadline),
    durationSeconds: toInt(clone.durationSeconds, { min: 0 }) ?? 0,
    remainingSeconds: toInt(clone.remainingSeconds, { min: 0 }) ?? 0,
    status: typeof clone.status === 'string' ? clone.status.trim() : '',
    dropInBonusSeconds: toInt(clone.dropInBonusSeconds, { min: 0 }) ?? 0,
    dropInBonusAppliedAt: toTimestamp(clone.dropInBonusAppliedAt),
    dropInBonusTurn: toInt(clone.dropInBonusTurn, { min: 0 }) ?? 0,
    source: typeof clone.source === 'string' ? clone.source.trim() : '',
    updatedAt: toTimestamp(clone.updatedAt),
  }

  return sanitized
}

function sanitizeAsyncFillSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const clone = safeClone(snapshot)
  if (!clone) return null

  const toInt = (value, { min = null } = {}) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    const rounded = Math.floor(numeric)
    if (min !== null && rounded < min) return null
    return rounded
  }

  const sanitizeList = (list) => {
    if (!Array.isArray(list) || list.length === 0) return []
    return list
      .map((entry) => {
        if (entry === null || entry === undefined) return null
        if (typeof entry === 'object') {
          const cloned = safeClone(entry)
          if (!cloned) return null
          Object.keys(cloned).forEach((key) => {
            if (cloned[key] === undefined) delete cloned[key]
          })
          return cloned
        }
        if (typeof entry === 'string') {
          const trimmed = entry.trim()
          return trimmed ? trimmed : null
        }
        const numeric = Number(entry)
        if (Number.isFinite(numeric)) {
          return Math.floor(numeric)
        }
        return null
      })
      .filter(Boolean)
  }

  const sanitized = {
    mode: typeof clone.mode === 'string' ? clone.mode.trim() || REALTIME_MODES.OFF : REALTIME_MODES.OFF,
    hostOwnerId: typeof clone.hostOwnerId === 'string' ? clone.hostOwnerId.trim() || null : null,
    hostRole: typeof clone.hostRole === 'string' ? clone.hostRole.trim() || null : null,
    seatLimit: {
      allowed: toInt(clone?.seatLimit?.allowed, { min: 0 }) ?? 0,
      total: toInt(clone?.seatLimit?.total, { min: 0 }) ?? 0,
    },
    seatIndexes: sanitizeList(clone.seatIndexes),
    pendingSeatIndexes: sanitizeList(clone.pendingSeatIndexes),
    assigned: sanitizeList(clone.assigned),
    overflow: sanitizeList(clone.overflow),
    fillQueue: sanitizeList(clone.fillQueue),
    poolSize: toInt(clone.poolSize, { min: 0 }) ?? 0,
    generatedAt: toInt(clone.generatedAt, { min: 0 }) ?? 0,
  }

  return sanitized
}

function sanitizeTimeVote(vote) {
  const normalized = sanitizeTurnTimerVote(vote?.turnTimer || vote)
  if (!normalized) return null
  const hasData =
    normalized.lastSelection ||
    normalized.updatedAt ||
    Object.keys(normalized.selections || {}).length > 0 ||
    Object.keys(normalized.voters || {}).length > 0
  return hasData ? normalized : null
}

function sanitizeRealtime(value) {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!trimmed) return REALTIME_MODES.OFF
  const normalized = normalizeRealtimeMode(trimmed)
  return normalized || REALTIME_MODES.OFF
}

function sanitizeSelectedLimit(seconds) {
  const normalized = sanitizeSecondsOption(seconds)
  if (!normalized) return null
  return normalized
}

function sanitizeDropInBonus(meta, turnState) {
  const fromState = Number(turnState?.dropInBonusSeconds)
  if (Number.isFinite(fromState) && fromState > 0) {
    return Math.floor(fromState)
  }
  const fromMeta = Number(meta?.bonusSeconds ?? meta?.bonus_seconds)
  if (Number.isFinite(fromMeta) && fromMeta > 0) {
    return Math.floor(fromMeta)
  }
  return null
}

function sanitizeDropInMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  const clone = safeClone(meta)
  if (!clone) return null

  const toInt = (value, { min = null } = {}) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    const rounded = Math.floor(numeric)
    if (min !== null && rounded < min) return null
    return rounded
  }

  const toTimestamp = (value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) return null
    return Math.floor(numeric)
  }

  const toText = (value) => {
    if (value === null || value === undefined) return null
    const trimmed = String(value).trim()
    return trimmed || null
  }

  const sanitizeArrivals = (list) => {
    if (!Array.isArray(list) || list.length === 0) return []
    return list
      .slice(0, 10)
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const normalized = {}
        const ownerId =
          entry.ownerId ?? entry.owner_id ?? entry.ownerID ?? entry?.owner?.id ?? null
        const role = toText(entry.role)
        const heroName =
          entry.heroName ?? entry.hero_name ?? entry.display_name ?? entry.name ?? null
        const slotIndex = toInt(entry.slotIndex ?? entry.slot_index, { min: 0 })
        const timestamp = toTimestamp(entry.timestamp)
        const queueDepth = toInt(entry.queueDepth ?? entry.queue_depth, { min: 0 })
        const replacements = toInt(entry.replacements, { min: 0 })
        const arrivalOrder = toInt(entry.arrivalOrder ?? entry.arrival_order, { min: 0 })
        const replacedOwner =
          entry.replacedOwnerId ??
          entry.replaced_owner_id ??
          entry?.replaced?.ownerId ??
          entry?.replaced?.owner_id ??
          null
        const replacedHero =
          entry.replacedHeroName ??
          entry.replaced_hero_name ??
          entry?.replaced?.heroName ??
          entry?.replaced?.hero_name ??
          null
        const status = toText(entry.status)

        if (toText(ownerId)) normalized.ownerId = toText(ownerId)
        if (role) normalized.role = role
        if (toText(heroName)) normalized.heroName = toText(heroName)
        if (slotIndex !== null) normalized.slotIndex = slotIndex
        if (timestamp !== null) normalized.timestamp = timestamp
        if (queueDepth !== null) normalized.queueDepth = queueDepth
        if (replacements !== null) normalized.replacements = replacements
        if (arrivalOrder !== null) normalized.arrivalOrder = arrivalOrder
        if (toText(replacedOwner)) normalized.replacedOwnerId = toText(replacedOwner)
        if (toText(replacedHero)) normalized.replacedHeroName = toText(replacedHero)
        if (status) normalized.status = status
        return Object.keys(normalized).length ? normalized : null
      })
      .filter(Boolean)
  }

  const sanitized = {}

  const status = toText(clone.status)
  if (status) sanitized.status = status

  const mode = toText(clone.mode)
  if (mode) sanitized.mode = mode

  const bonusSeconds = toInt(clone.bonusSeconds ?? clone.bonus_seconds, { min: 0 })
  if (bonusSeconds !== null) sanitized.bonusSeconds = bonusSeconds

  const appliedAt = toTimestamp(clone.appliedAt ?? clone.applied_at)
  if (appliedAt !== null) sanitized.appliedAt = appliedAt

  const turnNumber = toInt(clone.turnNumber ?? clone.turn_number, { min: 0 })
  if (turnNumber !== null) sanitized.turnNumber = turnNumber

  const queueDepth = toInt(clone.queueDepth ?? clone.queue_depth, { min: 0 })
  if (queueDepth !== null) sanitized.queueDepth = queueDepth

  const replacements = toInt(clone.replacements, { min: 0 })
  if (replacements !== null) sanitized.replacements = replacements

  const targetRoomId = toText(clone.targetRoomId ?? clone.roomId ?? clone.room_id)
  if (targetRoomId) sanitized.targetRoomId = targetRoomId

  const updatedAt = toTimestamp(clone.updatedAt ?? clone.updated_at)
  if (updatedAt !== null) sanitized.updatedAt = updatedAt

  const arrivals = sanitizeArrivals(clone.arrivals)
  if (arrivals.length) sanitized.arrivals = arrivals

  if (clone.matching) {
    sanitized.matching = safeClone(clone.matching)
  }

  if (!Object.keys(sanitized).length) return null
  return sanitized
}

function cleanupPayload(payload) {
  if (!payload || typeof payload !== 'object') return {}
  const cleaned = {}
  Object.keys(payload).forEach((key) => {
    if (payload[key] !== undefined) {
      cleaned[key] = payload[key]
    }
  })
  return cleaned
}

function toNormalizedOwnerId(value) {
  if (value === null || value === undefined) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function collectRosterOwnerIds(roster = []) {
  if (!Array.isArray(roster) || roster.length === 0) return []
  const ids = new Set()
  roster.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const candidate =
      entry.ownerId ??
      entry.owner_id ??
      entry.ownerID ??
      entry.occupantOwnerId ??
      entry.occupant_owner_id ??
      entry.owner?.id ??
      null
    const normalized = toNormalizedOwnerId(candidate)
    if (normalized) {
      ids.add(normalized)
    }
  })
  return Array.from(ids)
}

export function buildSessionMetaRequest({ state }) {
  if (!state) {
    return {
      metaPayload: null,
      turnStateEvent: null,
      metaSignature: '',
      turnStateSignature: '',
    }
  }

  const sessionMeta = state.sessionMeta || {}
  const turnState = sanitizeTurnStateForRequest(sessionMeta.turnState)
  const asyncFill = sanitizeAsyncFillSnapshot(sessionMeta.asyncFill)
  const timeVote = sanitizeTimeVote(sessionMeta.vote)
  const dropInBonus = sanitizeDropInBonus(sessionMeta.dropIn, turnState)
  const dropInMeta = sanitizeDropInMeta(sessionMeta.dropIn)
  const metaExtras = safeClone(sessionMeta.extras ?? sessionMeta.extra)
  const turnTimerSeconds = sanitizeSelectedLimit(sessionMeta?.turnTimer?.baseSeconds)
  const realtimeMode = sanitizeRealtime(state?.room?.realtimeMode)

  const metaPayload = cleanupPayload({
    selected_time_limit_seconds: turnTimerSeconds,
    time_vote: timeVote,
    drop_in_bonus_seconds: dropInBonus,
    turn_state: turnState,
    async_fill_snapshot: asyncFill,
    realtime_mode: realtimeMode,
    extras: metaExtras || null,
  })

  const roomId = typeof state?.room?.id === 'string' ? state.room.id.trim() : ''
  const matchInstanceId =
    typeof state?.matchInstanceId === 'string' ? state.matchInstanceId.trim() : ''
  const collaborators = collectRosterOwnerIds(state?.roster)

  let turnStateSignature = ''
  let turnStateEvent = null
  if (turnState) {
    const extras = {}
    if (dropInBonus !== null) {
      extras.dropInBonusSeconds = dropInBonus
      extras.dropInBonusAppliedAt = turnState.dropInBonusAppliedAt || 0
    }
    if (dropInMeta) {
      extras.dropIn = dropInMeta
    }

    turnStateEvent = {
      turn_state: turnState,
      turn_number: Number.isFinite(Number(turnState.turnNumber))
        ? Math.floor(Number(turnState.turnNumber))
        : null,
      source: sessionMeta?.source || turnState.source || null,
      extras: Object.keys(extras).length ? extras : null,
    }
    const dropInSignature = dropInMeta ? JSON.stringify(dropInMeta) : ''
    turnStateSignature = JSON.stringify({
      turn: turnState.turnNumber || 0,
      deadline: turnState.deadline || 0,
      remaining: turnState.remainingSeconds || 0,
      status: turnState.status || '',
      updatedAt: turnState.updatedAt || 0,
      bonus: turnState.dropInBonusSeconds || 0,
      bonusAppliedAt: turnState.dropInBonusAppliedAt || 0,
      dropIn: dropInSignature,
    })
  }

  const metaSignature = JSON.stringify(metaPayload)

  return {
    metaPayload,
    turnStateEvent,
    metaSignature,
    turnStateSignature,
    roomId,
    matchInstanceId,
    collaborators,
  }
}

export async function fetchTurnStateEvents({ sessionId, since, limit, signal } = {}) {
  if (!sessionId) {
    throw new Error('sessionId is required')
  }

  const params = new URLSearchParams({ sessionId })
  if (since !== undefined && since !== null) {
    if (since instanceof Date) {
      params.set('since', String(since.getTime()))
    } else if (Number.isFinite(Number(since))) {
      params.set('since', String(Math.floor(Number(since))))
    } else {
      params.set('since', String(since))
    }
  }

  if (limit !== undefined && limit !== null) {
    const numeric = Number(limit)
    if (Number.isFinite(numeric) && numeric > 0) {
      params.set('limit', String(Math.floor(numeric)))
    }
  }

  const response = await fetch(`/api/rank/turn-events?${params.toString()}`, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    const message = `failed to fetch turn events: ${response.status}`
    throw new Error(message)
  }

  const payload = await response.json().catch(() => ({}))
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
    return []
  }
  return payload.events
}

export async function postSessionMeta({
  token,
  sessionId,
  gameId,
  roomId,
  matchInstanceId,
  collaborators,
  meta,
  turnStateEvent,
  source,
}) {
  if (!token) throw new Error('세션 토큰이 필요합니다.')
  if (!sessionId) throw new Error('sessionId가 필요합니다.')
  const body = cleanupPayload({
    session_id: sessionId,
    game_id: gameId || null,
    room_id: typeof roomId === 'string' && roomId.trim() ? roomId.trim() : undefined,
    match_instance_id:
      typeof matchInstanceId === 'string' && matchInstanceId.trim()
        ? matchInstanceId.trim()
        : undefined,
    collaborators:
      Array.isArray(collaborators) && collaborators.length ? collaborators : undefined,
    source: typeof source === 'string' ? source : undefined,
    meta: meta || {},
    turn_state_event: turnStateEvent || undefined,
  })

  const response = await fetch('/api/rank/session-meta', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || '세션 메타 동기화에 실패했습니다.')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    payload = null
  }
  return payload
}
