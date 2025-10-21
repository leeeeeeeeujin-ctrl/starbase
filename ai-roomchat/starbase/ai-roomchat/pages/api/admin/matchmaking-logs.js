import { supabase } from '@/lib/rank/db'
import { withTable } from '@/lib/supabaseTables'
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors'

const MAX_LIMIT = 200

function coerceLimit(raw) {
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return 50
  return Math.min(Math.max(1, Math.floor(numeric)), MAX_LIMIT)
}

function sanitizeMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

function toStageBuckets(rows) {
  const map = new Map()
  rows.forEach((row) => {
    const stage = row.stage || 'unknown'
    if (!map.has(stage)) {
      map.set(stage, {
        stage,
        total: 0,
        matched: 0,
        pending: 0,
        errors: 0,
        other: 0,
        lastSeen: null,
      })
    }
    const bucket = map.get(stage)
    bucket.total += 1
    if (row.status === 'matched') {
      bucket.matched += 1
    } else if (row.status === 'pending' || row.status === 'skipped') {
      bucket.pending += 1
    } else if (row.status === 'error' || row.status === 'missing_dependency') {
      bucket.errors += 1
    } else {
      bucket.other += 1
    }
    const createdAt = Date.parse(row.created_at)
    if (Number.isFinite(createdAt)) {
      if (!bucket.lastSeen || createdAt > Date.parse(bucket.lastSeen)) {
        bucket.lastSeen = new Date(createdAt).toISOString()
      }
    }
  })
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

function toStatusCounts(rows) {
  const counts = {}
  rows.forEach((row) => {
    const key = row.status || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  })
  return counts
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const limit = coerceLimit(req.query?.limit)
  const rawSimple = Array.isArray(req.query?.simple) ? req.query.simple[0] : req.query?.simple
  const simple = typeof rawSimple === 'string' && ['1', 'true', 'yes', 'on'].includes(rawSimple.toLowerCase())
  const requestIdFilter = typeof req.query?.requestId === 'string' ? req.query.requestId.trim() : ''

  try {
    // Simple mode: skip counts/aggregations and just return recent rows
    if (simple) {
  const extendedSelect = 'id, game_id, room_id, session_id, stage, status, reason, match_code, score_window, mode_col:mode, drop_in, request_id, metadata, created_at'
      const baseSelect = 'id, game_id, room_id, session_id, stage, status, reason, match_code, score_window, created_at'

      async function runSelect(selectClause, includeFilter = true) {
        let q = supabase
          .from('rank_matchmaking_logs')
          .select(selectClause)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (includeFilter && requestIdFilter) q = q.eq('request_id', requestIdFilter)
        return withTable(supabase, 'rank_matchmaking_logs', () => q)
      }

      let rowsResult = await runSelect(extendedSelect)
      if (rowsResult?.error) {
        // 컬럼 미존재 또는 PostgREST가 mode를 ordered-set aggregate로 파싱할 때 폴백
        const msg = String(rowsResult.error?.message || '')
        const isMissingColumn = msg.includes('column') && msg.includes('does not exist')
        const isModeAggregate = msg.includes('WITHIN GROUP') || msg.toLowerCase().includes('ordered-set')
        if (isMissingColumn || isModeAggregate) {
          // request_id 컬럼이 없다면 필터 제거 후 재시도
          const missingRequestId = msg.toLowerCase().includes('request_id')
          rowsResult = await runSelect(baseSelect, !missingRequestId)
        }
      }

      if (rowsResult?.error) {
        if (isMissingSupabaseTable(rowsResult.error)) {
          return res.status(200).json({ available: false, reason: 'missing_table' })
        }
        throw rowsResult.error
      }

      const rows = Array.isArray(rowsResult?.data) ? rowsResult.data : []
      const recent = rows.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        roomId: row.room_id,
        sessionId: row.session_id,
        mode: row.mode_col || row.mode || null,
        stage: row.stage,
        status: row.status,
        reason: row.reason,
        matchCode: row.match_code,
        scoreWindow: row.score_window,
        requestId: row.request_id || null,
          dropIn: row.drop_in || false,
          metadata: sanitizeMetadata(row.metadata),
        createdAt: row.created_at,
      }))

      return res.status(200).json({
        available: true,
        fetchedAt: new Date().toISOString(),
        limit,
        total: null,
        last24h: null,
        stageBuckets: null,
        statusCounts: null,
        recent,
      })
    }

    const countResult = await withTable(supabase, 'rank_matchmaking_logs', (table) =>
      supabase.from(table).select('id', { count: 'exact', head: true }),
    )

    if (countResult?.error) {
      if (isMissingSupabaseTable(countResult.error)) {
        return res.status(200).json({ available: false, reason: 'missing_table' })
      }
      throw countResult.error
    }

    const total = countResult?.count ?? 0

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const lastDayResult = await withTable(supabase, 'rank_matchmaking_logs', (table) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since),
    )

    if (lastDayResult?.error) {
      throw lastDayResult.error
    }

    const last24h = lastDayResult?.count ?? 0

  const extendedSelect = 'id, game_id, room_id, session_id, stage, status, reason, match_code, score_window, mode_col:mode, drop_in, request_id, metadata, created_at'
    const baseSelect = 'id, game_id, room_id, session_id, stage, status, reason, match_code, score_window, created_at'

    async function runSelect(selectClause, includeFilter = true) {
      let q = supabase
        .from('rank_matchmaking_logs')
        .select(selectClause)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (includeFilter && requestIdFilter) q = q.eq('request_id', requestIdFilter)
      return withTable(supabase, 'rank_matchmaking_logs', () => q)
    }

    let rowsResult = await runSelect(extendedSelect)
    if (rowsResult?.error) {
      const msg = String(rowsResult.error?.message || '')
      const isMissingColumn = msg.includes('column') && msg.includes('does not exist')
      const isModeAggregate = msg.includes('WITHIN GROUP') || msg.toLowerCase().includes('ordered-set')
      if (isMissingColumn || isModeAggregate) {
        const missingRequestId = msg.toLowerCase().includes('request_id')
        rowsResult = await runSelect(baseSelect, !missingRequestId)
      }
    }

    if (rowsResult?.error) {
      throw rowsResult.error
    }

    const rows = Array.isArray(rowsResult?.data) ? rowsResult.data : []

    const stageBuckets = toStageBuckets(rows)
    const statusCounts = toStatusCounts(rows)

    const recent = rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      roomId: row.room_id,
      sessionId: row.session_id,
      mode: row.mode_col || row.mode || null,
      stage: row.stage,
      status: row.status,
      reason: row.reason,
      matchCode: row.match_code,
      scoreWindow: row.score_window,
      requestId: row.request_id || null,
      dropIn: row.drop_in || false,
      metadata: sanitizeMetadata(row.metadata),
      createdAt: row.created_at,
    }))

    return res.status(200).json({
      available: true,
      fetchedAt: new Date().toISOString(),
      limit,
      total,
      last24h,
      stageBuckets,
      statusCounts,
      recent,
    })
  } catch (error) {
    console.error('matchmaking logs API error:', error)
    return res.status(500).json({ error: 'failed_to_fetch_matchmaking_logs', detail: error?.message || String(error) })
  }
}
