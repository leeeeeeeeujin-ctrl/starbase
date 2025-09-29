// lib/rank/matching.js
// Rebuilt role-based match helpers for duo, solo, and casual queues.
// These utilities keep pure data transforms up front so they can be
// consumed from any environment without triggering TDZ or circular
// import issues.

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
  const normalizedWindows = normalizeWindows(scoreWindows)
  const normalizedRoles = normalizeRoles(roles)
  const slots = enumerateSlots(normalizedRoles)
  if (slots.length === 0) {
    return buildResult({ ready: false, error: { type: 'no_active_slots' }, totalSlots: 0 })
  }

  const roleCounts = countSlotsByRole(slots)
  const candidateBuckets = buildRoleBuckets(queue, partySize)
  const usedCandidates = new Set()
  const usedGroups = new Set()
  const assignments = []
  let maxWindow = 0

  for (const [roleName, requiredSlots] of roleCounts.entries()) {
    const bucket = candidateBuckets.get(roleName)
    const resolution = pickRankGroups({
      bucket,
      requiredSlots,
      partySize,
      scoreWindows: normalizedWindows,
      usedCandidates,
      usedGroups,
    })

    if (!resolution.ok) {
      return buildResult({
        ready: false,
        assignments,
        maxWindow,
        error: {
          type: resolution.reason,
          role: roleName,
          missing: resolution.missing,
          anchorScore: resolution.anchorScore,
        },
        totalSlots: slots.length,
      })
    }

    const appliedWindow = resolution.window ?? 0
    if (appliedWindow > maxWindow) {
      maxWindow = appliedWindow
    }

    const roleAssignments = formatAssignments({
      groups: resolution.groups,
      roleName,
      requiredSlots,
      partySize,
      usedCandidates,
      usedGroups,
    })

    assignments.push(...roleAssignments)
  }

  assignments.sort(compareAssignments)
  return buildResult({
    ready: assignments.length === slots.length,
    assignments,
    maxWindow,
    totalSlots: slots.length,
  })
}

export function matchCasualParticipants({ roles = [], queue = [], partySize = 1 } = {}) {
  const normalizedRoles = normalizeRoles(roles)
  const slots = enumerateSlots(normalizedRoles)
  if (slots.length === 0) {
    return buildResult({ ready: false, error: { type: 'no_active_slots' }, totalSlots: 0 })
  }

  const roleCounts = countSlotsByRole(slots)
  const candidateBuckets = buildRoleBuckets(queue, partySize)
  const usedCandidates = new Set()
  const usedGroups = new Set()
  const assignments = []

  for (const [roleName, requiredSlots] of roleCounts.entries()) {
    const bucket = candidateBuckets.get(roleName)
    const resolution = pickCasualGroups({
      bucket,
      requiredSlots,
      partySize,
      usedCandidates,
      usedGroups,
    })

    if (!resolution.ok) {
      return buildResult({
        ready: false,
        assignments,
        error: {
          type: resolution.reason,
          role: roleName,
          missing: resolution.missing,
        },
        totalSlots: slots.length,
      })
    }

    const roleAssignments = formatAssignments({
      groups: resolution.groups,
      roleName,
      requiredSlots,
      partySize,
      usedCandidates,
      usedGroups,
    })

    assignments.push(...roleAssignments)
  }

  assignments.sort(compareAssignments)
  return buildResult({
    ready: assignments.length === slots.length,
    assignments,
    maxWindow: 0,
    totalSlots: slots.length,
  })
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeWindows(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_SCORE_WINDOWS
  }

  return value
    .map((raw) => {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return 0
      }
      return parsed
    })
    .sort((a, b) => a - b)
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return []

  const normalized = []
  for (const entry of roles) {
    if (entry == null) continue
    const name = typeof entry === 'string' ? entry : entry.name ?? entry.role
    if (!name) continue
    const slotCount = coerceInteger(
      typeof entry === 'number' ? entry : entry.slot_count ?? entry.slots ?? entry.count,
      0
    )
    if (slotCount <= 0) continue
    normalized.push({
      id: typeof entry === 'object' ? entry.id ?? entry.role_id ?? null : null,
      name,
      slotCount,
    })
  }
  return normalized
}

function enumerateSlots(roles) {
  const slots = []
  for (const role of roles) {
    for (let index = 0; index < role.slotCount; index += 1) {
      slots.push({ role: role.name, roleId: role.id, slotIndex: index })
    }
  }
  return slots
}

function countSlotsByRole(slots) {
  const map = new Map()
  for (const slot of slots) {
    map.set(slot.role, (map.get(slot.role) ?? 0) + 1)
  }
  return map
}

function buildRoleBuckets(queue, partySize) {
  const perRole = new Map()
  if (!Array.isArray(queue) || queue.length === 0) return perRole

  const normalizedQueue = []
  for (const entry of queue) {
    const normalized = normalizeQueueEntry(entry)
    if (!normalized) continue
    normalizedQueue.push(normalized)
  }

  if (partySize > 1) {
    appendPartyBuckets(perRole, normalizedQueue, partySize)
  } else {
    appendSoloBuckets(perRole, normalizedQueue)
  }

  return perRole
}

function appendSoloBuckets(perRole, candidates) {
  for (const candidate of candidates) {
    if (!perRole.has(candidate.role)) {
      perRole.set(candidate.role, [])
    }
    perRole.get(candidate.role).push({
      key: candidate.key,
      joinedAt: candidate.joinedAt,
      score: candidate.score,
      members: [candidate],
    })
  }

  for (const [, list] of perRole.entries()) {
    list.sort(compareGroups)
  }
}

function appendPartyBuckets(perRole, candidates, partySize) {
  const grouped = new Map()
  for (const candidate of candidates) {
    if (!candidate.partyKey) continue
    const key = `${candidate.role}::${candidate.partyKey}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key).push(candidate)
  }

  for (const [composite, members] of grouped.entries()) {
    const [roleName, partyKey] = composite.split('::')
    const sortedMembers = members.slice().sort(compareCandidates)
    const chunks = chunkMembers(sortedMembers, partySize)
    if (chunks.length === 0) continue

    if (!perRole.has(roleName)) {
      perRole.set(roleName, [])
    }

    const targetList = perRole.get(roleName)
    for (const chunk of chunks) {
      targetList.push({
        key: `${partyKey}:${chunk[0].joinedAt}`,
        partyKey,
        joinedAt: chunk[0].joinedAt,
        score: averageScore(chunk),
        members: chunk,
      })
    }
  }

  for (const [, list] of perRole.entries()) {
    list.sort(compareGroups)
  }
}

function chunkMembers(members, size) {
  if (size <= 0) return []
  const chunks = []
  for (let index = 0; index + size <= members.length; index += size) {
    const slice = members.slice(index, index + size)
    if (slice.length === size) {
      chunks.push(slice)
    }
  }
  return chunks
}

function averageScore(members) {
  if (!members || members.length === 0) return FALLBACK_SCORE
  let total = 0
  for (const member of members) {
    total += member.score
  }
  return total / members.length
}

function normalizeQueueEntry(entry) {
  if (!entry) return null
  const role = entry.role ?? entry.role_name ?? entry.roleName
  if (!role) return null

  const key = deriveParticipantKey(entry)
  if (!key) return null

  const joinedAt = deriveTimestamp(entry)
  const score = deriveScore(entry)
  const partyKey = derivePartyKey(entry)

  return { role, key, joinedAt, score, partyKey, entry }
}

function deriveParticipantKey(entry) {
  const preferred =
    entry.queue_id ??
    entry.match_id ??
    entry.participant_id ??
    entry.id ??
    entry.hero_id ??
    null
  if (preferred != null) return String(preferred)

  const owner = entry.owner_id ?? entry.user_id ?? 'owner'
  const hero = entry.hero_id ?? entry.hero ?? 'hero'
  return `${owner}:${hero}`
}

function derivePartyKey(entry) {
  const keys = [
    'party_id',
    'partyId',
    'duo_party_id',
    'duoPartyId',
    'group_id',
    'groupId',
    'team_id',
    'teamId',
  ]
  for (const key of keys) {
    const value = entry[key]
    if (value != null) return String(value)
  }
  return null
}

function deriveTimestamp(entry) {
  const keys = ['queue_joined_at', 'joined_at', 'queued_at', 'created_at', 'updated_at']
  for (const key of keys) {
    const value = entry[key]
    if (value == null) continue

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return 0
}

function deriveScore(entry) {
  if (typeof entry.score === 'number') return entry.score
  if (typeof entry.rating === 'number') return entry.rating
  if (typeof entry.mmr === 'number') return entry.mmr
  return FALLBACK_SCORE
}

function coerceInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

function compareGroups(a, b) {
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
  if (a.score !== b.score) return a.score - b.score
  return String(a.key).localeCompare(String(b.key))
}

function compareCandidates(a, b) {
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
  if (a.score !== b.score) return a.score - b.score
  return String(a.key).localeCompare(String(b.key))
}

function compareAssignments(a, b) {
  if (a.role === b.role) return a.slotIndex - b.slotIndex
  return a.role.localeCompare(b.role)
}

// ---------------------------------------------------------------------------
// Matching routines
// ---------------------------------------------------------------------------

function pickRankGroups({ bucket, requiredSlots, partySize, scoreWindows, usedCandidates, usedGroups }) {
  if (!bucket || bucket.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: requiredSlots }
  }

  const groupsNeeded = Math.ceil(requiredSlots / partySize)
  const available = filterAvailableGroups(bucket, usedCandidates, usedGroups)
  if (available.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: requiredSlots }
  }

  const anchor = available[0]
  const anchorScore = anchor.score ?? FALLBACK_SCORE
  const picked = []
  let appliedWindow = 0

  for (const window of scoreWindows) {
    for (const group of available) {
      if (picked.includes(group)) continue
      if (!groupWithinWindow(group, anchorScore, window)) continue
      picked.push(group)
      if (picked.length >= groupsNeeded) {
        appliedWindow = window
        break
      }
    }
    if (picked.length >= groupsNeeded) break
  }

  if (picked.length < groupsNeeded) {
    return {
      ok: false,
      reason: 'score_window_exhausted',
      missing: requiredSlots - picked.length * partySize,
      anchorScore,
    }
  }

  for (const group of picked) {
    group.window = appliedWindow
  }

  return { ok: true, groups: picked, window: appliedWindow, anchorScore }
}

function pickCasualGroups({ bucket, requiredSlots, partySize, usedCandidates, usedGroups }) {
  if (!bucket || bucket.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: requiredSlots }
  }

  const groupsNeeded = Math.ceil(requiredSlots / partySize)
  const available = filterAvailableGroups(bucket, usedCandidates, usedGroups)
  if (available.length === 0) {
    return { ok: false, reason: 'no_candidates', missing: requiredSlots }
  }

  const picked = available.slice(0, groupsNeeded)
  for (const group of picked) {
    group.window = 0
  }
  return { ok: true, groups: picked }
}

function filterAvailableGroups(bucket, usedCandidates, usedGroups) {
  const filtered = []
  for (const group of bucket) {
    if (usedGroups.has(group.key)) continue
    if (group.members.some((member) => usedCandidates.has(member.key))) continue
    filtered.push(group)
  }
  return filtered
}

function groupWithinWindow(group, anchorScore, window) {
  const score = group.score ?? FALLBACK_SCORE
  return Math.abs(score - anchorScore) <= window
}

function formatAssignments({ groups, roleName, requiredSlots, partySize, usedCandidates, usedGroups }) {
  const assignments = []
  let slotIndex = 0

  for (const group of groups) {
    usedGroups.add(group.key)
    for (const member of group.members) {
      if (slotIndex >= requiredSlots) break
      usedCandidates.add(member.key)
      assignments.push({
        role: roleName,
        roleId: member.entry?.role_id ?? member.entry?.roleId ?? null,
        slotIndex,
        participant: member.entry,
        participantKey: member.key,
        window: group.window ?? 0,
        partyKey: group.partyKey ?? null,
      })
      slotIndex += 1
    }
  }

  return assignments
}

function buildResult({ ready, assignments = [], maxWindow = 0, error = null, totalSlots = 0 }) {
  return {
    ready,
    assignments,
    stats: {
      totalSlots: totalSlots || assignments.reduce((acc, assignment) => Math.max(acc, assignment.slotIndex + 1), 0),
      filledSlots: assignments.length,
      maxWindow,
    },
    error,
  }
}

export const __internals = {
  DEFAULT_SCORE_WINDOWS,
  FALLBACK_SCORE,
  normalizeRoles,
  enumerateSlots,
  countSlotsByRole,
  buildRoleBuckets,
  pickRankGroups,
  pickCasualGroups,
  formatAssignments,
}
