import { buildStatusIndex } from '../../../../lib/promptEngine/statusIndex'

function normalizeSet(values) {
  if (!values) return new Set()
  if (values instanceof Set) {
    return new Set(Array.from(values, (value) => String(value)))
  }
  if (Array.isArray(values)) {
    return new Set(values.map((value) => String(value)))
  }
  return new Set()
}

function normalizeArray(values) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (value == null) continue
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

function summarizeRoles(participantsStatus = []) {
  const summary = new Map()

  for (const entry of participantsStatus) {
    const role = entry?.role ? String(entry.role) : ''
    if (!role) continue
    const rawStatus = entry?.status ? String(entry.status).toLowerCase() : ''
    const normalizedStatus =
      rawStatus === 'defeated' || rawStatus === 'lost' || rawStatus === 'eliminated'
        ? 'defeated'
        : rawStatus === 'spectator' || rawStatus === 'observer'
        ? 'spectator'
        : 'alive'

    const bucket = summary.get(role) || { alive: 0, defeated: 0, spectator: 0 }
    if (normalizedStatus === 'spectator') {
      bucket.spectator += 1
    } else {
      bucket[normalizedStatus] += 1
    }
    summary.set(role, bucket)
  }

  return summary
}

function buildFlagMap(sessionFlags = {}) {
  const flags = {
    brawl_enabled: Boolean(sessionFlags.brawlEnabled),
    game_voided: Boolean(sessionFlags.gameVoided),
    end_condition_met: Boolean(sessionFlags.endTriggered),
  }

  const extra = sessionFlags.flags
  if (Array.isArray(extra)) {
    for (const name of extra) {
      if (!name) continue
      flags[String(name)] = true
    }
  } else if (extra && typeof extra === 'object') {
    for (const [name, value] of Object.entries(extra)) {
      if (!name) continue
      flags[String(name)] = Boolean(value)
    }
  }

  return flags
}

export function createBridgeContext({
  turn = 0,
  historyAiText = '',
  historyUserText = '',
  visitedSlotIds = new Set(),
  participantsStatus = [],
  activeGlobalNames = [],
  activeLocalNames = [],
  currentRole = null,
  sessionFlags = {},
} = {}) {
  const normalizedTurn = Number.isFinite(Number(turn)) ? Number(turn) : 0
  const visited = normalizeSet(visitedSlotIds)
  const globals = normalizeArray(activeGlobalNames)
  const locals = normalizeArray(activeLocalNames)

  const statusIndex =
    sessionFlags.statusIndex || buildStatusIndex(participantsStatus, currentRole)
  const roleSummary = summarizeRoles(participantsStatus)

  const lastDropInTurn = Number.isFinite(sessionFlags.lastDropInTurn)
    ? Number(sessionFlags.lastDropInTurn)
    : null
  const turnsSinceDropIn =
    lastDropInTurn == null ? null : Math.max(0, normalizedTurn - lastDropInTurn)
  const dropInGraceTurns = Number.isFinite(sessionFlags.dropInGraceTurns)
    ? Math.max(0, Number(sessionFlags.dropInGraceTurns))
    : 0
  const dropInRecent =
    turnsSinceDropIn != null && turnsSinceDropIn <= dropInGraceTurns

  const flags = buildFlagMap({ ...sessionFlags, flags: sessionFlags.flags })
  flags.drop_in_active = turnsSinceDropIn === 0
  flags.drop_in_recent = dropInRecent

  const metrics = {
    win_count: Number.isFinite(sessionFlags.winCount)
      ? Number(sessionFlags.winCount)
      : 0,
    turns_since_drop_in: turnsSinceDropIn,
  }

  return {
    turn: normalizedTurn,
    myRole: currentRole ? String(currentRole) : null,
    historyAiText: historyAiText || '',
    historyUserText: historyUserText || '',
    visitedSlotIds: visited,
    activeGlobalNames: globals,
    activeLocalNames: locals,
    participantsStatus,
    statusIndex,
    roleHealth: roleSummary,
    sessionFlags: {
      ...sessionFlags,
      flags,
      metrics,
      lastDropInTurn,
      turnsSinceDropIn,
      dropInGraceTurns,
      dropInRecent,
    },
  }
}

