import { supabase as supabaseAnon } from '@/lib/rank/db'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'
import { prepareRegistrationPayload } from '@/lib/rank/registrationValidation'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
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

    const { data: game, error: e1 } = await supabaseAdmin
      .from('rank_games')
      .insert({
        owner_id: user.id,
        ...prepared.game,
        realtime_match: realtimeMode,
      })
      .select()
      .single()

    if (e1) return res.status(400).json({ error: e1.message })

    // 5) 역할 등록(옵션)
    if (prepared.roles.length > 0) {
      const rows = prepared.roles.map((role) => ({
        game_id: game.id,
        name: role.name,
        slot_count: role.slot_count,
        active: true,
        score_delta_min: role.score_delta_min,
        score_delta_max: role.score_delta_max,
      }))
      const { error: e2 } = await supabaseAdmin.from('rank_game_roles').insert(rows)
      if (e2) {
        // 필요시 롤백 처리 가능. 지금은 경고만.
        console.warn('rank_game_roles insert failed:', e2.message)
      }
    }

    return res.status(200).json({ ok: true, gameId: game.id })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'server_error' })
  }
}
