import { supabase as supabaseAnon } from '@/lib/rank/db'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withTableQuery } from '@/lib/supabaseTables'
import { normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'
import { prepareRegistrationPayload } from '@/lib/rank/registrationValidation'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', ['POST', 'OPTIONS'])
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // 1) 헤더에서 Bearer 토큰 추출
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  // 2) 토큰으로 유저 검증
  const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return res.status(401).json({ error: 'unauthorized' })

  // 3) 입력 파라미터
  try {
    const prepared = prepareRegistrationPayload({ ...req.body })
    if (!prepared.ok) {
      return res.status(400).json({ error: prepared.error })
    }

    const realtimeMode = normalizeRealtimeMode(prepared.game.realtime_match ?? REALTIME_MODES.OFF)
    const sanitizedGame = {
      ...prepared.game,
      realtime_match: realtimeMode,
    }

    const {
      data: promptSetRows,
      error: promptSetError,
    } = await withTableQuery(supabaseAdmin, 'prompt_sets', (from) =>
      from.select('id').eq('id', sanitizedGame.prompt_set_id).limit(1),
    )

    if (promptSetError) {
      console.warn('prompt set lookup failed:', promptSetError?.message || promptSetError)
      return res.status(500).json({ error: 'prompt_set_lookup_failed' })
    }

    const promptSetRecord = Array.isArray(promptSetRows) ? promptSetRows[0] : promptSetRows
    if (!promptSetRecord) {
      return res.status(400).json({ error: 'invalid_prompt_set' })
    }

    const rpcPayload = {
      p_owner_id: user.id,
      p_game: sanitizedGame,
      p_roles: prepared.roles,
      p_slots: prepared.slots,
    }

    const { error: verifyError } = await supabaseAdmin.rpc('verify_rank_roles_and_slots', {
      p_roles: prepared.roles,
      p_slots: prepared.slots,
    })

    if (verifyError) {
      const message = `${verifyError?.message || ''} ${verifyError?.details || ''}`.toLowerCase()
      const missingVerify =
        message.includes('verify_rank_roles_and_slots') && message.includes('does not exist')
      if (!missingVerify) {
        console.warn('verify_rank_roles_and_slots RPC failed:', verifyError?.message || verifyError)
        return res.status(400).json({
          error: 'roles_slots_invalid',
          detail: verifyError?.details || verifyError?.message || null,
        })
      }
    }

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('register_rank_game', rpcPayload)

    if (!rpcError) {
      const record = Array.isArray(rpcData) ? rpcData[0] : rpcData
      if (record?.game_id) {
        return res.status(200).json({ ok: true, gameId: record.game_id })
      }

      return res.status(200).json({ ok: true, gameId: record?.game_id ?? null })
    }

    const missingRpc = /register_rank_game/i.test(rpcError.message || '') && /function/i.test(rpcError.message || '')
    if (!missingRpc) {
      console.warn('register_rank_game RPC failed:', rpcError.message)
      return res.status(400).json({ error: rpcError.message || 'register_rank_game_failed' })
    }

    // Fallback for environments where the RPC has not been deployed yet.
    const { data: game, error: e1 } = await supabaseAdmin
      .from('rank_games')
      .insert({
        owner_id: user.id,
        ...sanitizedGame,
      })
      .select()
      .single()

    if (e1) return res.status(400).json({ error: e1.message })

    if (prepared.roles.length > 0) {
      const roleRows = prepared.roles.map((role) => ({
        game_id: game.id,
        name: role.name,
        slot_count: role.slot_count,
        active: true,
        score_delta_min: role.score_delta_min,
        score_delta_max: role.score_delta_max,
      }))

      const { error: roleError } = await supabaseAdmin.from('rank_game_roles').insert(roleRows)
      if (roleError) {
        console.warn('rank_game_roles insert failed:', roleError.message)
        return res.status(400).json({ error: roleError.message })
      }
    }

    if (prepared.slots.length > 0) {
      const slotRows = prepared.slots.map((slot) => ({
        game_id: game.id,
        slot_index: slot.slot_index,
        role: slot.role,
        active: slot.active,
      }))

      const { error: deleteError } = await supabaseAdmin
        .from('rank_game_slots')
        .delete()
        .eq('game_id', game.id)

      if (deleteError) {
        console.warn('rank_game_slots delete failed:', deleteError.message)
        return res.status(400).json({ error: deleteError.message })
      }

      const { error: slotError } = await supabaseAdmin
        .from('rank_game_slots')
        .insert(slotRows)

      if (slotError) {
        console.warn('rank_game_slots insert failed:', slotError.message)
        return res.status(400).json({ error: slotError.message })
      }
    }

    return res.status(200).json({ ok: true, gameId: game.id })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'server_error' })
  }
}
