import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'

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
  const row = Array.isArray(data) ? data[0] : data
  return { row: formatSessionRow(row) }
}

async function fetchViaTable(gameId, ownerId) {
  const { data, error } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    (from) => {
      let query = from
        .select('id, status, owner_id, created_at, updated_at, mode')
        .eq('game_id', gameId)
        .in('status', ['active', 'preparing', 'ready'])
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
      if (ownerId) {
        query = query.eq('owner_id', ownerId)
      }
      return query.maybeSingle()
    },
  )

  if (error) {
    return { error }
  }

  return { row: formatSessionRow(data) }
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

  try {
    const { row, error } = await fetchViaRpc(payload)
    if (error) {
      if (String(error?.code || '').toUpperCase() === '42809') {
        const fallback = await fetchViaTable(payload.p_game_id, payload.p_owner_id || null)
        if (fallback.error) {
          return res.status(502).json({ error: 'rpc_failed', supabaseError: error })
        }
        return res.status(200).json({ session: fallback.row })
      }
      return res.status(502).json({ error: 'rpc_failed', supabaseError: error })
    }

    return res.status(200).json({ session: row || null })
  } catch (error) {
    return res.status(500).json({ error: 'rpc_exception', detail: String(error?.message || error) })
  }
}
