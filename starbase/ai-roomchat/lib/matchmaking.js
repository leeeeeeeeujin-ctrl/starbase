// lib/matchmaking.js
import { supabase } from '@/lib/supabase'

// 배열 섞기
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// n개 랜덤 뽑기
function takeRandom(arr, n) {
  if (arr.length <= n) return arr.slice()
  return shuffle(arr.slice()).slice(0, n)
}

/**
 * 역할/슬롯 수에 맞춰 비슷한 점수대에서 상대를 랜덤으로 뽑는다.
 * @param {Object} params
 * @param {string} params.gameId
 * @param {string} params.myHeroId
 * @param {number} params.myScore
 * @param {string[]} params.roles                // 예: ["공격","수비", ...]
 * @param {Record<string, number>} params.slotsPerRole // 예: {공격:2, 수비:1}
 * @param {number} [params.step]                 // 점수창 증가 스텝(기본 100)
 * @param {number} [params.maxWindow]            // 최대 점수창(기본 1000)
 * @returns {Promise<Record<string, Array>>}     // 역할별로 뽑힌 참가자 배열
 */
export async function pickOpponents({
  gameId, myHeroId, myScore, roles, slotsPerRole,
  step = 100, maxWindow = 1000,
}) {
  const picked = {}  // role -> participants[]
  for (const r of roles) picked[r] = []

  // 히어로 중복 방지
  const usedHeroIds = new Set([myHeroId])

  // 역할별 요구 인원 계산
  for (const role of roles) {
    const need = Math.max(0, Number(slotsPerRole?.[role] ?? 0))
    if (need === 0) continue

    let window = step
    let pool = []

    // 점수 창을 점차 확대
    while (pool.length < need && window <= maxWindow) {
      const min = Math.floor(myScore - window)
      const max = Math.ceil(myScore + window)

      // 같은 역할에서, 내 히어로 제외
      const { data, error } = await supabase
        .from('rank_participants')
        .select(`
          id, role, hero_id, score,
          heroes:hero_id (id, name, image_url, description, ability1, ability2, ability3, ability4)
        `)
        .eq('game_id', gameId)
        .eq('role', role)
        .neq('hero_id', myHeroId)
        .gte('score', min)
        .lte('score', max)
        .order('score', { ascending: true })
        .limit(200) // 한 번에 너무 많이 끌어오지 않도록

      if (error) throw error

      // 후보 합치되, 이미 사용한 히어로는 스킵
      const fresh = (data || []).filter(x => !usedHeroIds.has(x.hero_id))
      pool = pool.concat(fresh)

      // 부족하면 창을 더 넓힘
      if (pool.length < need) window += step
      else break
    }

    // 그래도 부족하면: 지금까지 모인 걸로 최대한 채움(역할은 유지)
    const chosen = takeRandom(pool, need)
    chosen.forEach(c => usedHeroIds.add(c.hero_id))
    picked[role] = chosen
  }

  return picked
}
