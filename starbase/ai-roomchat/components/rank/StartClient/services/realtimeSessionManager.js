import { normalizeTimelineEvent } from '../../../../lib/rank/timelineEvents'

const WARNING_LIMIT = 2
const MAX_EVENT_LOG_SIZE = 50

function normalizeOwnerId(value) {
  if (value == null) return null
  const asString = String(value).trim()
  return asString ? asString : null
}

function normalizeStatus(value) {
  if (!value) return 'unknown'
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (
    ['defeated', 'lost', 'dead', 'eliminated', 'retired', '패배', '탈락'].includes(
      normalized,
    )
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

function createEntry(ownerId) {
  return {
    ownerId,
    status: 'active',
    inactivityStrikes: 0,
    lastParticipationTurn: 0,
    lastWarningTurn: 0,
    lastWarningReason: null,
    lastParticipationType: null,
    proxiedAtTurn: null,
  }
}

export function createRealtimeSessionManager({ warningLimit = WARNING_LIMIT } = {}) {
  let limit = Number.isFinite(Number(warningLimit)) ? Number(warningLimit) : WARNING_LIMIT
  if (limit < 1) {
    limit = WARNING_LIMIT
  }

  let currentTurn = 0
  let pendingOwners = new Set()
  const managedOwners = new Set()
  const ownerState = new Map()
  const eventLog = []

  function pushEvents(events = []) {
    if (!Array.isArray(events) || events.length === 0) {
      return []
    }
    const appended = []
    events.forEach((event) => {
      if (!event || typeof event !== 'object') return
      const normalized = normalizeTimelineEvent(
        { turn: currentTurn || 0, ...event },
        { defaultTurn: currentTurn || 0 },
      )
      if (!normalized) return
      const record = {
        ...event,
        ...normalized,
        timestamp:
          Number.isFinite(Number(normalized.timestamp)) && Number(normalized.timestamp) > 0
            ? Number(normalized.timestamp)
            : Date.now(),
      }
      if (!record.id) {
        record.id = `${record.type || 'event'}:${record.ownerId || 'unknown'}:${record.turn ?? 0}:${record.timestamp}`
      }
      eventLog.push(record)
      appended.push(record)
    })
    if (eventLog.length > MAX_EVENT_LOG_SIZE) {
      eventLog.splice(0, eventLog.length - MAX_EVENT_LOG_SIZE)
    }
    return appended
  }

  function computeSnapshot() {
    const entries = []
    ownerState.forEach((entry, ownerId) => {
      entries.push({
        ownerId,
        status: entry.status,
        inactivityStrikes: entry.inactivityStrikes,
        lastParticipationTurn: entry.lastParticipationTurn,
        lastWarningTurn: entry.lastWarningTurn,
        lastWarningReason: entry.lastWarningReason,
        managed: managedOwners.has(ownerId),
        proxiedAtTurn: entry.proxiedAtTurn,
      })
    })
    entries.sort((a, b) => a.ownerId.localeCompare(b.ownerId))
    return {
      turn: currentTurn,
      pendingOwners: Array.from(pendingOwners),
      entries,
      warningLimit: limit,
      events: eventLog.slice(-MAX_EVENT_LOG_SIZE).map((event) => ({ ...event })),
    }
  }

  function ensureEntry(ownerId) {
    const normalized = normalizeOwnerId(ownerId)
    if (!normalized) return null
    if (!ownerState.has(normalized)) {
      ownerState.set(normalized, createEntry(normalized))
    }
    return ownerState.get(normalized)
  }

  return {
    syncParticipants(participants = []) {
      const seen = new Set()
      if (Array.isArray(participants)) {
        participants.forEach((participant) => {
          const ownerId = normalizeOwnerId(
            participant?.owner_id ??
              participant?.ownerId ??
              participant?.ownerID ??
              participant?.owner?.id ??
              null,
          )
          if (!ownerId) return
          seen.add(ownerId)
          const entry = ensureEntry(ownerId)
          entry.status = normalizeStatus(participant?.status)
          if (entry.status === 'proxy' && entry.proxiedAtTurn === null) {
            entry.proxiedAtTurn = currentTurn || 0
          }
        })
      }
      ownerState.forEach((_, ownerId) => {
        if (!seen.has(ownerId)) {
          ownerState.delete(ownerId)
          pendingOwners.delete(ownerId)
          managedOwners.delete(ownerId)
        }
      })
      return computeSnapshot()
    },
    setManagedOwners(ownerIds = []) {
      managedOwners.clear()
      if (Array.isArray(ownerIds)) {
        ownerIds.forEach((ownerId) => {
          const normalized = normalizeOwnerId(ownerId)
          if (!normalized) return
          managedOwners.add(normalized)
          ensureEntry(normalized)
        })
      }
      return computeSnapshot()
    },
    beginTurn({ turnNumber, eligibleOwnerIds = [] } = {}) {
      const numericTurn = Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : currentTurn
      currentTurn = numericTurn
      pendingOwners = new Set(
        Array.isArray(eligibleOwnerIds)
          ? eligibleOwnerIds
              .map((ownerId) => normalizeOwnerId(ownerId))
              .filter((ownerId) => ownerId !== null)
          : [],
      )
      return computeSnapshot()
    },
    recordParticipation(ownerId, turnNumber, { type = 'action' } = {}) {
      const normalized = normalizeOwnerId(ownerId)
      if (!normalized) {
        return computeSnapshot()
      }
      const entry = ensureEntry(normalized)
      const numericTurn = Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : currentTurn
      entry.lastParticipationTurn = numericTurn
      entry.lastParticipationType = type
      entry.lastWarningReason = null
      entry.lastWarningTurn = 0
      entry.inactivityStrikes = 0
      pendingOwners.delete(normalized)
      if (entry.status !== 'proxy') {
        entry.status = 'active'
      }
      return computeSnapshot()
    },
    completeTurn({
      turnNumber,
      reason = 'inactivity',
      eligibleOwnerIds = [],
    } = {}) {
      const numericTurn = Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : currentTurn
      currentTurn = numericTurn
      const normalizedEligible = Array.isArray(eligibleOwnerIds)
        ? eligibleOwnerIds
            .map((ownerId) => normalizeOwnerId(ownerId))
            .filter((ownerId) => ownerId !== null)
        : []
      const newWarnings = []
      const escalated = []
      const newEvents = []
      normalizedEligible.forEach((ownerId) => {
        if (!pendingOwners.has(ownerId)) {
          return
        }
        pendingOwners.delete(ownerId)
        if (managedOwners.size > 0 && !managedOwners.has(ownerId)) {
          return
        }
        const entry = ensureEntry(ownerId)
        entry.inactivityStrikes += 1
        entry.lastWarningTurn = numericTurn
        entry.lastWarningReason = reason
        if (entry.inactivityStrikes > limit) {
          if (entry.status !== 'proxy') {
            entry.status = 'proxy'
            entry.proxiedAtTurn = numericTurn
            escalated.push(ownerId)
            newEvents.push({
              type: 'proxy_escalated',
              ownerId,
              strike: entry.inactivityStrikes,
              remaining: 0,
              limit,
              reason,
              turn: numericTurn,
              status: entry.status,
            })
          }
        } else {
          const remaining = Math.max(limit - entry.inactivityStrikes + 1, 0)
          newWarnings.push({
            ownerId,
            strike: entry.inactivityStrikes,
            remaining,
            limit,
            reason,
          })
          newEvents.push({
            type: 'warning',
            ownerId,
            strike: entry.inactivityStrikes,
            remaining,
            limit,
            reason,
            turn: numericTurn,
            status: entry.status,
          })
        }
      })
      const appendedRecords = newEvents.length ? pushEvents(newEvents) : []
      return {
        snapshot: computeSnapshot(),
        warnings: newWarnings,
        escalated,
        events: appendedRecords,
      }
    },
    reset() {
      currentTurn = 0
      pendingOwners = new Set()
      ownerState.clear()
      managedOwners.clear()
      eventLog.length = 0
      return computeSnapshot()
    },
    getSnapshot() {
      return computeSnapshot()
    },
  }
}

export default createRealtimeSessionManager
