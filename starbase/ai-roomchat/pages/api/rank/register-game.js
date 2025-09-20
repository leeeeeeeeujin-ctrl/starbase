// pages/api/rank/register-game.js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
})

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const { name, description, image_url, prompt_set_id, roles = [] } = req.body || {}

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return res.status(401).json({ error: 'unauthorized' })

  const { data: game, error: e1 } = await supabase.from('rank_games').insert({
    owner_id: user.id, name, description, image_url, prompt_set_id
  }).select().single()
  if (e1) return res.status(400).json({ error: e1.message })

  if (roles.length) {
    await supabase.from('rank_game_roles').insert(
      roles.map(r => ({ game_id: game.id, name: r.name, slot_count: r.slot_count ?? 3, active: true }))
    )
  }

  return res.status(200).json({ ok: true, gameId: game.id })
}
