import { supabase } from '@/lib/rank/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body

  const {
    text,
    scope = 'global',
    hero_id,
    session_id,
    match_instance_id,
    game_id,
    room_id,
    target_hero_id,
    target_role,
    metadata,
    user_id,
  } = payload || {}

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  const { data, error } = await supabase.rpc('send_rank_chat_message', {
    p_text: text,
    p_scope: scope,
    p_hero_id: hero_id || null,
    p_session_id: session_id || null,
    p_match_instance_id: match_instance_id || null,
    p_game_id: game_id || null,
    p_room_id: room_id || null,
    p_target_hero_id: target_hero_id || null,
    p_target_role: target_role || null,
    p_metadata: metadata || null,
    p_user_id: user_id || null,
  })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ data })
}

// 
