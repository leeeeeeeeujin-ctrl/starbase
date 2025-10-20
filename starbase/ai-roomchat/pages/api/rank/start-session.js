import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for start-session API')
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

function buildSessionSummary({ mode, role, matchCode, turnTimer, createdAt }) {
  const lines = ['랭크 세션이 시작되었습니다.']

  if (typeof mode === 'string' && mode.trim()) {
    lines.push(`모드: ${mode.trim()}`)
  }

  if (typeof role === 'string' && role.trim()) {
    lines.push(`담당 역할: ${role.trim()}`)
  }

  if (typeof matchCode === 'string' && matchCode.trim()) {
    lines.push(`매치 코드: ${matchCode.trim()}`)
  }

  const numericTimer = Number(turnTimer)
  if (Number.isFinite(numericTimer) && numericTimer > 0) {
    lines.push(`턴 제한: ${numericTimer}초`)
  }

  if (createdAt) {
    lines.push(`시작 시각: ${createdAt}`)
  }

  return lines.join('\n')
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
  const user = userData?.user || null
  if (userError || !user) {
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

  const { game_id, mode, role, match_code, turn_timer } = payload || {}

  if (!game_id) {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const ownerId = user.id
  const now = new Date().toISOString()

  const { data: participant, error: participantError } = await withTableQuery(
    supabaseAdmin,
    'rank_participants',
    (from) =>
      from
        .select('id, status, role, hero_id')
        .eq('game_id', game_id)
        .eq('owner_id', ownerId)
        .maybeSingle(),
  )

  if (participantError) {
    return res.status(400).json({ error: participantError.message })
  }

  if (!participant || !participant.hero_id) {
    return res.status(403).json({ error: 'participant_not_found' })
  }

  if (participant.status && participant.status === 'out') {
    return res.status(409).json({ error: 'participant_inactive' })
  }

  const { data: existingSession, error: existingError } = await withTableQuery(
    supabaseAdmin,
    'rank_sessions',
    (from) =>
      from
        .select('id, status, created_at')
        .eq('game_id', game_id)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
  )

  if (existingError) {
    return res.status(400).json({ error: existingError.message })
  }

  let session = existingSession || null
  let created = false

  if (!session || session.status !== 'active') {
    const { data: inserted, error: insertError } = await withTableQuery(
      supabaseAdmin,
      'rank_sessions',
      (from) =>
        from
          .insert({
            game_id,
            owner_id: ownerId,
            status: 'active',
            turn: 0,
            created_at: now,
            updated_at: now,
          })
          .select('id, status, created_at')
          .maybeSingle(),
    )

    if (insertError) {
      return res.status(400).json({ error: insertError.message })
    }

    session = inserted
    created = true
  } else {
    const { error: touchError } = await withTableQuery(
      supabaseAdmin,
      'rank_sessions',
      (from) => from.update({ updated_at: now }).eq('id', session.id),
    )
    if (touchError) {
      return res.status(400).json({ error: touchError.message })
    }
  }

  if (created) {
    const summary = buildSessionSummary({
      mode,
      role: role || participant.role,
      matchCode: match_code,
      turnTimer: turn_timer,
      createdAt: session.created_at || now,
    })

    const { error: turnError } = await withTableQuery(
      supabaseAdmin,
      'rank_turns',
      (from) =>
        from.insert({
          session_id: session.id,
          idx: 0,
          role: 'system',
          public: true,
          content: summary,
          created_at: now,
        }),
    )

    if (turnError) {
      return res.status(400).json({ error: turnError.message })
    }
  }

  return res.status(200).json({
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      created_at: session.created_at,
      reused: !created,
      turn_timer: Number.isFinite(Number(turn_timer)) && Number(turn_timer) > 0 ? Number(turn_timer) : null,
    },
  })
}
