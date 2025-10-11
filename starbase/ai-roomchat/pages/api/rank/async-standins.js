import { supabaseAdmin } from '@/lib/supabaseAdmin'

function toTrimmed(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toOptionalUuid(value) {
  const trimmed = toTrimmed(value)
  if (!trimmed) return null
  return trimmed
}

function toNumber(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function sanitizeSeatRequests(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return []
  return rawList
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const slotIndex = toNumber(entry.slotIndex ?? entry.slot_index)
      if (slotIndex === null || slotIndex < 0) return null
      const role = toTrimmed(entry.role)
      const score = toNumber(entry.score)
      const rating = toNumber(entry.rating)
      const exclusionList = Array.isArray(entry.excludeOwnerIds ?? entry.exclude_owner_ids)
        ? entry.excludeOwnerIds ?? entry.exclude_owner_ids
        : []
      return {
        slotIndex,
        role: role || null,
        score: score !== null ? Math.floor(score) : null,
        rating: rating !== null ? Math.floor(rating) : null,
        excludeOwnerIds: exclusionList
          .map((value) => toOptionalUuid(value))
          .filter((value) => typeof value === 'string'),
      }
    })
    .filter(Boolean)
}

function formatCandidate(row) {
  if (!row || typeof row !== 'object') return null
  const ownerId = toOptionalUuid(row.owner_id ?? row.ownerId)
  const heroId = toOptionalUuid(row.hero_id ?? row.heroId)
  const heroName = toTrimmed(row.hero_name ?? row.heroName)
  const role = toTrimmed(row.role)
  const score = toNumber(row.score)
  const rating = toNumber(row.rating)
  const battles = toNumber(row.battles)
  const winRate = row.win_rate !== undefined && row.win_rate !== null ? Number(row.win_rate) : null
  const status = toTrimmed(row.status)
  const updatedAt = row.updated_at || null
  const scoreGap = toNumber(row.score_gap)
  const ratingGap = toNumber(row.rating_gap)

  return {
    ownerId,
    heroId,
    heroName,
    role,
    score: score !== null ? score : null,
    rating: rating !== null ? rating : null,
    battles: battles !== null ? battles : null,
    winRate: winRate !== null && Number.isFinite(winRate) ? winRate : null,
    status: status || 'standin',
    updatedAt,
    scoreGap: scoreGap !== null ? scoreGap : null,
    ratingGap: ratingGap !== null ? ratingGap : null,
    matchSource: 'participant_pool',
  }
}

function buildRpcHint() {
  return [
    'fetch_rank_async_standin_pool RPC 호출이 실패했습니다.',
    'Supabase SQL Editor에서 docs/sql/fetch-rank-async-standin-pool.sql 스크립트를 실행해 함수를 배포하고, service_role/ authenticated 역할에 EXECUTE 권한이 있는지 확인하세요.',
  ].join(' ')
}

function normalizeLimit(value) {
  const numeric = toNumber(value)
  if (numeric === null) return 6
  if (numeric < 1) return 1
  if (numeric > 20) return 20
  return Math.floor(numeric)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const gameId = toOptionalUuid(body.game_id ?? body.gameId)
  const roomId = toOptionalUuid(body.room_id ?? body.roomId)
  const seatRequests = sanitizeSeatRequests(body.seat_requests ?? body.seatRequests)
  const excludeOwnerIds = Array.isArray(body.exclude_owner_ids ?? body.excludeOwnerIds)
    ? (body.exclude_owner_ids ?? body.excludeOwnerIds)
        .map((value) => toOptionalUuid(value))
        .filter((value) => typeof value === 'string')
    : []

  if (!gameId || seatRequests.length === 0) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const limit = normalizeLimit(body.limit)
  const queue = []
  const assignments = []
  const excludedOwners = new Set(excludeOwnerIds)
  const diagnostics = {
    requestedSeats: seatRequests.length,
    rpcCalls: 0,
    roomId: roomId || null,
  }

  for (const seat of seatRequests) {
    const params = {
      p_game_id: gameId,
      p_role: seat.role || null,
      p_limit: limit,
      p_reference_score: seat.score,
      p_reference_rating: seat.rating,
    }

    const ownersToExclude = new Set([...excludedOwners, ...(seat.excludeOwnerIds || [])])
    if (ownersToExclude.size > 0) {
      params.p_excluded_owner_ids = Array.from(ownersToExclude)
    }

    let rpcResult
    try {
      rpcResult = await supabaseAdmin.rpc('fetch_rank_async_standin_pool', params)
      diagnostics.rpcCalls += 1
    } catch (rpcError) {
      return res.status(500).json({
        error: 'rpc_failed',
        hint: buildRpcHint(),
        supabaseError: { message: rpcError?.message || 'rpc_exception' },
      })
    }

    if (rpcResult?.error) {
      return res.status(500).json({
        error: 'rpc_failed',
        hint: buildRpcHint(),
        supabaseError: rpcResult.error,
      })
    }

    const candidates = Array.isArray(rpcResult?.data) ? rpcResult.data : []
    if (!candidates.length) {
      continue
    }

    const chosen = candidates.find((row) => {
      const ownerId = toOptionalUuid(row?.owner_id)
      if (!ownerId) return false
      return !excludedOwners.has(ownerId)
    })

    if (!chosen) {
      continue
    }

    const normalized = formatCandidate(chosen)
    if (!normalized?.ownerId) {
      continue
    }

    excludedOwners.add(normalized.ownerId)
    queue.push(normalized)
    assignments.push({ slotIndex: seat.slotIndex, candidate: normalized })
  }

  return res.status(200).json({
    queue,
    assignments,
    diagnostics: {
      ...diagnostics,
      assigned: assignments.length,
      excludedOwners: Array.from(excludedOwners),
    },
  })
}
