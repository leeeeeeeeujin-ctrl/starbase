import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'

const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000
const CIRCUIT_REASONS = {
  ORDERED_SET: 'ordered_set_failure',
  MISSING: 'missing_rpc',
  PERMISSION: 'permission_error',
  GENERIC: 'rpc_failure',
}

let rpcCircuit = {
  disabledUntil: 0,
  reason: null,
  lastSupabaseError: null,
  lastHint: null,
}

function now() {
  return Date.now()
}

function isCircuitActive() {
  return rpcCircuit.disabledUntil > now()
}

function remainingCircuitMs() {
  if (!isCircuitActive()) return 0
  return Math.max(0, rpcCircuit.disabledUntil - now())
}

function getCircuitDiagnostics() {
  if (!isCircuitActive()) {
    return {
      active: false,
      reason: null,
      disabledUntil: null,
      remainingMs: 0,
      supabaseError: null,
      hint: null,
    }
  }

  return {
    active: true,
    reason: rpcCircuit.reason || CIRCUIT_REASONS.GENERIC,
    disabledUntil: rpcCircuit.disabledUntil,
    remainingMs: remainingCircuitMs(),
    supabaseError: rpcCircuit.lastSupabaseError || null,
    hint: rpcCircuit.lastHint || null,
  }
}

function tripCircuit({ reason, supabaseError, hint }) {
  rpcCircuit = {
    disabledUntil: now() + CIRCUIT_COOLDOWN_MS,
    reason: reason || CIRCUIT_REASONS.GENERIC,
    lastSupabaseError: supabaseError || null,
    lastHint: hint || null,
  }
}

function resetCircuit() {
  rpcCircuit = {
    disabledUntil: 0,
    reason: null,
    lastSupabaseError: null,
    lastHint: null,
  }
}

function parseBody(req) {
  if (!req?.body) return {}
  if (typeof req.body === 'object') return req.body
  try {
    return JSON.parse(req.body)
  } catch (error) {
    return {}
  }
}

function toOptionalUuid(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function normaliseRpcPayload({ gameId, ownerId }) {
  const payload = {}
  const trimmedGameId = toOptionalUuid(gameId)
  if (trimmedGameId) {
    payload.p_game_id = trimmedGameId
  }
  const trimmedOwnerId = toOptionalUuid(ownerId)
  if (trimmedOwnerId) {
    payload.p_owner_id = trimmedOwnerId
  }
  return payload
}

function isOrderedSetAggregateError(error) {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (!message.trim()) return false
  return message.includes('ordered-set') && message.includes('within group')
}

function serializeSupabaseError(error) {
  if (!error) return null
  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed ? { message: trimmed } : null
  }

  const payload = {}
  const assign = (key, value) => {
    if (value === null || value === undefined) return
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return
      payload[key] = trimmed
      return
    }
    payload[key] = value
  }

  assign('code', error.code)
  assign('status', error.status)
  assign('name', error.name)
  assign('message', error.message)
  assign('details', error.details)
  assign('hint', error.hint)

  if (!Object.keys(payload).length) {
    return { message: String(error) }
  }

  return payload
}

function formatSessionRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = toOptionalUuid(row.id)
  if (!id) return null
  const ownerId = toOptionalUuid(row.owner_id ?? row.ownerId)
  const matchMode =
    (row.match_mode && String(row.match_mode).trim()) ||
    (row.matchMode && String(row.matchMode).trim()) ||
    (row.mode && String(row.mode).trim()) ||
    null

  return {
    id,
    status: row.status ?? null,
    owner_id: ownerId,
    ownerId,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    match_mode: matchMode,
    mode: matchMode,
  }
}

async function fetchViaRpc(payload) {
  const { data, error } = await supabaseAdmin.rpc('fetch_latest_rank_session_v2', payload)
  if (error) {
    return { error }
  }
  return { row: formatSessionRow(data), raw: data }
}

async function runLatestSessionQuery(gameId, ownerId, columns) {
  return withTableQuery(supabaseAdmin, 'rank_sessions', (from, tableName) => {
    let query = from
      .select(columns)
      .eq('game_id', gameId)
      .in('status', ['active', 'preparing', 'ready'])
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }
    return query.maybeSingle().then((result) => ({ ...result, table: tableName }))
  })
}

async function fetchViaTable(gameId, ownerId) {
  const primary = await runLatestSessionQuery(
    gameId,
    ownerId,
    'id, status, owner_id, created_at, updated_at, mode',
  )

  if (!primary.error) {
    return {
      row: formatSessionRow(primary.data),
      table: primary.table || null,
      via: 'table',
      orderedSetError: null,
      orderedSetRecovered: false,
    }
  }

  const code = String(primary.error?.code || '').toUpperCase()
  const orderedSetFailure = code === '42809' || isOrderedSetAggregateError(primary.error)

  if (!orderedSetFailure) {
    return {
      error: primary.error,
      table: primary.table || null,
      via: 'table-error',
      orderedSetError: null,
      orderedSetRecovered: false,
    }
  }

  const fallback = await runLatestSessionQuery(
    gameId,
    ownerId,
    'id, status, owner_id, created_at, updated_at',
  )

  if (!fallback.error) {
    return {
      row: formatSessionRow(fallback.data),
      table: fallback.table || primary.table || null,
      via: 'table-ordered-set-recovery',
      orderedSetError: primary.error,
      orderedSetRecovered: true,
    }
  }

  return {
    error: fallback.error || primary.error,
    table: fallback.table || primary.table || null,
    via: 'table-error',
    orderedSetError: primary.error,
    orderedSetRecovered: false,
  }
}

function buildFallbackResponse({
  fallback,
  supabaseError = null,
  fallbackError = null,
  hint = null,
  includeCircuit = false,
}) {
  const serializedSupabaseError = serializeSupabaseError(supabaseError)
  const serializedFallbackError = serializeSupabaseError(fallbackError)

  const responsePayload = {
    session: fallback.row || null,
    error: fallback.error ? 'rpc_failed' : fallback.via === 'table' ? null : 'rpc_failed',
    supabaseError: serializedSupabaseError,
    hint: hint || null,
    via: fallback.via,
  }

  if (!responsePayload.error) {
    delete responsePayload.error
  }

  if (!responsePayload.hint) {
    delete responsePayload.hint
  }

  if (!responsePayload.supabaseError) {
    delete responsePayload.supabaseError
  }

  if (fallback.table) {
    responsePayload.table = fallback.table
  }

  if (serializedFallbackError) {
    responsePayload.fallbackError = serializedFallbackError
  }

  if (fallback.orderedSetRecovered) {
    responsePayload.orderedSetRecovered = true
  }

  const diagnostics = {
    error: fallback.error ? 'rpc_failed' : responsePayload.error || null,
    supabaseError: serializedSupabaseError,
    fallbackError: serializedFallbackError,
    hint: hint || null,
    via: fallback.via,
    table: fallback.table || null,
    orderedSetRecovered: Boolean(fallback.orderedSetRecovered),
  }

  if (includeCircuit) {
    diagnostics.circuitBreaker = getCircuitDiagnostics()
  }

  responsePayload.diagnostics = diagnostics

  if (includeCircuit) {
    responsePayload.circuitBreaker = getCircuitDiagnostics()
  }

  return responsePayload
}

function isMissingRpc(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  if (code && ['42883', '42P01', 'PGRST204', 'PGRST301'].includes(code)) {
    return true
  }
  const merged = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
    .toLowerCase()
    .trim()
  if (!merged) return false
  if (merged.includes('does not exist') && merged.includes('function')) {
    return true
  }
  return merged.includes('missing') && merged.includes('fetch_latest_rank_session_v2')
}

function isPermissionError(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  if (['42501', 'PGRST301', 'PGRST302'].includes(code)) {
    return true
  }
  const merged = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
    .toLowerCase()
    .trim()
  if (!merged) return false
  if (merged.includes('permission') && merged.includes('denied')) return true
  if (merged.includes('not authorised') || merged.includes('not authorized')) return true
  if (merged.includes('no api key')) return true
  if (merged.includes('jwterror') || merged.includes('jwt expired')) return true
  return false
}

function buildRpcHint(error) {
  if (!error) {
    return [
      'fetch_latest_rank_session_v2 RPC 호출이 실패했습니다. Supabase SQL Editor에서 `docs/sql/fetch-latest-rank-session.sql` 스크립트를 다시 실행해 함수 정의와 권한이 최신인지 확인하세요.',
    ].join(' ')
  }

  if (isOrderedSetAggregateError(error) || String(error.code || '').toUpperCase() === '42809') {
    return [
      'fetch_latest_rank_session_v2 RPC에 ordered-set 집계를 사용할 때 WITHIN GROUP 절이 빠져 있습니다.',
      'Supabase SQL Editor에서 percentile, mode와 같은 ordered-set 집계를 호출하는 구문에 `WITHIN GROUP (ORDER BY ...)` 절을 추가하고, docs/sql/fetch-latest-rank-session.sql 최신 버전을 재배포하세요.',
    ].join(' ')
  }

  if (isMissingRpc(error)) {
    return [
      'fetch_latest_rank_session_v2 RPC가 배포되어 있지 않습니다.',
      'Supabase SQL Editor에서 `docs/sql/fetch-latest-rank-session.sql` 파일의 전체 내용을 붙여넣어 함수를 생성하고, service_role과 authenticated 역할에 GRANT 문을 실행하세요.',
    ].join(' ')
  }

  if (isPermissionError(error)) {
    return [
      'fetch_latest_rank_session_v2 RPC에 접근할 권한이 없습니다.',
      'Supabase Dashboard에서 해당 함수에 service_role 및 authenticated 역할이 EXECUTE 권한을 갖고 있는지 확인하고, 누락 시 GRANT 문을 다시 실행하세요.',
    ].join(' ')
  }

  return [
    'fetch_latest_rank_session_v2 RPC 호출이 실패했습니다.',
    'Supabase SQL Editor에서 RPC 정의와 권한을 재배포하고, PostgREST 로그에 추가 오류가 없는지 확인하세요.',
  ].join(' ')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const body = parseBody(req)
  const payload = normaliseRpcPayload({
    gameId: body.gameId ?? body.game_id,
    ownerId: body.ownerId ?? body.owner_id,
  })

  if (!payload.p_game_id) {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const ownerId = payload.p_owner_id || null

  if (isCircuitActive()) {
    const circuit = getCircuitDiagnostics()
    const fallback = await fetchViaTable(payload.p_game_id, ownerId)
    const fallbackError = fallback.error || fallback.orderedSetError || null
    const responsePayload = buildFallbackResponse({
      fallback,
      supabaseError: circuit.supabaseError,
      fallbackError,
      hint: circuit.hint,
      includeCircuit: true,
    })

    const statusCode = fallback.error ? 502 : 200

    return res.status(statusCode).json(responsePayload)
  }

  try {
    const { row, error } = await fetchViaRpc(payload)
    if (error) {
      const code = String(error?.code || '').toUpperCase()
      const orderedSetError = code === '42809' || isOrderedSetAggregateError(error)
      if (orderedSetError || isMissingRpc(error) || isPermissionError(error)) {
        const fallback = await fetchViaTable(payload.p_game_id, payload.p_owner_id || null)
        const supabaseError = serializeSupabaseError(error)
        const fallbackError = fallback.error || fallback.orderedSetError || null
        const hint = buildRpcHint(error)

        tripCircuit({
          reason: orderedSetError
            ? CIRCUIT_REASONS.ORDERED_SET
            : isMissingRpc(error)
            ? CIRCUIT_REASONS.MISSING
            : isPermissionError(error)
            ? CIRCUIT_REASONS.PERMISSION
            : CIRCUIT_REASONS.GENERIC,
          supabaseError,
          hint,
        })

        const responsePayload = buildFallbackResponse({
          fallback,
          supabaseError,
          fallbackError,
          hint,
          includeCircuit: true,
        })

        return res.status(fallback.error ? 502 : 200).json(responsePayload)
      }

      return res
        .status(502)
        .json({
          error: 'rpc_failed',
          supabaseError: serializeSupabaseError(error),
          hint: buildRpcHint(error),
        })
    }

    resetCircuit()
    return res.status(200).json({ session: row || null, circuitBreaker: getCircuitDiagnostics() })
  } catch (error) {
    return res.status(500).json({
      error: 'rpc_exception',
      detail: String(error?.message || error),
      hint: 'Supabase RPC 요청 처리 중 예외가 발생했습니다. 서버 로그를 확인하고 fetch_latest_rank_session_v2 정의를 재배포하세요.',
    })
  }
}
