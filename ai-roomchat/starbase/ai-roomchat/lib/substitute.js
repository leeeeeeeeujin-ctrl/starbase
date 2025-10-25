// lib/substitute.js
export function pickSubstitute({ pool = [], usedHeroIds = new Set() }) {
  const candidates = pool.filter(p => !usedHeroIds.has(p.hero_id));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
