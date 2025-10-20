// lib/rank/participants.js
import { supabase } from './db'
import { buildRoleRequirements } from './roles'

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
  const requirements = buildRoleRequirements(roles)
  const picked = []
  let candidateIndex = 0
  let heroIndexWithinCandidate = 0

  if (!requirements.length) {
    return picked
  }

  if (!candidates.length) {
    const mirror = myHeroIds.slice(0, requirements.length)
    requirements.forEach((requirement, index) => {
      picked.push({
        ...requirement,
        from_owner: null,
        hero_id: mirror[index] || null,
      })
    })
    return picked
  }

  for (let i = 0; i < requirements.length; i += 1) {
    const requirement = requirements[i]
    let guard = 0
    let chosen = null

    while (guard < candidates.length * 2) {
      guard += 1
      const candidate = candidates[candidateIndex % candidates.length]
      const heroes = Array.isArray(candidate?.hero_ids) ? candidate.hero_ids : []
      if (!heroes.length) {
        candidateIndex += 1
        heroIndexWithinCandidate = 0
        continue
      }

      const slot = heroIndexWithinCandidate % heroes.length
      chosen = {
        from_owner: candidate.owner_id || null,
        hero_id: heroes[slot] || null,
      }
      candidateIndex += 1
      heroIndexWithinCandidate += 1
      break
    }

    if (!chosen) {
      chosen = {
        from_owner: null,
        hero_id: myHeroIds[i] || null,
      }
    }

    picked.push({
      ...requirement,
      from_owner: chosen.from_owner ?? null,
      hero_id: chosen.hero_id ?? null,
    })
  }

  return picked
}
