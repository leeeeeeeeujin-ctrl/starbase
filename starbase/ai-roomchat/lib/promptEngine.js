export function buildStatusIndex(participantsStatus = [], myRole = null) {
  const roleMap = new Map() // role -> { alive: n, defeated: n }
  for (const r of participantsStatus) {
    const role = safeStr(r.role)
    const rawStatus = safeStr(r.status).toLowerCase()
    const st = (rawStatus === 'defeated' || rawStatus === 'lost' || rawStatus === 'eliminated') ? 'defeated' : 'alive'
    const bucket = roleMap.get(role) || { alive:0, defeated:0 }
    bucket[st] += 1
    roleMap.set(role, bucket)
  }

  // 전체 합계
  let totalAlive = 0, totalDefeated = 0
  for (const v of roleMap.values()) {
    totalAlive += v.alive
    totalDefeated += v.defeated
  }

  function count({ who = 'role', role = null, status = 'alive', myRoleOverride = myRole } = {}) {
    const st = (status === 'defeated' || status === 'lost') ? 'defeated' : 'alive'
    if (who === 'same') {
      if (!myRoleOverride) return 0
      const b = roleMap.get(String(myRoleOverride))
      return b ? (b[st] || 0) : 0
    }
    if (who === 'other') {
      if (!myRoleOverride) return st === 'alive' ? totalAlive : totalDefeated
      // 전체 - 내 역할
      const mine = roleMap.get(String(myRoleOverride))
      const mineCnt = mine ? (mine[st] || 0) : 0
      return (st === 'alive' ? totalAlive : totalDefeated) - mineCnt
    }
    if (who === 'all') {
      return st === 'alive' ? totalAlive : totalDefeated
    }
    if (who === 'specific') {
      const b = roleMap.get(String(role))
      return b ? (b[st] || 0) : 0
    }
    return 0
  }

  return { count, roleMap }
}
