import { createClient } from '@supabase/supabase-js'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for join-game API')
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
  const { game_id, hero_id, role, score } = payload || {}

  if (!game_id || !hero_id || !role) {
    return res.status(400).json({ error: 'missing_fields' })
  }

  const ownerId = user.id
  const trimmedRole = typeof role === 'string' ? role.trim() : ''
  if (!trimmedRole) {
    return res.status(400).json({ error: 'invalid_role' })
  }

  const now = new Date().toISOString()

  const { data: heroRow, error: heroError } = await supabaseAdmin
    .from('heroes')
    .select('id, owner_id')
    .eq('id', hero_id)
    .maybeSingle()
  if (heroError) {
    return res.status(400).json({ error: heroError.message })
  }
  if (!heroRow || heroRow.owner_id !== ownerId) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from('rank_games')
    .select('id')
    .eq('id', game_id)
    .maybeSingle()
  if (gameError) {
    return res.status(400).json({ error: gameError.message })
  }
  if (!gameRow) {
    return res.status(404).json({ error: 'game_not_found' })
  }

  const releaseQuery = supabaseAdmin
    .from('rank_game_slots')
    .update({ hero_id: null, hero_owner_id: null, updated_at: now })
    .eq('game_id', game_id)
    .eq('hero_owner_id', ownerId)
  const { error: releaseError } = await releaseQuery
  if (releaseError) {
    return res.status(400).json({ error: releaseError.message })
  }

  const { data: slotCandidate, error: slotLookupError } = await supabaseAdmin
    .from('rank_game_slots')
    .select('id')
    .eq('game_id', game_id)
    .eq('role', trimmedRole)
    .eq('active', true)
    .is('hero_id', null)
    .order('slot_index', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (slotLookupError) {
    return res.status(400).json({ error: slotLookupError.message })
  }
  let claimedSlot = null
  if (slotCandidate) {
    const { data: slotRow, error: claimError } = await supabaseAdmin
      .from('rank_game_slots')
      .update({ hero_id, hero_owner_id: ownerId, updated_at: now })
      .eq('id', slotCandidate.id)
      .is('hero_id', null)
      .select('id, slot_index, role')
      .maybeSingle()
    if (claimError) {
      return res.status(400).json({ error: claimError.message })
    }
    claimedSlot = slotRow || null
  }

  const { data: existingParticipant, error: participantError } = await supabaseAdmin
    .from('rank_participants')
    .select('id, rating, score, battles, win_rate, status')
    .eq('game_id', game_id)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (participantError) {
    if (claimedSlot?.id) {
      await supabaseAdmin
        .from('rank_game_slots')
        .update({ hero_id: null, hero_owner_id: null, updated_at: now })
        .eq('id', claimedSlot.id)
    }
    return res.status(400).json({ error: participantError.message })
  }

  const nextRating = Number.isFinite(Number(existingParticipant?.rating))
    ? Number(existingParticipant.rating)
    : Number.isFinite(Number(score))
      ? Number(score)
      : 1000

  const participantPayload = {
    id: existingParticipant?.id,
    game_id,
    owner_id: ownerId,
    hero_id,
    hero_ids: [hero_id],
    role: trimmedRole,
    score: Number.isFinite(Number(score)) ? Number(score) : existingParticipant?.score ?? null,
    rating: nextRating,
    battles: existingParticipant?.battles ?? 0,
    win_rate: existingParticipant?.win_rate ?? null,
    status:
      existingParticipant?.status && existingParticipant.status !== 'out'
        ? existingParticipant.status
        : 'ready',
    updated_at: now,
  }

  const { data: upsertedParticipant, error: upsertError } = await supabaseAdmin
    .from('rank_participants')
    .upsert(participantPayload, { onConflict: 'game_id,owner_id' })
    .select('id, hero_id, role, status')
    .maybeSingle()

  if (upsertError) {
    if (claimedSlot?.id) {
      await supabaseAdmin
        .from('rank_game_slots')
        .update({ hero_id: null, hero_owner_id: null, updated_at: now })
        .eq('id', claimedSlot.id)
    }
    return res.status(400).json({ error: upsertError.message })
  }

  return res.status(200).json({
    ok: true,
    slot: claimedSlot,
    participant: upsertedParticipant || null,
    overflow: !claimedSlot,
  })
}
