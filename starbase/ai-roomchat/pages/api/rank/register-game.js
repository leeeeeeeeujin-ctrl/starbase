// pages/api/rank/register-game.js
import { createClient } from '@supabase/supabase-js'

// 서버 전용 클라이언트들
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,          // ★ server-only
  { auth: { persistSession: false } }
)
const anonSrv = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,  // 토큰 검증용
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // 1) 헤더에서 Bearer 토큰 추출
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  // 2) 토큰으로 유저 검증
  const { data: userData, error: userErr } = await anonSrv.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return res.status(401).json({ error: 'unauthorized' })

  // 3) 입력 파라미터
  const {
    name = '',
    description = '',
    image_url = '',
    prompt_set_id,
    roles = [], // [{name, slot_count}]
  } = req.body || {}
  if (!prompt_set_id) return res.status(400).json({ error: 'prompt_set_id required' })

  try {
    // 4) 게임 생성 (RLS 무시: service role)
    const { data: game, error: e1 } = await admin
      .from('rank_games')
      .insert({
        owner_id: user.id,
        name,
        description,
        image_url,
        prompt_set_id,
      })
      .select()
      .single()

    if (e1) return res.status(400).json({ error: e1.message })

    // 5) 역할 등록(옵션)
    if (Array.isArray(roles) && roles.length > 0) {
      const rows = roles.map(r => ({
        game_id: game.id,
        name: String(r?.name ?? '').trim() || '역할',
        slot_count: Number(r?.slot_count ?? 3),
        active: true,
      }))
      const { error: e2 } = await admin.from('rank_game_roles').insert(rows)
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
