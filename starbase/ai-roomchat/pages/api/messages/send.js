import { supabase } from '@/lib/rank/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body

  const { user_id, owner_id, username, text } = payload || {}
  if (!user_id || !owner_id || !username || !text) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  const { error, data } = await supabase
    .from('messages')
    .insert({
      user_id,
      owner_id,
      username,
      avatar_url: payload.avatar_url ?? null,
      hero_id: payload.hero_id ?? null,
      scope: payload.scope ?? 'global',
      target_hero_id: payload.scope === 'whisper' ? payload.target_hero_id ?? null : null,
      text,
    })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ data })
}

// 
