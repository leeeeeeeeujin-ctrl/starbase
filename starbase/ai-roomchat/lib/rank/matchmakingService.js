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

export async function loadParticipantPool(supabaseClient, gameId) {
  if (!gameId) return []

  const result = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select('id, owner_id, hero_id, role, score, rating, status, updated_at, created_at')
      .eq('game_id', gameId),
  )

  if (result?.error) throw result.error

  const rows = Array.isArray(result?.data) ? result.data : []
  const alive = rows.filter((row) => (row?.status || 'alive') !== 'dead')
  const eligible = alive.filter((row) => {
    if (!row) return false
    const role = row.role || row.role_name || row.roleName
    if (!role) return false
    if (!row.hero_id && !row.heroId) return false
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
    hero_id: row.hero_id || null,
    role: row.role || '',
    score: deriveParticipantScore(row),
    rating: deriveParticipantScore(row),
    status: 'waiting',
    joined_at: row.updated_at || row.created_at || null,
    simulated: true,
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
  return Array.isArray(result?.data) ? result.data : []
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
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, imageUrl: row.image_url, ownerId: row.owner_id }]))
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
