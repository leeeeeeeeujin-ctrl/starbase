import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for leave-game API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

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

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const { game_id: gameId } = payload || {}

  if (!gameId) {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  const now = new Date().toISOString()
  const ownerId = user.id

  const { data: slotRows, error: slotLookupError } = await supabaseAdmin
    .from('rank_game_slots')
    .select('id')
    .eq('game_id', gameId)
    .eq('hero_owner_id', ownerId)

  if (slotLookupError) {
    return res.status(400).json({ error: slotLookupError.message })
  }

  const slotIds = Array.isArray(slotRows) ? slotRows.map((row) => row.id).filter(Boolean) : []

  if (slotIds.length) {
    const { error: releaseError } = await supabaseAdmin
      .from('rank_game_slots')
      .update({ hero_id: null, hero_owner_id: null, updated_at: now })
      .in('id', slotIds)
    if (releaseError) {
      return res.status(400).json({ error: releaseError.message })
    }
  }

  const { data: participantRow, error: participantError } = await supabaseAdmin
    .from('rank_participants')
    .select('id, hero_id, status')
    .eq('game_id', gameId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (participantError) {
    return res.status(400).json({ error: participantError.message })
  }

  if (participantRow) {
    const { error: updateError } = await supabaseAdmin
      .from('rank_participants')
      .update({ hero_id: null, status: 'out', updated_at: now })
      .eq('id', participantRow.id)
    if (updateError) {
      return res.status(400).json({ error: updateError.message })
    }
  }

  return res.status(200).json({ ok: true, releasedSlots: slotIds })
}
