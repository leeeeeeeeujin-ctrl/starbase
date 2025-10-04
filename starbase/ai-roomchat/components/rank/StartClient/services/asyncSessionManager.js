import { normalizeTimelineStatus } from '../../../../lib/rank/timelineEvents'
import { createDropInQueueService } from './dropInQueueService'

function determineArrivalReason(arrival, fallbackMode = 'async') {
  if (!arrival) {
    return fallbackMode === 'realtime' ? 'realtime_joined' : 'async_queue_entry'
  }
  if (arrival.stats?.lastDepartureCause) {
    return arrival.stats.lastDepartureCause
  }
  if (!arrival.replaced) {
    return fallbackMode === 'realtime' ? 'realtime_joined' : 'async_queue_entry'
  }
  const replacedStatus = normalizeTimelineStatus(arrival.replaced.status)
  if (replacedStatus === 'defeated') {
    return 'role_defeated'
  }
  if (replacedStatus === 'spectating') {
    return 'role_spectating'
  }
  if (replacedStatus === 'proxy') {
    return fallbackMode === 'realtime' ? 'realtime_proxy' : 'async_proxy_rotation'
  }
  if (replacedStatus === 'pending') {
    return 'async_pending'
  }
  return fallbackMode === 'realtime' ? 'realtime_drop_in' : 'async_substitution'
}

function buildTimelineEvent(arrival, { mode = 'async' } = {}) {
  if (!arrival) return null
  const status =
    normalizeTimelineStatus(arrival.status) || (mode === 'realtime' ? 'active' : 'proxy')
  const cause = determineArrivalReason(arrival, mode)
  const normalizedTurn = Number.isFinite(Number(arrival.turn))
    ? Number(arrival.turn)
    : null

  return {
    type: 'drop_in_joined',
    ownerId: arrival.ownerId || null,
    status,
    turn: normalizedTurn,
    timestamp: arrival.timestamp,
    reason: cause,
    context: {
      role: arrival.role || null,
      heroName: arrival.heroName || null,
      participantId: arrival.participantId ?? null,
      slotIndex: arrival.slotIndex ?? null,
      mode,
      substitution: {
        cause,
        replacedOwnerId: arrival.replaced?.ownerId || null,
        replacedHeroName: arrival.replaced?.heroName || null,
        replacedParticipantId: arrival.replaced?.participantId || null,
        queueDepth: arrival.stats?.queueDepth ?? arrival.stats?.replacements ?? 0,
        arrivalOrder: arrival.stats?.arrivalOrder ?? null,
        totalReplacements: arrival.stats?.replacements ?? 0,
        lastDepartureCause: arrival.stats?.lastDepartureCause || null,
      },
    },
  }
}

export function createAsyncSessionManager({ dropInQueue = null } = {}) {
  const queue = dropInQueue || createDropInQueueService()
  let lastSnapshot = queue?.getSnapshot ? queue.getSnapshot() : { roles: [] }

  function handleQueueResult(queueResult = {}, { mode = 'async' } = {}) {
    if (queueResult?.snapshot) {
      lastSnapshot = queueResult.snapshot
    }
    const arrivals = Array.isArray(queueResult?.arrivals) ? queueResult.arrivals : []
    if (!arrivals.length) {
      return { events: [], snapshot: lastSnapshot }
    }
    const events = arrivals
      .map((arrival) => buildTimelineEvent(arrival, { mode }))
      .filter(Boolean)
    return { events, snapshot: lastSnapshot }
  }

  return {
    syncParticipants(participants = [], options = {}) {
      const mode = options?.mode || 'async'
      const queueResult = queue.syncParticipants(participants, {
        turnNumber: options?.turnNumber ?? null,
        mode,
      })
      return handleQueueResult(queueResult, { mode })
    },
    processQueueResult(queueResult = {}, options = {}) {
      const mode = options?.mode || 'async'
      return handleQueueResult(queueResult, { mode })
    },
    getSnapshot() {
      return lastSnapshot
    },
    reset() {
      if (queue && typeof queue.reset === 'function') {
        queue.reset()
      }
      lastSnapshot = queue?.getSnapshot ? queue.getSnapshot() : { roles: [] }
      return lastSnapshot
    },
  }
}

export default createAsyncSessionManager
