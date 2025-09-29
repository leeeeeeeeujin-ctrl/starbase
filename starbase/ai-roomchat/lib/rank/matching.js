// lib/rank/matching.js
// Utility helpers for assembling full matches from queued participants.
// These functions do not mutate the incoming arrays; instead they return
// assignment descriptors that can later be persisted or consumed by
// higher-level match runners.

const DEFAULT_SCORE_WINDOWS = [100, 200, 300]
const FALLBACK_SCORE = 1000

function coerceNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

function coerceTimestamp(entry) {
  const keys = [
    'queue_joined_at',
    'joined_at',
    'queued_at',
    'created_at',
    'updated_at',
  ]

  for (const key of keys) {
    const raw = entry?.[key]
    if (raw == null) continue

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw
    }

    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Date.parse(raw)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  // Put unknown timestamps at the front to avoid starving players without metadata.
  return 0
}

function deriveKey(entry, role) {
  if (entry == null) return null
  const direct =
    entry.queue_id ??
    entry.match_id ??
    entry.participant_id ??
    entry.id ??
    entry.hero_id ??
    null
  if (direct != null) return String(direct)

  const owner = entry.owner_id ?? entry.user_id ?? 'anon'
  const hero = entry.hero_id ?? entry.hero ?? 'hero'
  return `${owner}:${hero}:${role ?? ''}`
}

function deriveScore(entry) {
  if (typeof entry?.score === 'number') return entry.score
  if (typeof entry?.rating === 'number') return entry.rating
  if (typeof entry?.mmr === 'number') return entry.mmr
  return FALLBACK_SCORE
}

function normalizeParticipant(entry) {
  const role = entry?.role ?? entry?.role_name ?? entry?.roleName
  if (!role) return null

  const key = deriveKey(entry, role)
  if (!key) return null

  return {
    role,
    key,
    score: deriveScore(entry),
    joinedAt: coerceTimestamp(entry),
    entry,
  }
}

function buildRolePools(queue = []) {
  const pools = new Map()

  for (const raw of queue) {
    const candidate = normalizeParticipant(raw)
    if (!candidate) continue

    if (!pools.has(candidate.role)) {
      pools.set(candidate.role, new Map())
    }

    const roleMap = pools.get(candidate.role)
    const existing = roleMap.get(candidate.key)
    if (!existing || candidate.joinedAt < existing.joinedAt) {
      roleMap.set(candidate.key, candidate)
    }
  }

  const ordered = new Map()
  for (const [role, map] of pools.entries()) {
    const arr = Array.from(map.values())
    arr.sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
      if (a.score !== b.score) return a.score - b.score
      return a.key.localeCompare(b.key)
    })
    ordered.set(role, arr)
  }

  return ordered
}

function enumerateSlots(roles = []) {
  const slots = []
  for (const role of roles) {
    if (!role) continue
    const name = role.name ?? role.role ?? role
    const count = coerceNumber(role.slot_count ?? role.count ?? role.slots ?? role.quantity ?? (typeof role === 'number' ? role : 0))
    if (!name || count <= 0) continue
    for (let i = 0; i < count; i += 1) {
      slots.push({
        role: name,
        roleId: role.id ?? null,
        slotIndex: i,
      })
    }
  }
  return slots
}

function summarize(assignments, totalSlots, maxWindow = 0) {
  return {
    totalSlots,
    filledSlots: assignments.length,
    maxWindow,
  }
}

function countSlotsByRole(slots = []) {
  const counts = new Map()
  for (const slot of slots) {
    if (!slot || !slot.role) continue
    counts.set(slot.role, (counts.get(slot.role) ?? 0) + 1)
  }
  return counts
}

function matchCasualRole({ role, need, pool, used }) {
  if (!pool || pool.length === 0) {
    return { ok: false, matched: [], reason: 'no_candidates' }
  }

  const picked = []
  for (const candidate of pool) {
    if (used.has(candidate.key)) continue
    picked.push(candidate)
    used.add(candidate.key)
    if (picked.length >= need) break
  }

  if (picked.length < need) {
    return {
      ok: false,
      matched: picked,
      reason: 'insufficient_candidates',
      missing: need - picked.length,
    }
  }

  return { ok: true, matched: picked }
}

function matchRankRole({ role, need, pool, used, scoreWindows }) {
  if (!pool || pool.length === 0) {
    return { ok: false, matched: [], reason: 'no_candidates' }
  }

  const available = pool.filter((candidate) => !used.has(candidate.key))
  if (available.length === 0) {
    return { ok: false, matched: [], reason: 'no_candidates' }
  }

  const anchorScore = available[0].score ?? FALLBACK_SCORE
  const picked = []
  let appliedWindow = 0

  for (const window of scoreWindows) {
    for (const candidate of available) {
      if (used.has(candidate.key)) continue
      if (picked.find((entry) => entry.key === candidate.key)) continue
      const diff = Math.abs((candidate.score ?? FALLBACK_SCORE) - anchorScore)
      if (diff > window) continue
      picked.push({ ...candidate, window })
      if (picked.length >= need) break
    }
    if (picked.length >= need) {
      appliedWindow = window
      break
    }
  }

  if (picked.length < need) {
    return {
      ok: false,
      matched: picked,
      reason: 'score_window_exhausted',
      missing: need - picked.length,
      anchorScore,
    }
  }

  for (const candidate of picked) {
    used.add(candidate.key)
  }

  return {
    ok: true,
    matched: picked,
    window: appliedWindow,
  }
}

function formatAssignments(matched, roleName) {
  return matched.map((candidate, idx) => ({
    role: roleName,
    roleId: candidate.entry?.role_id ?? candidate.entry?.roleId ?? null,
    slotIndex: idx,
    participant: candidate.entry,
    participantKey: candidate.key,
    window: candidate.window ?? 0,
  }))
}

export function matchCasualParticipants({ roles = [], queue = [] } = {}) {
  const slots = enumerateSlots(roles)
  const totalSlots = slots.length
  if (totalSlots === 0) {
    return {
      ready: false,
      assignments: [],
      stats: summarize([], 0, 0),
      error: { type: 'no_active_slots' },
    }
  }

  const pools = buildRolePools(queue)
  const used = new Set()
  const assignments = []
  const roleCounts = countSlotsByRole(slots)

  for (const [role, need] of roleCounts.entries()) {
    const pool = pools.get(role)

    const result = matchCasualRole({ role, need, pool, used })
    if (!result.ok) {
      return {
        ready: false,
        assignments,
        stats: summarize(assignments, totalSlots, 0),
        error: {
          type: result.reason,
          role,
          missing: result.missing ?? need,
        },
      }
    }

    const formatted = formatAssignments(result.matched, role)
    for (const assignment of formatted) {
      assignments.push(assignment)
    }
  }

  const sortedAssignments = assignments.sort((a, b) => {
    if (a.role === b.role) return a.slotIndex - b.slotIndex
    return a.role.localeCompare(b.role)
  })

  return {
    ready: assignments.length === totalSlots,
    assignments: sortedAssignments,
    stats: summarize(sortedAssignments, totalSlots, 0),
  }
}

export function matchRankParticipants({ roles = [], queue = [], scoreWindows = DEFAULT_SCORE_WINDOWS } = {}) {
  const windows = Array.isArray(scoreWindows) && scoreWindows.length
    ? scoreWindows.map((value) => Math.max(0, Number(value) || 0)).sort((a, b) => a - b)
    : DEFAULT_SCORE_WINDOWS

  const slots = enumerateSlots(roles)
  const totalSlots = slots.length
  if (totalSlots === 0) {
    return {
      ready: false,
      assignments: [],
      stats: summarize([], 0, 0),
      error: { type: 'no_active_slots' },
    }
  }

  const pools = buildRolePools(queue)
  const used = new Set()
  const assignments = []
  let maxWindow = 0
  const roleCounts = countSlotsByRole(slots)

  for (const [role, need] of roleCounts.entries()) {
    const pool = pools.get(role)

    const result = matchRankRole({ role, need, pool, used, scoreWindows: windows })
    if (!result.ok) {
      return {
        ready: false,
        assignments,
        stats: summarize(assignments, totalSlots, maxWindow),
        error: {
          type: result.reason,
          role,
          missing: result.missing ?? need,
          anchorScore: result.anchorScore,
        },
      }
    }

    const formatted = formatAssignments(result.matched, role)
    for (const assignment of formatted) {
      assignments.push(assignment)
      if (assignment.window > maxWindow) {
        maxWindow = assignment.window
      }
    }
  }

  const sortedAssignments = assignments.sort((a, b) => {
    if (a.role === b.role) return a.slotIndex - b.slotIndex
    return a.role.localeCompare(b.role)
  })

  return {
    ready: sortedAssignments.length === totalSlots,
    assignments: sortedAssignments,
    stats: summarize(sortedAssignments, totalSlots, maxWindow),
  }
}

// Export helpers for testing and future orchestration layers.
export const __internals = {
  DEFAULT_SCORE_WINDOWS,
  FALLBACK_SCORE,
  buildRolePools,
  enumerateSlots,
  countSlotsByRole,
  matchCasualRole,
  matchRankRole,
}
