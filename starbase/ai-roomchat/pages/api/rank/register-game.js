import { supabase as supabaseAnon } from '@/lib/rank/db'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
  const {
    name = '',
    description = '',
    image_url = '',
    prompt_set_id,
    roles = [], // [{name, slot_count}]
    realtime_match = false,
  } = req.body || {}
  if (!prompt_set_id) return res.status(400).json({ error: 'prompt_set_id required' })

  try {
    // 4) 게임 생성 (RLS 무시: service role)
    const roleNames = Array.from(
      new Set(
        (roles || [])
          .map((role) => {
            if (!role?.name) return ''
            return String(role.name).trim()
          })
          .filter(Boolean),
      ),
    )

    const { data: game, error: e1 } = await supabaseAdmin
      .from('rank_games')
      .insert({
        owner_id: user.id,
        name,
        description,
        image_url,
        prompt_set_id,
        realtime_match: !!realtime_match,
        roles: roleNames.length ? roleNames : null,
      })
      .select()
      .single()

    if (e1) return res.status(400).json({ error: e1.message })

    // 5) 역할 등록(옵션)
    if (Array.isArray(roles) && roles.length > 0) {
      const rows = roles.map((r) => {
        const rawMin = Number(r?.score_delta_min)
        const rawMax = Number(r?.score_delta_max)
        const min = Number.isFinite(rawMin) ? rawMin : 20
        const max = Number.isFinite(rawMax) ? rawMax : 40
        const slotCount = Number.isFinite(Number(r?.slot_count)) ? Number(r.slot_count) : 0
        return {
          game_id: game.id,
          name: String(r?.name ?? '').trim() || '역할',
          slot_count: Math.max(0, slotCount),
          active: true,
          score_delta_min: Math.max(0, min),
          score_delta_max: Math.max(Math.max(0, min), max),
        }
      })
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
