// lib/rank/matchmakingService.js
// Utilities that bridge the generic matching helpers with Supabase storage.

import {
  matchCasualParticipants,
  matchRankParticipants,
  matchSoloRankParticipants,
} from './matching'
import {
  getDefaultPartySize,
  getMatcherKey,
  getQueueModes,
} from './matchModes'
import { withTable } from '../supabaseTables'

const WAIT_THRESHOLD_SECONDS = 30

const MATCHER_BY_KEY = {
  rank: matchRankParticipants,
  rank_solo: matchSoloRankParticipants,
  casual: matchCasualParticipants,
}

function nowIso() {
  return new Date().toISOString()
}

function ensureArray(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function deriveParticipantScore(row) {
  const score = Number(row?.score)
  if (Number.isFinite(score) && score > 0) {
    return score
  }
  const rating = Number(row?.rating)
  if (Number.isFinite(rating) && rating > 0) {
    return rating
  }
  return 1000
}

function resolveParticipantHeroId(row) {
  if (!row) return null
  if (row.hero_id) return row.hero_id
  if (row.heroId) return row.heroId
  if (Array.isArray(row.hero_ids) && row.hero_ids.length) {
    return row.hero_ids.find(Boolean) || null
  }
  if (Array.isArray(row.heroIds) && row.heroIds.length) {
    return row.heroIds.find(Boolean) || null
  }
  return null
}

export async function loadActiveRoles(supabaseClient, gameId) {
  if (!gameId) return []
  const result = await withTable(supabaseClient, 'rank_game_roles', (table) =>
    supabaseClient
      .from(table)
      .select('name, slot_count, active')
      .eq('game_id', gameId),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows
    .filter((row) => row.active !== false)
    .map((row) => ({ name: row.name, slot_count: row.slot_count ?? row.slotCount ?? 0 }))
}

function normalizeRoleName(value) {
  if (!value) return ''
  if (typeof value !== 'string') return ''
  return value.trim()
}

function coerceSlotIndex(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.trunc(numeric)
}

export async function loadRoleLayout(supabaseClient, gameId) {
  if (!gameId) {
    return { roles: [], slotLayout: [] }
  }

  const [roleResult, slotResult] = await Promise.all([
    withTable(supabaseClient, 'rank_game_roles', (table) =>
      supabaseClient
        .from(table)
        .select('name, slot_count, active')
        .eq('game_id', gameId),
    ),
    withTable(supabaseClient, 'rank_game_slots', (table) =>
      supabaseClient
        .from(table)
        .select('slot_index, role, active, hero_id, hero_owner_id')
        .eq('game_id', gameId)
        .order('slot_index', { ascending: true }),
    ),
  ])

  if (roleResult?.error) throw roleResult.error
  if (slotResult?.error) throw slotResult.error

  const roleRows = Array.isArray(roleResult?.data) ? roleResult.data : []
  const slotRows = Array.isArray(slotResult?.data) ? slotResult.data : []

  const layout = slotRows
    .map((row) => {
      if (!row || row.active === false) return null
      const slotIndex = coerceSlotIndex(row.slot_index ?? row.slotIndex ?? row.slot_no ?? row.slotNo)
      const roleName = normalizeRoleName(row.role)
      if (slotIndex == null || roleName === '') return null
      return {
        slotIndex,
        role: roleName,
        heroId: row.hero_id || row.heroId || null,
        heroOwnerId: row.hero_owner_id || row.heroOwnerId || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.slotIndex - b.slotIndex)

  const slotCounts = new Map()
  layout.forEach((slot) => {
    const count = slotCounts.get(slot.role) || 0
    slotCounts.set(slot.role, count + 1)
  })

  const normalizedRoles = []
  const roleMap = new Map()

  roleRows
    .filter((row) => row && row.active !== false)
    .forEach((row) => {
      const name = normalizeRoleName(row.name)
      if (!name) return
      const requestedCount = Number(row.slot_count ?? row.slotCount ?? row.capacity)
      const normalizedCount = Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 0
      const slotCount = slotCounts.get(name) || 0
      const finalCount = Math.max(normalizedCount, slotCount)
      if (finalCount <= 0) return
      if (!roleMap.has(name)) {
        normalizedRoles.push({ name, slot_count: finalCount })
        roleMap.set(name, normalizedRoles[normalizedRoles.length - 1])
      } else {
        roleMap.get(name).slot_count = finalCount
      }
    })

  slotCounts.forEach((count, name) => {
    if (count <= 0) return
    if (roleMap.has(name)) return
    const entry = { name, slot_count: count }
    roleMap.set(name, entry)
    normalizedRoles.push(entry)
  })

  return { roles: normalizedRoles, slotLayout: layout }
}

export async function loadParticipantPool(supabaseClient, gameId) {
  if (!gameId) return []

  const result = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select(
        'id, owner_id, hero_id, hero_ids, role, score, rating, status, updated_at, created_at',
      )
      .eq('game_id', gameId),
  )

  if (result?.error) throw result.error

  const rows = Array.isArray(result?.data) ? result.data : []
  const alive = rows.filter((row) => (row?.status || 'alive') !== 'dead')
  const eligible = alive.filter((row) => {
    if (!row) return false
    const role = row.role || row.role_name || row.roleName
    if (!role) return false
    const heroId = resolveParticipantHeroId(row)
    if (!heroId) return false
    const status = normalizeStatus(row?.status)
    if (DEFEATED_STATUS_SET.has(status)) return false
    if (status === 'victory') return false
    if (status === 'retired') return false
    if (LOCKED_STATUS_SET.has(status)) return false
    return true
  })

  return eligible.map((row) => ({
    // Use null id so queue updates ignore simulated entries.
    id: null,
    owner_id: row.owner_id || row.ownerId || null,
    ownerId: row.owner_id || row.ownerId || null,
    hero_id: resolveParticipantHeroId(row),
    hero_ids: Array.isArray(row.hero_ids) ? row.hero_ids.filter(Boolean) : [],
    role: row.role || '',
    score: deriveParticipantScore(row),
    rating: deriveParticipantScore(row),
    status: 'waiting',
    joined_at: row.updated_at || row.created_at || null,
    simulated: true,
    standin: true,
    match_source: 'participant_pool',
  }))
}

function normalizeStatus(value) {
  if (!value) return 'alive'
  if (typeof value !== 'string') return 'alive'
  return value.trim().toLowerCase() || 'alive'
}

const DEFEATED_STATUS_SET = new Set([
  'defeated',
  'lost',
  'out',
  'retired',
  'eliminated',
  'dead',
])

const LOCKED_STATUS_SET = new Set([
  'engaged',
  'engaged_offense',
  'engaged_defense',
  'locked',
  'pending_battle',
])

export async function loadRoleStatusCounts(supabaseClient, gameId) {
  if (!gameId) return new Map()

  const result = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select('role, status')
      .eq('game_id', gameId),
  )

  if (result?.error) throw result.error

  const rows = Array.isArray(result?.data) ? result.data : []
  const map = new Map()

  rows.forEach((row) => {
    const roleName = (row?.role || '').trim()
    if (!roleName) return
    const status = normalizeStatus(row?.status)
    const bucket = map.get(roleName) || { total: 0, active: 0, defeated: 0 }
    bucket.total += 1
    if (DEFEATED_STATUS_SET.has(status)) {
      bucket.defeated += 1
    } else {
      bucket.active += 1
    }
    map.set(roleName, bucket)
  })

  return map
}

async function loadRealtimeToggle(supabaseClient, gameId) {
  if (!gameId) return false

  const { data, error } = await withTable(supabaseClient, 'rank_games', (table) =>
    supabaseClient.from(table).select('realtime_match').eq('id', gameId).maybeSingle(),
  )

  if (error) throw error

  return Boolean(data?.realtime_match)
}

export async function loadMatchSampleSource(
  supabaseClient,
  { gameId, mode, realtimeEnabled: realtimeOverride } = {},
) {
  if (!gameId) {
    return {
      realtimeEnabled: false,
      sampleType: 'participant_pool',
      entries: [],
      queue: [],
      participantPool: [],
      generatedAt: new Date().toISOString(),
    }
  }

  let realtimeEnabled =
    typeof realtimeOverride === 'boolean'
      ? realtimeOverride
      : await loadRealtimeToggle(supabaseClient, gameId)

  const [queueEntries, participantPool] = await Promise.all([
    loadQueueEntries(supabaseClient, { gameId, mode }),
    loadParticipantPool(supabaseClient, gameId),
  ])

  const queueAnnotated = Array.isArray(queueEntries)
    ? queueEntries.map((entry) => ({
        ...entry,
        match_source: entry?.match_source || 'realtime_queue',
        standin: false,
        simulated: Boolean(entry?.simulated) && entry.simulated === true,
      }))
    : []

  const participantAnnotated = Array.isArray(participantPool)
    ? participantPool.map((entry) => ({
        ...entry,
        match_source: entry?.match_source || 'participant_pool',
        standin: true,
        simulated: true,
      }))
    : []

  const waitInfo = computeQueueWaitInfo(queueAnnotated)

  let sampleEntries = realtimeEnabled ? queueAnnotated.slice() : participantAnnotated.slice()
  let sampleType = realtimeEnabled ? 'realtime_queue' : 'participant_pool'
  let standins = []

  if (realtimeEnabled) {
    if (queueAnnotated.length === 0) {
      sampleEntries = participantAnnotated.slice()
      if (sampleEntries.length > 0) {
        sampleType = 'realtime_queue_fallback_pool'
      }
    } else if (
      typeof waitInfo.waitSeconds === 'number' &&
      waitInfo.waitSeconds < WAIT_THRESHOLD_SECONDS &&
      waitInfo.waitSeconds >= 0
    ) {
      sampleEntries = queueAnnotated.slice()
      sampleType = 'realtime_queue_waiting'
    } else {
      standins = buildStandinsForQueue(queueAnnotated, participantAnnotated)
      if (standins.length > 0) {
        sampleEntries = queueAnnotated.concat(standins)
        sampleType = 'realtime_queue_with_standins'
      } else {
        sampleEntries = queueAnnotated.slice()
        sampleType = 'realtime_queue'
      }
    }
  } else if (!Array.isArray(sampleEntries) || sampleEntries.length === 0) {
    sampleEntries = queueAnnotated.slice()
    if (Array.isArray(sampleEntries) && sampleEntries.length > 0) {
      sampleType = 'participant_pool_fallback_queue'
    }
  }

  return {
    realtimeEnabled: Boolean(realtimeEnabled),
    sampleType,
    entries: Array.isArray(sampleEntries) ? sampleEntries : [],
    queue: queueAnnotated,
    participantPool: participantAnnotated,
    generatedAt: new Date().toISOString(),
    queueWaitSeconds:
      typeof waitInfo.waitSeconds === 'number' && Number.isFinite(waitInfo.waitSeconds)
        ? waitInfo.waitSeconds
        : null,
    queueOldestJoinedAt: waitInfo.oldestJoinedAt,
    queueWaitThresholdSeconds: WAIT_THRESHOLD_SECONDS,
    standinCount: standins.length,
  }
}

function computeQueueWaitInfo(queueEntries = []) {
  if (!Array.isArray(queueEntries) || queueEntries.length === 0) {
    return { waitSeconds: null, oldestJoinedAt: null }
  }

  let oldestTimestamp = Number.POSITIVE_INFINITY
  let oldestIso = null

  queueEntries.forEach((entry) => {
    if (!entry) return
    const joined = entry.joined_at || entry.joinedAt
    if (!joined) return
    const parsed = Date.parse(joined)
    if (!Number.isFinite(parsed)) return
    if (parsed < oldestTimestamp) {
      oldestTimestamp = parsed
      oldestIso = new Date(parsed).toISOString()
    }
  })

  if (!Number.isFinite(oldestTimestamp)) {
    return { waitSeconds: null, oldestJoinedAt: null }
  }

  const now = Date.now()
  const diffMs = Math.max(0, now - oldestTimestamp)
  return { waitSeconds: diffMs / 1000, oldestJoinedAt: oldestIso }
}

function buildStandinsForQueue(queueEntries = [], participantPool = []) {
  if (!Array.isArray(queueEntries) || !Array.isArray(participantPool)) return []
  if (!queueEntries.length || !participantPool.length) return []

  const usedOwners = new Set()
  const usedHeroes = new Set()

  queueEntries.forEach((entry) => {
    if (!entry) return
    const owner = entry.owner_id || entry.ownerId || null
    const hero = entry.hero_id || entry.heroId || null
    if (owner) usedOwners.add(String(owner))
    if (hero) usedHeroes.add(String(hero))
  })

  const standins = []
  participantPool.forEach((candidate) => {
    if (!candidate) return
    const owner = candidate.owner_id || candidate.ownerId || null
    if (owner && usedOwners.has(String(owner))) return
    const hero = candidate.hero_id || candidate.heroId || null
    if (hero && usedHeroes.has(String(hero))) return

    const clone = {
      ...candidate,
      match_source: 'participant_pool',
      standin: true,
      simulated: true,
    }

    standins.push(clone)
    if (owner) usedOwners.add(String(owner))
    if (hero) usedHeroes.add(String(hero))
  })

  return standins
}

export async function loadQueueEntries(supabaseClient, { gameId, mode }) {
  if (!gameId) return []
  const queueModes = getQueueModes(mode)
  const filters = queueModes.length ? queueModes : [mode].filter(Boolean)
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient
      .from(table)
      .select('id, game_id, mode, owner_id, hero_id, role, score, joined_at, status, party_key')
      .eq('game_id', gameId)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true })
    if (filters.length > 1) {
      query = query.in('mode', filters)
    } else if (filters.length === 1) {
      query = query.eq('mode', filters[0])
    }
    return query
  })
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows.map((row) => ({
    ...row,
    match_source: row?.match_source || 'realtime_queue',
    simulated: Boolean(row?.simulated) && row.simulated === true,
    standin: false,
  }))
}

export async function removeQueueEntry(supabaseClient, { gameId, mode, ownerId }) {
  if (!gameId || !ownerId) return { ok: true }
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) =>
    supabaseClient
      .from(table)
      .delete()
      .eq('game_id', gameId)
      .eq('mode', mode)
      .eq('owner_id', ownerId),
  )
  if (result?.error) {
    console.warn('큐 제거 실패:', result.error)
    return { ok: false, error: result.error.message || '대기열에서 제거하지 못했습니다.' }
  }
  return { ok: true }
}

export async function enqueueParticipant(
  supabaseClient,
  { gameId, mode, ownerId, heroId, role, score = 1000, partyKey = null },
) {
  if (!gameId || !mode || !ownerId || !role) {
    return { ok: false, error: '대기열에 필요한 정보가 부족합니다.' }
  }

  const payload = {
    game_id: gameId,
    mode,
    owner_id: ownerId,
    hero_id: heroId ?? null,
    role,
    score,
    party_key: partyKey,
    status: 'waiting',
    joined_at: nowIso(),
    updated_at: nowIso(),
  }

  const insert = await withTable(supabaseClient, 'rank_match_queue', async (table) => {
    // Supabase upsert requires unique constraint, so attempt delete + insert.
    await supabaseClient
      .from(table)
      .delete()
      .eq('game_id', gameId)
      .eq('mode', mode)
      .eq('owner_id', ownerId)
      .in('status', ['waiting', 'matched'])

    return supabaseClient.from(table).insert(payload, { defaultToNull: false })
  })

  if (insert?.error) {
    console.error('대기열 등록 실패:', insert.error)
    return { ok: false, error: insert.error.message || '대기열에 등록하지 못했습니다.' }
  }

  return { ok: true }
}

export function runMatching({ mode, roles, queue }) {
  const matcherKey = getMatcherKey(mode)
  const matcher = MATCHER_BY_KEY[matcherKey] || MATCHER_BY_KEY[mode]
  if (!matcher) {
    return { ready: false, assignments: [], totalSlots: 0, error: { type: 'unsupported_mode' } }
  }
  const partySize = getDefaultPartySize(mode)
  return matcher({ roles, queue, partySize })
}

export function extractViewerAssignment({ assignments = [], viewerId }) {
  if (!viewerId) return null
  for (const assignment of assignments) {
    if (!Array.isArray(assignment.members)) continue
    const matched = assignment.members.some((member) => {
      if (!member) return false
      if (member.owner_id && member.owner_id === viewerId) return true
      if (member.ownerId && member.ownerId === viewerId) return true
      return false
    })
    if (matched) {
      return assignment
    }
  }
  return null
}

export async function markAssignmentsMatched(
  supabaseClient,
  { assignments = [], gameId, mode, matchCode },
) {
  const ids = new Set()
  const ownerIds = new Set()
  assignments.forEach((assignment) => {
    ensureArray(assignment.members).forEach((member) => {
      if (member?.id) {
        ids.add(member.id)
      }
      const ownerId = member?.owner_id || member?.ownerId
      if (ownerId) {
        ownerIds.add(ownerId)
      }
    })
  })
  if (ids.size > 0) {
    const payload = {
      status: 'matched',
      updated_at: nowIso(),
    }
    if (matchCode) payload.match_code = matchCode

    const result = await withTable(supabaseClient, 'rank_match_queue', (table) =>
      supabaseClient
        .from(table)
        .update(payload)
        .in('id', Array.from(ids)),
    )
    if (result?.error) {
      console.warn('매칭 상태 갱신 실패:', result.error)
    }
  }

  if (ownerIds.size > 0) {
    await lockParticipantsForAssignments(supabaseClient, { gameId, ownerIds: Array.from(ownerIds) })
  }
}

async function lockParticipantsForAssignments(supabaseClient, { gameId, ownerIds }) {
  if (!gameId || !Array.isArray(ownerIds) || ownerIds.length === 0) return

  const now = nowIso()
  const filterOwners = Array.from(new Set(ownerIds.filter(Boolean)))
  if (!filterOwners.length) return

  const result = await withTable(supabaseClient, 'rank_participants', (table) => {
    let query = supabaseClient
      .from(table)
      .update({ status: 'engaged', updated_at: now })
      .eq('game_id', gameId)
      .in('owner_id', filterOwners)

    query = query.not('status', 'in', '("victory","defeated","retired","eliminated")')

    return query
  })

  if (result?.error) {
    console.warn('참가자 잠금 실패:', result.error)
  }
}

export async function loadHeroesByIds(supabaseClient, heroIds) {
  const unique = Array.from(new Set(heroIds.filter(Boolean)))
  if (!unique.length) return new Map()
  const result = await withTable(supabaseClient, 'heroes', (table) =>
    supabaseClient
      .from(table)
      .select('id, name, image_url, owner_id')
      .in('id', unique),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        imageUrl: row.image_url,
        image_url: row.image_url,
        ownerId: row.owner_id,
      },
    ]),
  )
}

export function flattenAssignmentMembers(assignments = []) {
  const members = []
  assignments.forEach((assignment) => {
    ensureArray(assignment.members).forEach((member) => {
      if (member) members.push(member)
    })
  })
  return members
}
