import { supabase } from '@/lib/rank/db'
import { withTable } from '@/lib/supabaseTables'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const { game_id, hero_id, owner_id, role, score } = payload || {}

  if (!game_id || !hero_id || !owner_id || !role) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  const { error } = await withTable(
    supabase,
    'rank_participants',
    (table) =>
      supabase
        .from(table)
        .insert(
          {
            game_id,
            hero_id,
            owner_id,
            role,
            score: typeof score === 'number' ? score : 1000,
          },
          { ignoreDuplicates: true },
        ),
  )

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true })
}

// 
