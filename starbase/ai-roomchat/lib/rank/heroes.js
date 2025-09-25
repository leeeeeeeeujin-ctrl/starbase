// lib/rank/heroes.js
import { supabase } from './db'

export async function loadHeroesMap(heroIds) {
  const uniq = Array.from(new Set(heroIds.filter(Boolean)))
  if (!uniq.length) return {}
  const { data, error } = await supabase
    .from('heroes')
    .select('*')
    .in('id', uniq)
  if (error) throw error
  const map = {}
  for (const h of data || []) map[h.id] = h
  return map
}

/** 슬롯 인덱스 1..N에 hero detail을 배치해 프롬프트 토큰용 구조로 만든다 */
export function buildSlotsMap({ myHeroIds, oppPicks, heroesMap }) {
  const slots = {}
  let idx = 1
  for (const hid of myHeroIds) {
    const h = heroesMap[hid] || {}
    slots[idx++] = toPromptHero(h, 'me')
  }
  for (const p of oppPicks) {
    const h = heroesMap[p.hero_id] || {}
    slots[idx++] = toPromptHero(h, 'opp')
  }
  return slots
}

function toPromptHero(hero = {}, sideLabel) {
  // ability1..ability12까지 안전히 꺼내기
  const out = {
    name: hero.name || `${sideLabel}-hero`,
    description: hero.description || '',
  }
  for (let a = 1; a <= 12; a++) {
    out[`ability${a}`] = hero[`ability${a}`] || ''
  }
  return out
}
