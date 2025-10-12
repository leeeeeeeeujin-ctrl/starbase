import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  formatCandidate,
  normalizeExcludeOwnerIds,
  pickRandomCandidateForSeat,
  sanitizeSeatRequests,
  toNumber,
  toOptionalUuid,
} from '@/lib/rank/asyncStandinUtils'

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
  const excludeOwnerIds = normalizeExcludeOwnerIds(body.exclude_owner_ids ?? body.excludeOwnerIds)

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
    roleFallbacks: 0,
    scoreToleranceExpansions: 0,
    scoreToleranceMax: 0,
    randomizedAssignments: 0,
  }

  async function executeStandinRpc(params) {
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

    const candidates = Array.isArray(rpcResult?.data) ? rpcResult.data : []
    return { data: candidates }
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

    const primaryResult = await executeStandinRpc(params)
    if (primaryResult.error) {
      return res.status(500).json(primaryResult.error)
    }

    let candidates = primaryResult.data

    let selection = pickRandomCandidateForSeat({
      candidates,
      seat,
      excludedOwners,
    })

    if (!selection && params.p_role) {
      const fallbackParams = { ...params, p_role: null }
      const fallbackResult = await executeStandinRpc(fallbackParams)
      if (fallbackResult.error) {
        return res.status(500).json(fallbackResult.error)
      }
      candidates = fallbackResult.data
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
      continue
    }

    const normalized = formatCandidate(selection.row)
    if (!normalized?.ownerId) {
      continue
    }

    excludedOwners.add(normalized.ownerId)
    if (selection.tolerance !== null && selection.tolerance !== undefined) {
      diagnostics.scoreToleranceMax = Math.max(
        diagnostics.scoreToleranceMax,
        selection.tolerance,
      )
    }
    if (selection.iteration > 0) {
      diagnostics.scoreToleranceExpansions += selection.iteration
    }
    if (selection.poolSize > 1) {
      diagnostics.randomizedAssignments += 1
    }

    queue.push(normalized)
    assignments.push({
      slotIndex: seat.slotIndex,
      candidate: normalized,
      selection: {
        tolerance: selection.tolerance,
        iteration: selection.iteration,
        poolSize: selection.poolSize,
      },
    })
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
