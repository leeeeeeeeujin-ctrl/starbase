// pages/api/rank/register-game.js
// ✅ 변경 포인트 요약
// - 쿠키로 로그인 사용자 확인: createServerSupabaseClient (auth-helpers)
// - DB 쓰기: service role 클라이언트로 삽입 (RLS에 안 막힘)
// - 기존 응답 구조/필드 유지 (ok/gameId, 400/401 등)

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

// ❗ 서버 전용 관리자 클라이언트 (service role)
//    Vercel 환경변수에 SUPABASE_SERVICE_ROLE 추가 (Server only)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // 1) 쿠키 기반 사용자 확인 (동일 도메인 fetch면 쿠키가 자동 포함됨)
  const srv = createServerSupabaseClient({ req, res })
  const { data: { user }, error: userErr } = await srv.auth.getUser()
  if (userErr || !user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  // 2) 입력 파라미터
  const {
    name = '',
    description = '',
    image_url = '',
    prompt_set_id,
    roles = [],            // [{ name, slot_count? }] 형태 가정
    // rules, rules_prefix 등 확장필드가 있다면 여기서 같이 받아 확장 가능
  } = req.body || {}

  if (!prompt_set_id) {
    return res.status(400).json({ error: 'prompt_set_id required' })
  }

  try {
    // 3) rank_games 생성 (service role로 안전 삽입)
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

    if (e1) {
      return res.status(400).json({ error: e1.message })
    }

    // 4) 역할 세부(있을 때만) 생성
    if (Array.isArray(roles) && roles.length > 0) {
      const rows = roles.map(r => ({
        game_id: game.id,
        name: String(r?.name ?? '').trim() || '역할',
        slot_count: Number(r?.slot_count ?? 3),
        active: true,
      }))

      const { error: e2 } = await admin.from('rank_game_roles').insert(rows)
      if (e2) {
        // 역할 삽입 실패해도 게임 자체는 만들어졌으므로 200 반환(필요 시 롤백처리로 변경 가능)
        // return res.status(400).json({ error: e2.message })
        console.warn('rank_game_roles insert failed:', e2.message)
      }
    }

    return res.status(200).json({ ok: true, gameId: game.id })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'server_error' })
  }
}
