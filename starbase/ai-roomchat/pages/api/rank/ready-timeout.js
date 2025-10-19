import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'
import { withTableQuery } from '@/lib/supabaseTables'
import {
  createPlaceholderCandidate,
  formatCandidate,
  pickRandomCandidateForSeat,
  toNumber,
  toOptionalUuid,
  toTrimmed,
} from '@/lib/rank/asyncStandinUtils'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for ready-timeout API')
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
})

function buildRpcHint() {
  return [
    'fetch_rank_async_standin_pool RPC 호출이 실패했습니다.',
    'Supabase SQL Editor에서 docs/sql/fetch-rank-async-standin-pool.sql 스크립트를 실행해 함수를 배포하고,',
    'service_role/authenticated 역할에 EXECUTE 권한을 부여했는지 확인하세요.',
  ].join(' ')
}

function toTrimmedString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeOwnerId(value) {
  const trimmed = toOptionalUuid(value)
  return trimmed || null
}

function normalizeSlotIndex(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null
  }
  return numeric
}

function buildHeroSummary(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id || null,
    name: row.name || '',
    description: row.description || '',
    image_url: row.image_url || '',
    background_url: row.background_url || '',
    bgm_url: row.bgm_url || '',
    bgm_duration_seconds: Number(row.bgm_duration_seconds) || null,
    ability1: row.ability1 || '',
    ability2: row.ability2 || '',
    ability3: row.ability3 || '',
    ability4: row.ability4 || '',
  }
}

async function fetchCandidateForSeat({ gameId, seat, excludedOwners, diagnostics }) {
  const params = {
    p_game_id: gameId,
    p_role: seat.role || null,
    p_limit: 8,
    p_reference_score: seat.score,
    p_reference_rating: seat.rating,
  }

  if (excludedOwners.size) {
    params.p_excluded_owner_ids = Array.from(excludedOwners)
  }

  let rpcResult
  try {
    rpcResult = await supabaseAdmin.rpc('fetch_rank_async_standin_pool', params)
    diagnostics.rpcCalls += 1
  } catch (rpcError) {
    return {
      error: {
        error: 'rpc_failed',
        hint: buildRpcHint(),
        supabaseError: { message: rpcError?.message || 'rpc_exception' },
      },
    }
  }

  if (rpcResult?.error) {
    return {
      error: {
        error: 'rpc_failed',
        hint: buildRpcHint(),
        supabaseError: rpcResult.error,
      },
    }
  }

  let candidates = Array.isArray(rpcResult?.data) ? rpcResult.data : []

  let selection = pickRandomCandidateForSeat({
    candidates,
    seat,
    excludedOwners,
  })

  if (!selection && params.p_role) {
    const fallbackParams = { ...params, p_role: null }
    let fallbackResult
    try {
      fallbackResult = await supabaseAdmin.rpc('fetch_rank_async_standin_pool', fallbackParams)
      diagnostics.rpcCalls += 1
    } catch (fallbackError) {
      return {
        error: {
          error: 'rpc_failed',
          hint: buildRpcHint(),
          supabaseError: { message: fallbackError?.message || 'rpc_exception' },
        },
      }
    }

    if (fallbackResult?.error) {
      return {
        error: {
          error: 'rpc_failed',
          hint: buildRpcHint(),
          supabaseError: fallbackResult.error,
        },
      }
    }

    candidates = Array.isArray(fallbackResult?.data) ? fallbackResult.data : []
    if (candidates.length) {
      diagnostics.roleFallbacks += 1
      selection = pickRandomCandidateForSeat({
        candidates,
        seat,
        excludedOwners,
      })
    }
  }

  if (!selection) {
    return { candidate: null }
  }

  if (selection.tolerance !== null && selection.tolerance !== undefined) {
    diagnostics.scoreToleranceMax = Math.max(diagnostics.scoreToleranceMax, selection.tolerance)
  }
  if (selection.iteration > 0) {
    diagnostics.scoreToleranceExpansions += selection.iteration
  }
  if (selection.poolSize > 1) {
    diagnostics.randomizedAssignments += 1
  }

  const normalized = formatCandidate(selection.row)
  if (!normalized?.ownerId) {
    return { candidate: null }
  }

  return {
    candidate: normalized,
    selection,
  }
}

function mapRosterRows(rows = []) {
  return rows
    .map((row) => {
      const slotIndex = normalizeSlotIndex(row?.slot_index ?? row?.slotIndex)
      if (slotIndex === null) return null

      return {
        matchInstanceId: toOptionalUuid(row?.match_instance_id ?? row?.matchInstanceId) || null,
        roomId: toOptionalUuid(row?.room_id ?? row?.roomId) || null,
        gameId: toOptionalUuid(row?.game_id ?? row?.gameId) || null,
        slotIndex,
        slotId: row?.slot_id ?? row?.slotId ?? null,
        role: toTrimmed(row?.role) || '역할 미지정',
        ownerId: normalizeOwnerId(row?.owner_id ?? row?.ownerId),
        heroId: toOptionalUuid(row?.hero_id ?? row?.heroId),
        heroName: toTrimmed(row?.hero_name ?? row?.heroName),
        ready: row?.ready === true,
        joinedAt: row?.joined_at ?? row?.joinedAt ?? null,
        score: toNumber(row?.score),
        rating: toNumber(row?.rating),
        battles: toNumber(row?.battles),
        winRate: row?.win_rate !== undefined && row?.win_rate !== null ? Number(row.win_rate) : null,
        status: toTrimmed(row?.status) || null,
        standin: row?.standin === true,
        matchSource: toTrimmed(row?.match_source ?? row?.matchSource) || null,
        createdAt: row?.created_at ?? row?.createdAt ?? null,
        updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
        slotTemplateVersion: toNumber(row?.slot_template_version) || Date.now(),
        slotTemplateSource: toTrimmed(row?.slot_template_source) || 'ready-timeout',
        slotTemplateUpdatedAt: row?.slot_template_updated_at ?? row?.slotTemplateUpdatedAt ?? null,
        heroSummary: row?.hero_summary ?? row?.heroSummary ?? null,
      }
    })
    .filter(Boolean)
}

function buildSeatDescriptor(entry) {
  return {
    slotIndex: entry.slotIndex,
    role: toTrimmed(entry.role) || null,
    score: entry.score !== null && entry.score !== undefined ? Math.floor(entry.score) : null,
    rating: entry.rating !== null && entry.rating !== undefined ? Math.floor(entry.rating) : null,
  }
}

async function resolveHeroSummaries(heroIds = []) {
  if (!heroIds.length) return new Map()

  const unique = Array.from(new Set(heroIds.map((id) => toOptionalUuid(id)).filter(Boolean)))
  if (!unique.length) return new Map()

  const { data, error } = await withTableQuery(supabaseAdmin, 'heroes', (from) =>
    from
      .select(
        'id, name, description, image_url, background_url, bgm_url, bgm_duration_seconds, ability1, ability2, ability3, ability4',
      )
      .in('id', unique),
  )

  if (error || !Array.isArray(data)) {
    return new Map()
  }

  const map = new Map()
  data.forEach((row) => {
    const key = toOptionalUuid(row?.id)
    if (key) {
      map.set(key, buildHeroSummary(row))
    }
  })
  return map
}

async function fetchRoomOwner(roomId) {
  if (!roomId) return null
  const { data, error } = await withTableQuery(supabaseAdmin, 'rank_rooms', (from) =>
    from.select('id, owner_id').eq('id', roomId).maybeSingle(),
  )
  if (error || !data) return null
  return toOptionalUuid(data.owner_id)
}

function buildInsertRows(original, replacements, heroSummaryMap, nowIso, defaultMeta) {
  return original.map((entry) => {
    const replacement = replacements.get(entry.slotIndex)
    if (!replacement) {
      return {
        match_instance_id: entry.matchInstanceId || defaultMeta.matchInstanceId,
        room_id: entry.roomId || defaultMeta.roomId,
        game_id: entry.gameId || defaultMeta.gameId,
        slot_index: entry.slotIndex,
        slot_id: entry.slotId,
        role: entry.role,
        owner_id: entry.ownerId,
        hero_id: entry.heroId,
        hero_name: entry.heroName,
        hero_summary: entry.heroSummary,
        ready: entry.ready,
        joined_at: entry.joinedAt,
        score: entry.score,
        rating: entry.rating,
        battles: entry.battles,
        win_rate: entry.winRate,
        status: entry.status,
        standin: entry.standin,
        match_source: entry.matchSource,
        created_at: entry.createdAt || nowIso,
        updated_at: nowIso,
      }
    }

    const { candidate, placeholder, metadata } = replacement
    const heroSummary = candidate.heroId ? heroSummaryMap.get(candidate.heroId) || null : null

    return {
      match_instance_id: metadata.matchInstanceId || entry.matchInstanceId || defaultMeta.matchInstanceId,
      room_id: metadata.roomId || entry.roomId || defaultMeta.roomId,
      game_id: metadata.gameId || entry.gameId || defaultMeta.gameId,
      slot_index: entry.slotIndex,
      slot_id: entry.slotId,
      role: candidate.role || entry.role,
      owner_id: candidate.ownerId || null,
      hero_id: candidate.heroId || null,
      hero_name: candidate.heroName || (placeholder ? 'AI 자동 대역' : entry.heroName),
      hero_summary: heroSummary,
      ready: true,
      joined_at: nowIso,
      score: candidate.score ?? entry.score ?? null,
      rating: candidate.rating ?? entry.rating ?? null,
      battles: candidate.battles ?? entry.battles ?? null,
      win_rate: candidate.winRate ?? entry.winRate ?? null,
      status: 'standin',
      standin: true,
      match_source: placeholder ? 'ready_timeout_placeholder' : 'ready_timeout',
      created_at: entry.createdAt || nowIso,
      updated_at: nowIso,
    }
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  const userId = toOptionalUuid(userData?.user?.id)
  if (userError || !userId) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {}
  const matchInstanceId = toOptionalUuid(payload.match_instance_id ?? payload.matchInstanceId)
  const gameId = toOptionalUuid(payload.game_id ?? payload.gameId)
  const roomId = toOptionalUuid(payload.room_id ?? payload.roomId)
  const missingOwnerIdsRaw = Array.isArray(payload.missing_owner_ids ?? payload.missingOwnerIds)
    ? payload.missing_owner_ids ?? payload.missingOwnerIds
    : []

  if (!matchInstanceId || !gameId) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const missingOwnerIds = missingOwnerIdsRaw
    .map((value) => toOptionalUuid(value))
    .filter(Boolean)

  if (!missingOwnerIds.length) {
    return res.status(200).json({ updated: false, assignments: [], message: 'no_missing_owners' })
  }

  const roomOwnerId = await fetchRoomOwner(roomId)

  if (!roomOwnerId) {
    return res.status(404).json({ error: 'room_not_found' })
  }

  if (roomOwnerId !== userId) {
    const { data: rosterMembership } = await withTableQuery(
      supabaseAdmin,
      'rank_match_roster',
      (from) =>
        from
          .select('owner_id')
          .eq('match_instance_id', matchInstanceId)
          .eq('owner_id', userId)
          .limit(1),
    )

    if (!Array.isArray(rosterMembership) || rosterMembership.length === 0) {
      return res.status(403).json({ error: 'forbidden' })
    }
  }

  const rosterResult = await withTableQuery(supabaseAdmin, 'rank_match_roster', (from) =>
    from
      .select(
        'match_instance_id, room_id, game_id, slot_index, slot_id, role, owner_id, hero_id, hero_name, hero_summary, ready, joined_at, score, rating, battles, win_rate, status, standin, match_source, created_at, updated_at, slot_template_version, slot_template_source, slot_template_updated_at',
      )
      .eq('match_instance_id', matchInstanceId)
      .order('slot_index', { ascending: true }),
  )

  if (rosterResult.error) {
    return res.status(500).json({ error: 'roster_fetch_failed', details: rosterResult.error.message })
  }

  const rosterRows = Array.isArray(rosterResult.data) ? rosterResult.data : []
  if (!rosterRows.length) {
    return res.status(404).json({ error: 'roster_not_found' })
  }

  const normalizedRoster = mapRosterRows(rosterRows)
  const missingOwnerSet = new Set(missingOwnerIds)
  const seatsToReplace = normalizedRoster.filter((entry) => entry.ownerId && missingOwnerSet.has(entry.ownerId))

  if (!seatsToReplace.length) {
    return res.status(200).json({ updated: false, assignments: [], message: 'no_target_seats' })
  }

  const excludedOwners = new Set(
    normalizedRoster.map((entry) => entry.ownerId).filter((value) => value && !missingOwnerSet.has(value)),
  )

  const diagnostics = {
    requestedSeats: seatsToReplace.length,
    rpcCalls: 0,
    roleFallbacks: 0,
    scoreToleranceExpansions: 0,
    scoreToleranceMax: 0,
    randomizedAssignments: 0,
  }

  const replacements = new Map()
  const assigned = []
  const placeholders = []

  for (const seatEntry of seatsToReplace) {
    const seat = buildSeatDescriptor(seatEntry)
    const selection = await fetchCandidateForSeat({
      gameId,
      seat,
      excludedOwners,
      diagnostics,
    })

    if (selection.error) {
      return res.status(500).json(selection.error)
    }

    if (selection.candidate) {
      excludedOwners.add(selection.candidate.ownerId)
      assigned.push({
        slotIndex: seatEntry.slotIndex,
        ownerId: selection.candidate.ownerId,
        heroId: selection.candidate.heroId || null,
        tolerance: selection.selection?.tolerance ?? null,
      })
      replacements.set(seatEntry.slotIndex, {
        candidate: selection.candidate,
        placeholder: false,
        metadata: {
          matchInstanceId,
          roomId: roomId || rosterRows[0]?.room_id || null,
          gameId,
        },
      })
      continue
    }

    const placeholderCandidate = createPlaceholderCandidate(seatEntry, seatEntry.slotIndex)
    placeholders.push({ slotIndex: seatEntry.slotIndex })
    replacements.set(seatEntry.slotIndex, {
      candidate: placeholderCandidate,
      placeholder: true,
      metadata: {
        matchInstanceId,
        roomId: roomId || rosterRows[0]?.room_id || null,
        gameId,
      },
    })
  }

  const heroIds = []
  replacements.forEach((value) => {
    if (value?.candidate?.heroId) {
      heroIds.push(value.candidate.heroId)
    }
  })

  const heroSummaryMap = await resolveHeroSummaries(heroIds)
  const nowIso = new Date().toISOString()
  const defaultMeta = {
    matchInstanceId,
    roomId: roomId || rosterRows[0]?.room_id || null,
    gameId,
  }
  const insertRows = buildInsertRows(normalizedRoster, replacements, heroSummaryMap, nowIso, defaultMeta)

  const slotTemplateVersion = insertRows.reduce((acc, row) => {
    const fromRoster = normalizedRoster.find((entry) => entry.slotIndex === row.slot_index)
    if (!fromRoster) return acc
    return Math.max(acc, fromRoster.slotTemplateVersion || 0)
  }, 0)

  const slotTemplateSource =
    normalizedRoster.find((entry) => entry.slotTemplateSource)?.slotTemplateSource || 'ready-timeout'

  const slotTemplateUpdatedAt = normalizedRoster.reduce((acc, entry) => {
    const timestamp = entry.slotTemplateUpdatedAt ? new Date(entry.slotTemplateUpdatedAt).toISOString() : null
    if (!timestamp) return acc
    return timestamp > acc ? timestamp : acc
  }, nowIso)

  const rpcPayload = {
    p_room_id: roomId || rosterRows[0]?.room_id || null,
    p_game_id: gameId,
    p_match_instance_id: matchInstanceId,
    p_request_owner_id: roomOwnerId,
    p_slot_template_version: slotTemplateVersion || Date.now(),
    p_slot_template_source: slotTemplateSource,
    p_slot_template_updated_at: slotTemplateUpdatedAt || nowIso,
    p_roster: insertRows,
  }

  const { error: syncError } = await supabaseAdmin.rpc('sync_rank_match_roster', rpcPayload)

  if (syncError) {
    const message = syncError.message || ''
    if (message.includes('room_owner_mismatch')) {
      return res.status(403).json({ error: 'forbidden' })
    }
    if (message.includes('room_not_found')) {
      return res.status(404).json({ error: 'room_not_found' })
    }
    return res.status(500).json({ error: 'sync_failed', supabaseError: syncError })
  }

  return res.status(200).json({
    updated: true,
    assignments: assigned,
    placeholders: placeholders.length,
    diagnostics,
  })
}
