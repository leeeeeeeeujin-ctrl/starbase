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
  const turnTimerSeconds = sanitizeSelectedLimit(sessionMeta?.turnTimer?.baseSeconds)
  const realtimeMode = sanitizeRealtime(state?.room?.realtimeMode)

  const metaPayload = cleanupPayload({
    selected_time_limit_seconds: turnTimerSeconds,
    time_vote: timeVote,
    drop_in_bonus_seconds: dropInBonus,
    turn_state: turnState,
    async_fill_snapshot: asyncFill,
    realtime_mode: realtimeMode,
  })

  let turnStateSignature = ''
  let turnStateEvent = null
  if (turnState) {
    turnStateEvent = {
      turn_state: turnState,
      turn_number: Number.isFinite(Number(turnState.turnNumber))
        ? Math.floor(Number(turnState.turnNumber))
        : null,
      source: sessionMeta?.source || turnState.source || null,
      extras: dropInBonus
        ? {
            dropInBonusSeconds: dropInBonus,
            dropInBonusAppliedAt: turnState.dropInBonusAppliedAt || 0,
          }
        : null,
    }
    turnStateSignature = JSON.stringify({
      turn: turnState.turnNumber || 0,
      deadline: turnState.deadline || 0,
      remaining: turnState.remainingSeconds || 0,
      status: turnState.status || '',
      updatedAt: turnState.updatedAt || 0,
      bonus: turnState.dropInBonusSeconds || 0,
      bonusAppliedAt: turnState.dropInBonusAppliedAt || 0,
    })
  }

  const metaSignature = JSON.stringify(metaPayload)

  return { metaPayload, turnStateEvent, metaSignature, turnStateSignature }
}

export async function postSessionMeta({ token, sessionId, gameId, meta, turnStateEvent, source }) {
  if (!token) throw new Error('세션 토큰이 필요합니다.')
  if (!sessionId) throw new Error('sessionId가 필요합니다.')
  const body = cleanupPayload({
    session_id: sessionId,
    game_id: gameId || null,
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
