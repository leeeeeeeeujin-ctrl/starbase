import { createClient } from '@supabase/supabase-js'
import { withTable } from '@/lib/supabaseTables'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } })
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
    const { data: game, error: gameError } = await adminClient
      .from('rank_games')
      .select('id, owner_id')
      .eq('id', gameId)
      .single()

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
      const { data: updatedRows, error: updateError } = await withTable(
        adminClient,
        'rank_participants',
        (table) => {
          let query = adminClient.from(table).update(payload).eq('id', entry.participantId)
          if (entry.updatedAt) {
            query = query.eq('updated_at', entry.updatedAt)
          }
          return query.select('id')
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

      const { data: battle } = await withTable(adminClient, 'rank_battles', (table) =>
        adminClient
          .from(table)
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
        await withTable(adminClient, 'rank_battle_logs', (table) =>
          adminClient.from(table).insert({
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

// 
