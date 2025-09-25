// lib/rank/participants.js
import { supabase } from './db'

export async function getOpponentCandidates(gameId, myUserId, limit = 100) {
  const { data, error } = await supabase
    .from('rank_participants')
    .select('owner_id, hero_ids, rating')
    .eq('game_id', gameId)
    .neq('owner_id', myUserId)
    .order('rating', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * 슬롯 총합에 맞춰 "여러 참가자"에서 상대 캐릭터를 뽑아 채운다.
 * - roles: [{id,name,slot_count}]
 * - candidates: [{owner_id, hero_ids[], rating}]
 * - 부족하면 같은 참가자에서 추가로 뽑거나, 내 팩 mirror 로 fallback
 */
export function pickOpponentsPerSlots({ roles, candidates, myHeroIds }) {
  const need = roles.reduce((acc, r) => acc.concat(Array(r.slot_count).fill({ roleId: r.id })), [])
  const picked = []
  let cIdx = 0, insideIdx = 0

  if (!candidates.length) {
    // 상대가 없으면 내 팩을 복제해서 더미로 채움
    const mirror = myHeroIds.slice(0, need.length)
    for (let i = 0; i < need.length; i++) {
      picked.push({ from_owner: null, hero_id: mirror[i] || null })
    }
    return picked
  }

  // 라운드로빈으로 참가자 순회하며 hero_ids에서 하나씩 소비
  for (let i = 0; i < need.length; i++) {
    let guard = 0, chosen = null
    while (guard++ < candidates.length * 2) {
      const cand = candidates[cIdx % candidates.length]
      const heroes = cand.hero_ids || []
      if (!heroes.length) { cIdx++; insideIdx = 0; continue }
      const idx = insideIdx % heroes.length
      chosen = { from_owner: cand.owner_id, hero_id: heroes[idx] || null }
      cIdx++; insideIdx++
      break
    }
    if (!chosen) chosen = { from_owner: null, hero_id: myHeroIds[i] || null }
    picked.push(chosen)
  }
  return picked
}
