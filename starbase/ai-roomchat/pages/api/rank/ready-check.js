import { createClient } from '@supabase/supabase-js'

import { createSupabaseAuthConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'
import { withTableQuery } from '@/lib/supabaseTables'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for ready-check API')
}

const anonAuthConfig = createSupabaseAuthConfig(url, {
  apikey: anonKey,
  authorization: `Bearer ${anonKey}`,
})

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: { ...anonAuthConfig.headers },
    fetch: anonAuthConfig.fetch,
  },
})

function parseBody(req) {
  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return { error: 'invalid_payload' }
    }
  }
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_payload' }
  }
  return { payload }
}

function toTrimmedString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toOptionalUuid(value) {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return null
  return trimmed
}

function sanitizeWindowSeconds(value) {
  if (value === null || value === undefined) return 15
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 15
  const rounded = Math.max(5, Math.min(Math.floor(numeric), 90))
  return rounded
}

function toOptionalParticipantId(value) {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (!Number.isSafeInteger(value)) {
      return String(Math.trunc(value))
    }
    return Math.trunc(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  const trimmed = toTrimmedString(value)
  if (!trimmed) return null

  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isSafeInteger(numeric)) {
      return numeric
    }
    return trimmed
  }

  return null
}

function formatSessionRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = toOptionalUuid(row.id ?? row.session_id)
  if (!id) return null
  const ownerId = toOptionalUuid(row.owner_id ?? row.ownerId)
  const gameId = toOptionalUuid(row.game_id ?? row.gameId)
  return {
    id,
    owner_id: ownerId,
    game_id: gameId,
    status: toTrimmedString(row.status ?? row.session_status) || null,
  }
}

async function fetchLatestSessionViaRpc(client, { gameId, ownerId }) {
  if (!client || typeof client.rpc !== 'function') {
    return { session: null, error: new Error('supabase_client_unavailable') }
  }

  const trimmedGameId = toOptionalUuid(gameId)
  if (!trimmedGameId) {
    return { session: null, error: null }
  }

  const payload = ownerId
    ? { p_game_id: trimmedGameId, p_owner_id: ownerId }
    : { p_game_id: trimmedGameId }

  try {
    const { data, error } = await client.rpc('fetch_latest_rank_session_v2', payload)
    if (error) {
      return { session: null, error }
    }
    const formatted = formatSessionRow(Array.isArray(data) ? data[0] : data)
    return { session: formatted, error: null }
  } catch (error) {
    return { session: null, error }
  }
}

function isServiceRoleAuthError(error) {
  if (!error) return false
  const code = String(error.code || '').trim().toUpperCase()
  if (code === '401' || code === '403' || code === 'PGRST301') return true
  const status = Number(error.status)
  if (status === 401 || status === 403) return true
  const merged = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
    .toLowerCase()
    .trim()
  if (!merged) return false
  if (merged.includes('no api key')) return true
  if (merged.includes('invalid api key')) return true
  if (merged.includes('jwt') && merged.includes('unauthorized')) return true
  return false
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

  const { payload, error } = parseBody(req)
  if (error) {
    return res.status(400).json({ error })
  }

  const sessionId = toOptionalUuid(payload.session_id ?? payload.sessionId)
  if (!sessionId) {
    return res.status(400).json({ error: 'missing_session_id' })
  }

  let gameId = toOptionalUuid(payload.game_id ?? payload.gameId)
  const matchInstanceId = toOptionalUuid(
    payload.match_instance_id ?? payload.matchInstanceId,
  )
  const participantHintRaw = payload.participant_id ?? payload.participantId
  const participantHint = toOptionalParticipantId(participantHintRaw)
  const windowSeconds = sanitizeWindowSeconds(payload.window_seconds ?? payload.windowSeconds)

  const userClientAuth = createSupabaseAuthConfig(url, {
    apikey: anonKey,
    authorization: `Bearer ${token}`,
  })

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: { ...userClientAuth.headers },
      fetch: userClientAuth.fetch,
    },
  })

  const { data: sessionRow, error: sessionError } = await withTableQuery(
    userClient,
    'rank_sessions',
    (from) => from.select('id, owner_id, game_id').eq('id', sessionId).maybeSingle(),
  )

  if (sessionError) {
    console.error('[ready-check] session lookup failed:', sessionError)
    return res.status(400).json({ error: 'session_lookup_failed' })
  }

  let resolvedSession = sessionRow
  const sessionDiagnostics = {
    recovered: false,
    via: null,
    error: null,
  }

  if (!resolvedSession && sessionId) {
    try {
      const { data: adminSession, error: adminError } = await withTableQuery(
        supabaseAdmin,
        'rank_sessions',
        (from) => from.select('id, owner_id, game_id').eq('id', sessionId).maybeSingle(),
      )

      if (adminError) {
        sessionDiagnostics.error = sessionDiagnostics.error || adminError
      } else if (adminSession) {
        resolvedSession = adminSession
        sessionDiagnostics.recovered = true
        sessionDiagnostics.via = 'service-role-table'
      }
    } catch (adminException) {
      sessionDiagnostics.error = sessionDiagnostics.error || adminException
    }
  }

  if (!resolvedSession && gameId) {
    const { session, error } = await fetchLatestSessionViaRpc(supabaseAdmin, {
      gameId,
      ownerId: userId,
    })

    if (session) {
      resolvedSession = session
      sessionDiagnostics.recovered = true
      sessionDiagnostics.via = 'service-role'
    } else if (error) {
      sessionDiagnostics.error = error
      if (isServiceRoleAuthError(error)) {
        const userResult = await fetchLatestSessionViaRpc(userClient, {
          gameId,
          ownerId: userId,
        })
        if (userResult.session) {
          resolvedSession = userResult.session
          sessionDiagnostics.recovered = true
          sessionDiagnostics.via = 'user-token'
          sessionDiagnostics.error = null
        } else if (userResult.error) {
          sessionDiagnostics.error = userResult.error
        }
      }
    }
  }

  if (!resolvedSession) {
    const errorPayload = { error: 'session_not_found' }
    if (sessionDiagnostics.error) {
      errorPayload.diagnostics = {
        code: sessionDiagnostics.error.code || null,
        message: sessionDiagnostics.error.message || null,
      }
    }
    return res.status(404).json(errorPayload)
  }

  let normalizedSessionId = toOptionalUuid(resolvedSession.id)
  if (!normalizedSessionId) {
    normalizedSessionId = sessionId
  }

  if (!gameId) {
    gameId = toOptionalUuid(resolvedSession.game_id) || gameId
  }

  if (normalizedSessionId && normalizedSessionId !== sessionId) {
    sessionDiagnostics.recovered = true
    sessionDiagnostics.via = sessionDiagnostics.via || 'service-role'
  }

  const sessionOwnerId = toOptionalUuid(resolvedSession.owner_id)
  const sessionGameId = toOptionalUuid(resolvedSession.game_id)
  if (!gameId && sessionGameId) {
    gameId = sessionGameId
  }

  let authorized = sessionOwnerId && sessionOwnerId === userId
  let participantId = participantHint

  if (!authorized && matchInstanceId) {
    try {
      const { data: rosterRow } = await withTableQuery(
        supabaseAdmin,
        'rank_match_roster',
        (from) =>
          from
            .select('owner_id, game_id')
            .eq('match_instance_id', matchInstanceId)
            .eq('owner_id', userId)
            .maybeSingle(),
      )
      if (rosterRow) {
        authorized = true
        if (!gameId) {
          gameId = toOptionalUuid(rosterRow.game_id) || gameId
        }
      }
    } catch (lookupError) {
      console.warn('[ready-check] roster lookup failed:', lookupError)
    }
  }

  if (!authorized && gameId) {
    try {
      const { data: participantRow } = await withTableQuery(
        supabaseAdmin,
        'rank_participants',
        (from) =>
          from
            .select('id, owner_id')
            .eq('game_id', gameId)
            .eq('owner_id', userId)
            .maybeSingle(),
      )
      if (participantRow) {
        authorized = true
        participantId = toOptionalParticipantId(participantRow.id)
      }
    } catch (participantError) {
      console.warn('[ready-check] participant lookup failed:', participantError)
    }
  }

  if (!authorized) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const rpcPayload = {
    p_session_id: normalizedSessionId,
    p_owner_id: userId,
    p_game_id: gameId,
    p_match_instance_id: matchInstanceId,
    p_participant_id: participantId,
    p_window_seconds: windowSeconds,
  }

  let rpcError = null
  let readyCheck = null

  try {
    const { data, error: serviceError } = await supabaseAdmin.rpc(
      'register_match_ready_signal',
      rpcPayload,
    )
    if (serviceError) {
      rpcError = serviceError
    } else {
      readyCheck = data || null
    }
  } catch (serviceException) {
    rpcError = serviceException
  }

  if (rpcError && isServiceRoleAuthError(rpcError)) {
    try {
      const { data, error: fallbackError } = await userClient.rpc(
        'register_match_ready_signal',
        rpcPayload,
      )
      if (fallbackError) {
        rpcError = fallbackError
      } else {
        rpcError = null
        readyCheck = data || null
      }
    } catch (fallbackException) {
      rpcError = fallbackException
    }
  }

  if (rpcError) {
    console.error('[ready-check] register rpc failed:', rpcError)
    return res.status(500).json({ error: 'ready_check_failed', supabaseError: rpcError })
  }

  return res.status(200).json({
    sessionId: normalizedSessionId,
    gameId,
    matchInstanceId,
    participantId,
    readyCheck: readyCheck || null,
    diagnostics: sessionDiagnostics.recovered
      ? {
          sessionRecovered: true,
          via: sessionDiagnostics.via,
        }
      : undefined,
  })
}
