import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for complete-session API')
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

function normaliseEntries(entries) {
  if (!Array.isArray(entries)) return []
  return entries.slice(0, 48).map((entry) => {
    if (!entry || typeof entry !== 'object') return null
    const wins = Number.isFinite(Number(entry.wins)) ? Number(entry.wins) : 0
    const losses = Number.isFinite(Number(entry.losses)) ? Number(entry.losses) : 0
    const scoreDelta = Number.isFinite(Number(entry.scoreDelta)) ? Number(entry.scoreDelta) : 0
    return {
      key: entry.key || null,
      participant_id: entry.participantId || entry.participant_id || null,
      owner_id: entry.ownerId || entry.owner_id || null,
      hero_id: entry.heroId || entry.hero_id || null,
      hero_name: entry.heroName || entry.hero_name || null,
      role: entry.role || null,
      result: entry.result || 'pending',
      wins,
      losses,
      eliminated: Boolean(entry.eliminated),
      slot_index: Number.isFinite(Number(entry.slotIndex)) ? Number(entry.slotIndex) : null,
      score_delta: scoreDelta,
      history: Array.isArray(entry.history) ? entry.history.slice(-10) : [],
    }
  }).filter(Boolean)
}

function normaliseRoles(roles) {
  if (!Array.isArray(roles)) return []
  return roles.slice(0, 48).map((role) => {
    if (!role || typeof role !== 'object') return null
    return {
      key: role.key || role.role || null,
      role: role.role || null,
      status: role.status || 'pending',
      total: Number.isFinite(Number(role.total)) ? Number(role.total) : null,
      pending: Number.isFinite(Number(role.pending)) ? Number(role.pending) : null,
      won: Number.isFinite(Number(role.won)) ? Number(role.won) : null,
      lost: Number.isFinite(Number(role.lost)) ? Number(role.lost) : null,
      eliminated: Number.isFinite(Number(role.eliminated)) ? Number(role.eliminated) : null,
      score_range: role.scoreRange || null,
    }
  }).filter(Boolean)
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
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { sessionId, gameId, outcome = {}, reason, finalResponse, turnNumber } = payload || {}

  if (!sessionId || !gameId) {
    return res.status(400).json({ error: 'missing_session_or_game' })
  }

  const entries = normaliseEntries(outcome.entries)
  const roles = normaliseRoles(outcome.roleSummaries)
  const summary = {
    result: outcome.overallResult || 'completed',
    reason: reason || 'roles_resolved',
    turn: Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : null,
    finalResponse:
      typeof finalResponse === 'string' ? finalResponse.slice(0, 4000) : '',
    completedAt: new Date().toISOString(),
  }

  try {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'finalize_rank_session_outcome',
      {
        p_session_id: sessionId,
        p_game_id: gameId,
        p_outcomes: entries,
        p_roles: roles,
        p_summary: summary,
        p_completed_at: summary.completedAt,
      },
    )

    if (rpcError) {
      if (rpcError.code === '42883') {
        return res.status(501).json({ error: 'rpc_not_deployed', detail: rpcError.message })
      }
      return res.status(400).json({ error: 'finalize_failed', detail: rpcError.message })
    }

    return res.status(200).json({ ok: true, result: rpcResult })
  } catch (error) {
    return res.status(500).json({ error: 'server_error', detail: String(error).slice(0, 300) })
  }
}

