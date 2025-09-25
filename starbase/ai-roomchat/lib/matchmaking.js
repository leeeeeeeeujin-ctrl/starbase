// /lib/matchmaking.js
import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'

/** roles: ["공격","수비"...], slotsPerRole: {공격:2, 수비:1} */
export async function pickOpponents({ gameId, myHeroId, myScore, roles, slotsPerRole, step=100, maxWindow=1000 }) {
  // 후보군 가져오기 (내 캐릭 제외)
  const { data: rows, error } = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .select('hero_id, role, score, heroes ( name, image_url, description )')
      .eq('game_id', gameId)
      .neq('hero_id', myHeroId),
  )
  if (error) throw error

  // 역할별 버킷
  const byRole = new Map()
  roles.forEach(r => byRole.set(r, []))
  for (const r of rows || []) {
    if (!byRole.has(r.role)) byRole.set(r.role, [])
    byRole.get(r.role).push(r)
  }
  for (const [role, arr] of byRole.entries()) {
    arr.sort((a,b)=> Math.abs((a.score??1000)-myScore) - Math.abs((b.score??1000)-myScore))
  }

  // 역할마다 가까운 점수부터 채우기(윈도 확장)
  const picked = []
  for (const role of roles) {
    const need = slotsPerRole?.[role] ?? 1
    const arr = byRole.get(role) || []
    let win = step
    while (picked.filter(p=>p.role===role).length < need && win <= maxWindow) {
      const cand = arr.filter(x => Math.abs((x.score??1000)-myScore) <= win && !picked.find(p=>p.hero_id===x.hero_id))
      // 부족하면 윈도 확장
      for (const c of cand) {
        picked.push({ role, ...c })
        if (picked.filter(p=>p.role===role).length >= need) break
      }
      win += step
    }
  }
  return picked
}

// 
