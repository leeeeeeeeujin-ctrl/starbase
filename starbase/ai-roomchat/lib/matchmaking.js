// lib/matchmaking.js
import { supabase } from '@/lib/supabase'

// 배열 섞기/샘플링
function shuffle(a) { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
function takeRandom(a, n) { return a.length<=n ? a.slice() : shuffle(a.slice()).slice(0,n) }

// 게임에서 사용할 역할 목록을 안전하게 확보(없으면 참가자 테이블에서 distinct)
export async function ensureRoles({ gameId, roles }) {
  if (Array.isArray(roles) && roles.length) return roles
  const { data, error } = await supabase
    .from('rank_participants')
    .select('role')
    .eq('game_id', gameId)
  if (error) throw error
  const uniq = Array.from(new Set((data||[]).map(r => (r.role||'').trim()).filter(Boolean)))
  return uniq
}

/**
 * 역할/슬롯 수에 맞춰 비슷한 점수대에서 랜덤 픽.
 * - 우선: 점수 있는 행에서 ±step씩 확대 (최대 maxWindow)
 * - 부족: 점수 무시로 동일 역할 아무나에서 채움
 * - 항상 내 히어로 제외
 */
export async function pickOpponents({
  gameId, myHeroId, myScore = 1000, roles, slotsPerRole,
  step = 100, maxWindow = 1000
}) {
  const finalRoles = await ensureRoles({ gameId, roles })
  const needMap = slotsPerRole && typeof slotsPerRole === 'object'
    ? slotsPerRole
    : Object.fromEntries(finalRoles.map(r => [r, 1]))

  const picked = Object.fromEntries(finalRoles.map(r => [r, []]))
  const usedHeroIds = new Set([myHeroId].filter(Boolean))

  for (const role of finalRoles) {
    const need = Math.max(0, Number(needMap[role] ?? 0))
    if (!need) continue

    let window = step
    let pool = []

    // 1) 점수 있는 후보 위주로 확대 검색
    while (pool.length < need && window <= maxWindow) {
      const min = Math.floor(myScore - window)
      const max = Math.ceil(myScore + window)
      const { data, error } = await supabase
        .from('rank_participants')
        .select(`
          id, role, hero_id, owner_id, score,
          heroes:hero_id (id, name, image_url, description, ability1, ability2, ability3, ability4)
        `)
        .eq('game_id', gameId)
        .eq('role', role)
        .neq('hero_id', myHeroId)
        .not('score', 'is', null)           // 점수 null 제외
        .gte('score', min)
        .lte('score', max)
        .limit(200)

      if (error) throw error
      const fresh = (data||[]).filter(x => !usedHeroIds.has(x.hero_id))
      pool = pool.concat(fresh)
      if (pool.length < need) window += step
      else break
    }

    // 2) 그래도 부족하면 점수 무시(동일 역할 아무나)
    if (pool.length < need) {
      const { data, error } = await supabase
        .from('rank_participants')
        .select(`
          id, role, hero_id, owner_id, score,
          heroes:hero_id (id, name, image_url, description, ability1, ability2, ability3, ability4)
        `)
        .eq('game_id', gameId)
        .eq('role', role)
        .neq('hero_id', myHeroId)
        .limit(300)

      if (error) throw error
      const fresh = (data||[]).filter(x => !usedHeroIds.has(x.hero_id))
      pool = pool.concat(fresh)
    }

    const chosen = takeRandom(pool, need)
    chosen.forEach(c => usedHeroIds.add(c.hero_id))
    picked[role] = chosen
  }

  return picked
}
