import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'
import { withTableQuery } from '@/lib/supabaseTables'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for finalize-session API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { gameId, roster = [], summary = {}, chatLog = [] } = req.body || {}
  if (!gameId) {
    return res.status(400).json({ error: 'game_id_required' })
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ error: 'empty_roster' })
  }

  try {
    const { data: game, error: gameError } = await withTableQuery(
      supabaseAdmin,
      'rank_games',
      (from) => from.select('id, owner_id').eq('id', gameId).single(),
    )

    if (gameError || !game) {
      return res.status(404).json({ error: 'game_not_found' })
    }
    if (game.owner_id !== user.id) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const now = new Date().toISOString()
    const conflicts = []

    for (const entry of roster) {
      if (!entry?.participantId) continue
      const payload = {
        status: entry.status || 'alive',
        score: Number.isFinite(Number(entry.scoreAfter)) ? Number(entry.scoreAfter) : entry.scoreBefore,
        updated_at: now,
      }
      const { data: updatedRows, error: updateError } = await withTableQuery(
        supabaseAdmin,
        'rank_participants',
        (from) => {
          let builder = from.update(payload).eq('id', entry.participantId)
          if (entry.updatedAt) {
            builder = builder.eq('updated_at', entry.updatedAt)
          }
          return builder.select('id')
        },
      )
      if (updateError) {
        return res.status(400).json({ error: updateError.message })
      }
      if (!updatedRows || updatedRows.length === 0) {
        conflicts.push(entry.participantId)
      }
    }

    if (conflicts.length) {
      return res.status(409).json({ error: 'conflict', conflicts })
    }

    let battleId = null
    try {
      const winners = roster
        .filter((entry) => entry?.status === 'won')
        .map((entry) => entry.heroId)
        .filter(Boolean)
      const losers = roster
        .filter((entry) => entry?.status && entry.status !== 'won')
        .map((entry) => entry.heroId)
        .filter(Boolean)

      const { data: battle } = await withTableQuery(
        supabaseAdmin,
        'rank_battles',
        (from) =>
          from
            .insert({
              game_id: gameId,
              attacker_owner_id: user.id,
              attacker_hero_ids: winners,
              defender_owner_id: null,
              defender_hero_ids: losers,
              result: summary?.reason || 'completed',
              score_delta: 0,
              hidden: false,
            })
            .select()
            .single(),
      )

      battleId = battle?.id || null

      if (battleId) {
        await withTableQuery(supabaseAdmin, 'rank_battle_logs', (from) =>
          from.insert({
            battle_id: battleId,
            turn_no: 0,
            prompt: '[interactive session]',
            ai_response: summary?.resultBanner || '',
            meta: {
              summary,
              roster,
              chatLog: Array.isArray(chatLog) ? chatLog.slice(-200) : [],
            },
          }),
        )
      }
    } catch (logError) {
      console.warn('finalize-session: log insert failed', logError?.message || logError)
    }

    return res.status(200).json({ ok: true, battleId })
  } catch (error) {
    return res.status(500).json({ error: 'server_error', detail: String(error).slice(0, 300) })
  }
}
