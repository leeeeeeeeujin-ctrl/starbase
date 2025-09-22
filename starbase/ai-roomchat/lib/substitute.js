// lib/substitute.js
// pool: 같은 역할 후보들의 배열 [{hero_id, role, heroes:{...}}, ...]
export function pickSubstitute({ pool=[], usedHeroIds=new Set() }) {
  const candidates = pool.filter(p => !usedHeroIds.has(p.hero_id))
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}
