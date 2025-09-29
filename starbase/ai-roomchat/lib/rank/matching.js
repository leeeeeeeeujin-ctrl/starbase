// Core rank matching helpers.
//
// This module intentionally keeps the matching algorithm in the middle of the
// pipeline: it expects the caller to hand us role capacity information and the
// current matching queue, and it produces a plan that tells the caller which
// queued entries should fill each role. Wiring this output back into Supabase
// (updating slots, marking queue entries, etc.) is left for the layer that
// invokes these helpers.

const DEFAULT_SCORE_WINDOWS = Object.freeze([100, 200, 300])
const FALLBACK_SCORE = 1000

export function matchSoloRankParticipants(options = {}) {
  return matchRankParticipants({ ...options, partySize: 1 })
}

export function matchDuoRankParticipants(options = {}) {
  return matchRankParticipants({ ...options, partySize: 2 })
}

export function matchRankParticipants({
  roles = [],
  queue = [],
  scoreWindows = DEFAULT_SCORE_WINDOWS,
  partySize = 1,
} = {}) {
  const normalizedRoles = normalizeRoles(roles)
  const totalSlots = countTotalSlots(normalizedRoles)
  if (totalSlots === 0) {
    return buildResult({
      ready: false,
      totalSlots,
      error: { type: 'no_active_slots' },
    })
  }

  const buckets = buildRoleBuckets(queue, partySize)
  const usedGroupKeys = new Set()
  const assignments = []
  let maxWindow = 0

  for (const role of normalizedRoles) {
    const resolution = resolveRankRole({
      role,
      buckets,
      partySize,
      scoreWindows,
      usedGroupKeys,
    })

    if (!resolution.ok) {
      return buildResult({
        ready: false,
        assignments: assignments.concat(resolution.partialAssignments ?? []),
        totalSlots,
        error: {
          type: resolution.reason,
          role: role.name,
          missing: resolution.missing,
        },
        maxWindow,
      })
    }

    if (resolution.window > maxWindow) {
      maxWindow = resolution.window
    }

    for (const assignment of resolution.assignments) {
      assignments.push(assignment)
      usedGroupKeys.add(assignment.groupKey)
    }
  }

  const assignedSlots = assignments.reduce((acc, item) => acc + item.slots, 0)
  return buildResult({
    ready: assignedSlots >= totalSlots,
    assignments,
    totalSlots,
    maxWindow,
  })
}

export function matchCasualParticipants({ roles = [], queue = [], partySize = 1 } = {}) {
  const normalizedRoles = normalizeRoles(roles)
  const totalSlots = countTotalSlots(normalizedRoles)
  if (totalSlots === 0) {
    return buildResult({
      ready: false,
      totalSlots,
      error: { type: 'no_active_slots' },
    })
  }

  const buckets = buildRoleBuckets(queue, partySize)
  const usedGroupKeys = new Set()
  const assignments = []

  for (const role of normalizedRoles) {
    const resolution = resolveCasualRole({
      role,
      buckets,
      partySize,
      usedGroupKeys,
    })

    if (!resolution.ok) {
      return buildResult({
        ready: false,
        assignments: assignments.concat(resolution.partialAssignments ?? []),
        totalSlots,
        error: {
          type: resolution.reason,
          role: role.name,
          missing: resolution.missing,
        },
      })
    }

    for (const assignment of resolution.assignments) {
      assignments.push(assignment)
      usedGroupKeys.add(assignment.groupKey)
    }
  }

  const assignedSlots = assignments.reduce((acc, item) => acc + item.slots, 0)
  return buildResult({
    ready: assignedSlots >= totalSlots,
    assignments,
    totalSlots,
    maxWindow: 0,
  })
}

// ---------------------------------------------------------------------------
// Core role resolution
// ---------------------------------------------------------------------------

function resolveRankRole({ role, buckets, partySize, scoreWindows, usedGroupKeys }) {
  const available = getAvailableGroupsForRole({ role, buckets, usedGroupKeys })
  if (available.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: role.slotCount }
  }

  const groupsNeeded = Math.ceil(role.slotCount / partySize)
  const windows = normalizeWindows(scoreWindows)

  for (let anchorIndex = 0; anchorIndex < available.length; anchorIndex += 1) {
    const anchor = available[anchorIndex]
    const attempt = tryPickRankGroups({
      anchor,
      anchorIndex,
      available,
      groupsNeeded,
      role,
      windows,
    })

    if (attempt.ok) {
      return {
        ok: true,
        assignments: materializeAssignments({
          role,
          picks: attempt.groups,
        }),
        window: attempt.window,
      }
    }
  }

  return {
    ok: false,
    reason: 'insufficient_candidates',
    missing: role.slotCount,
  }
}

function resolveCasualRole({ role, buckets, partySize, usedGroupKeys }) {
  const available = getAvailableGroupsForRole({ role, buckets, usedGroupKeys })
  if (available.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: role.slotCount }
  }

  const picks = []
  let slotsRemaining = role.slotCount

  for (const group of available) {
    if (slotsRemaining < group.members.length) {
      continue
    }

    picks.push(group)
    slotsRemaining -= group.members.length

    if (slotsRemaining === 0) {
        return {
          ok: true,
          assignments: materializeAssignments({ role, picks }),
        }
    }
  }

  return {
    ok: false,
    reason: 'insufficient_candidates',
    missing: slotsRemaining,
    partialAssignments: materializeAssignments({ role, picks }),
  }
}

function tryPickRankGroups({ anchor, anchorIndex, available, groupsNeeded, role, windows }) {
  const picks = [anchor]
  let slotsRemaining = role.slotCount - anchor.members.length
  if (slotsRemaining < 0) {
    return { ok: false }
  }

  if (slotsRemaining === 0) {
    return { ok: true, groups: picks, window: 0 }
  }

  const pool = available.filter((_, index) => index !== anchorIndex)

  const pickedKeys = new Set([anchor.groupKey])
  let bestWindow = 0

  for (const window of windows) {
    for (const group of pool) {
      if (pickedKeys.has(group.groupKey)) continue
      if (Math.abs(group.score - anchor.score) > window) continue
      if (slotsRemaining < group.members.length) continue

      picks.push(group)
      pickedKeys.add(group.groupKey)
      slotsRemaining -= group.members.length
      if (window > bestWindow) bestWindow = window

      if (slotsRemaining === 0) {
        return { ok: true, groups: picks, window: bestWindow }
      }

      if (picks.length === groupsNeeded) {
        if (slotsRemaining === 0) {
          return { ok: true, groups: picks, window: bestWindow }
        }
      }
    }
  }

  return { ok: false }
}

function materializeAssignments({ role, picks }) {
  const assignments = []
  let slotCursor = 0

  for (const group of picks) {
    assignments.push({
      role: role.name,
      slots: group.members.length,
      roleSlots: buildRoleSlotRange(role.slotCount, slotCursor, group.members.length),
      members: group.members.map((candidate) => candidate.entry),
      groupKey: group.groupKey,
      partyKey: group.partyKey ?? null,
      anchorScore: group.score,
      joinedAt: group.joinedAt,
    })
    slotCursor += group.members.length
  }

  return assignments
}

function buildRoleSlotRange(totalSlots, start, count) {
  const indices = []
  for (let index = 0; index < count; index += 1) {
    if (start + index >= totalSlots) break
    indices.push(start + index)
  }
  return indices
}

function getAvailableGroupsForRole({ role, buckets, usedGroupKeys }) {
  const bucket = buckets.get(role.name)
  if (!bucket) return []
  return bucket.filter((group) => !usedGroupKeys.has(group.groupKey))
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return []
  const result = []

  for (const raw of rawRoles) {
    if (!raw) continue
    const name = typeof raw === 'string' ? raw : raw.name ?? raw.role
    const slotCount = coerceInteger(
      typeof raw === 'number' ? raw : raw.slot_count ?? raw.slotCount ?? raw.slots,
      0
    )

    if (!name || slotCount <= 0) continue
    result.push({ name, slotCount })
  }

  return result
}

function normalizeWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return DEFAULT_SCORE_WINDOWS
  }
  return windows
    .map((value) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed < 0) return 0
      return parsed
    })
    .sort((a, b) => a - b)
}

function countTotalSlots(roles) {
  return roles.reduce((acc, role) => acc + role.slotCount, 0)
}

function buildRoleBuckets(queue, partySize) {
  const normalizedQueue = normalizeQueue(queue)
  const perRole = new Map()

  if (partySize > 1) {
    appendPartyBuckets(perRole, normalizedQueue, partySize)
  } else {
    for (const candidate of normalizedQueue) {
      if (!candidate.role) continue
      const key = candidate.groupKey
      const group = {
        role: candidate.role,
        score: candidate.score,
        joinedAt: candidate.joinedAt,
        members: [candidate],
        groupKey: key,
        partyKey: candidate.partyKey ?? null,
      }
      pushGroup(perRole, candidate.role, group)
    }
  }

  for (const [, groups] of perRole) {
    groups.sort((a, b) => a.joinedAt - b.joinedAt)
  }

  return perRole
}

function appendPartyBuckets(perRole, candidates, partySize) {
  const byParty = new Map()

  for (const candidate of candidates) {
    if (!candidate.role) continue
    if (!candidate.partyKey) continue

    const composite = `${candidate.role}::${candidate.partyKey}`
    if (!byParty.has(composite)) {
      byParty.set(composite, [])
    }
    byParty.get(composite).push(candidate)
  }

  for (const [composite, members] of byParty.entries()) {
    const [roleName, partyKey] = composite.split('::')
    if (!roleName) continue

    members.sort((a, b) => a.joinedAt - b.joinedAt)

    for (let index = 0; index + partySize <= members.length; index += partySize) {
      const slice = members.slice(index, index + partySize)
      const joinedAt = slice[0].joinedAt
      const averageScore = Math.round(
        slice.reduce((acc, candidate) => acc + candidate.score, 0) / slice.length
      )

      const group = {
        role: roleName,
        score: averageScore,
        joinedAt,
        members: slice,
        groupKey: `${partyKey}#${index}`,
        partyKey,
      }

      pushGroup(perRole, roleName, group)
    }
  }
}

function pushGroup(map, roleName, group) {
  if (!map.has(roleName)) {
    map.set(roleName, [])
  }
  map.get(roleName).push(group)
}

function normalizeQueue(queue) {
  if (!Array.isArray(queue)) return []
  const result = []

  for (const entry of queue) {
    if (!entry) continue

    const role = entry.role ?? entry.role_name ?? entry.roleName
    if (!role) continue

    const score = deriveScore(entry)
    const joinedAt = deriveTimestamp(entry)
    const partyKey = derivePartyKey(entry)
    const groupKey = deriveGroupKey(entry)

    result.push({
      role,
      score,
      joinedAt,
      partyKey,
      groupKey,
      entry,
    })
  }

  result.sort((a, b) => a.joinedAt - b.joinedAt)
  return result
}

function deriveScore(entry) {
  const keys = ['score', 'rating', 'mmr']
  for (const key of keys) {
    const value = Number(entry[key])
    if (Number.isFinite(value)) {
      return value
    }
  }
  return FALLBACK_SCORE
}

function deriveTimestamp(entry) {
  const keys = [
    'queue_joined_at',
    'joined_at',
    'queued_at',
    'created_at',
    'updated_at',
  ]

  for (const key of keys) {
    const raw = entry[key]
    if (!raw) continue
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return Number.MAX_SAFE_INTEGER
}

function derivePartyKey(entry) {
  const keys = ['party_id', 'partyId', 'party_key', 'partyKey', 'duo_party_id']
  for (const key of keys) {
    const value = entry[key]
    if (value != null) {
      return String(value)
    }
  }
  return null
}

function deriveGroupKey(entry) {
  if (entry.id != null) return `id:${entry.id}`
  if (entry.owner_id != null) return `owner:${entry.owner_id}`
  if (entry.ownerId != null) return `owner:${entry.ownerId}`
  const fallback = Math.random().toString(36).slice(2)
  return `rand:${fallback}`
}

function coerceInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

function buildResult({ ready, assignments = [], totalSlots = 0, maxWindow = 0, error = null }) {
  return {
    ready: Boolean(ready),
    assignments,
    totalSlots,
    maxWindow,
    error,
  }
}

