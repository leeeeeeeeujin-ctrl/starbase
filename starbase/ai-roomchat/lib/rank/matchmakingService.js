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

export async function loadQueueEntries(supabaseClient, { gameId, mode }) {
  if (!gameId) return []
  const queueModes = getQueueModes(mode)
  const filters = queueModes.length ? queueModes : [mode].filter(Boolean)
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient
      .from(table)
      .select('id, game_id, mode, owner_id, hero_id, role, score, joined_at, status, party_key')
      .eq('game_id', gameId)
      .neq('status', 'cancelled')
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
  assignments.forEach((assignment) => {
    ensureArray(assignment.members).forEach((member) => {
      if (member?.id) {
        ids.add(member.id)
      }
    })
  })
  if (ids.size === 0) return

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
