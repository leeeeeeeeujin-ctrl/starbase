// lib/rank/scoring.js
// 세션 종료 시 점수 집계 유틸리티

function toInt(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : Math.trunc(fallback)
}

/**
 * computeSessionScore
 * 입력: 승리횟수 × 승리점수(상한 적용) − 패배로 인한 감소 점수
 * 옵션으로 floor/ceiling을 적용할 수 있음
 * 
 * 역할별 점수 규칙(scoreDeltaMin, scoreDeltaMax) 지원:
 * - scoreDeltaMax: 승리 시 1회당 점수 (기본값 winPoint 사용)
 * - scoreDeltaMin: 패배 시 감소 점수 (기본값 lossPenalty 사용)
 */
export function computeSessionScore({
  wins = 0,
  losses = 0,
  winPoint = 25,
  winCap = 3,
  lossPenalty = 15,
  scoreDeltaMax = null,
  scoreDeltaMin = null,
  floor = 0,
  ceiling = null,
} = {}) {
  const w = Math.max(0, toInt(wins, 0))
  const l = Math.max(0, toInt(losses, 0))
  
  // 역할별 설정이 있으면 우선 사용
  const p = scoreDeltaMax != null ? Math.max(0, toInt(scoreDeltaMax)) : Math.max(0, toInt(winPoint, 25))
  const penalty = scoreDeltaMin != null ? Math.max(0, toInt(scoreDeltaMin)) : Math.max(0, toInt(lossPenalty, 15))
  
  const cap = winCap == null ? 3 : Math.max(0, toInt(winCap, 3))

  const effectiveWins = Math.min(w, cap)
  // Business rule: always subtract one loss penalty baseline, even if no recorded losses
  let delta = effectiveWins * p - penalty

  // Apply floor/ceiling bounds to the final delta (allow floor on negative values)
  if (typeof floor === 'number') {
    const f = toInt(floor)
    if (Number.isFinite(f)) delta = Math.max(delta, f)
  }
  if (typeof ceiling === 'number') {
    const c = toInt(ceiling)
    if (Number.isFinite(c)) delta = Math.min(delta, c)
  }

  return toInt(delta)
}

/**
 * applyScoreDelta
 * 현재 레이팅에 델타를 적용하고 floor/ceiling을 적용
 */
export function applyScoreDelta(current, delta, { floor = null, ceiling = null } = {}) {
  let result = toInt(current, 0) + toInt(delta, 0)
  if (typeof floor === 'number') result = Math.max(result, toInt(floor))
  if (typeof ceiling === 'number') result = Math.min(result, toInt(ceiling))
  return toInt(result)
}

export default { computeSessionScore, applyScoreDelta }
