import { safeStr } from './utils';

export function buildStatusIndex(participantsStatus = [], myRole = null) {
  const roleMap = new Map();

  for (const entry of participantsStatus) {
    const role = safeStr(entry.role);
    const rawStatus = safeStr(entry.status).toLowerCase();
    const status =
      rawStatus === 'defeated' || rawStatus === 'lost' || rawStatus === 'eliminated'
        ? 'defeated'
        : 'alive';
    const bucket = roleMap.get(role) || { alive: 0, defeated: 0 };
    bucket[status] += 1;
    roleMap.set(role, bucket);
  }

  let totalAlive = 0;
  let totalDefeated = 0;
  for (const bucket of roleMap.values()) {
    totalAlive += bucket.alive;
    totalDefeated += bucket.defeated;
  }

  function count({ who = 'role', role = null, status = 'alive', myRoleOverride = myRole } = {}) {
    const normalizedStatus = status === 'defeated' || status === 'lost' ? 'defeated' : 'alive';

    if (who === 'same') {
      if (!myRoleOverride) return 0;
      const bucket = roleMap.get(String(myRoleOverride));
      return bucket ? bucket[normalizedStatus] || 0 : 0;
    }

    if (who === 'other') {
      if (!myRoleOverride) {
        return normalizedStatus === 'alive' ? totalAlive : totalDefeated;
      }
      const mine = roleMap.get(String(myRoleOverride));
      const mineCount = mine ? mine[normalizedStatus] || 0 : 0;
      return (normalizedStatus === 'alive' ? totalAlive : totalDefeated) - mineCount;
    }

    if (who === 'role') {
      const bucket = roleMap.get(String(role));
      return bucket ? bucket[normalizedStatus] || 0 : 0;
    }

    if (who === 'all') {
      return normalizedStatus === 'alive' ? totalAlive : totalDefeated;
    }

    return 0;
  }

  return { count };
}
