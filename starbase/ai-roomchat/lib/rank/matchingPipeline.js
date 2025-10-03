import { loadActiveRoles, loadParticipantPool, loadQueueEntries, loadRoleStatusCounts } from '@/lib/rank/matchmakingService'

const DROP_IN_RULE_KEYS = ['drop_in', 'allow_drop_in', 'dropIn', 'allowDropIn', 'enable_drop_in', 'drop_in_enabled']

export function extractMatchingToggles(gameRow, rules = {}) {
  const realtimeEnabled = Boolean(gameRow?.realtime_match)
  let dropInEnabled = false
  DROP_IN_RULE_KEYS.some((key) => {
    const value = rules?.[key]
    if (typeof value === 'string') {
      if (value === 'allow' || value === 'enabled' || value === 'on' || value === 'true') {
        dropInEnabled = true
        return true
      }
      if (value === 'forbid' || value === 'disabled' || value === 'off' || value === 'false') {
        dropInEnabled = false
        return true
      }
      return false
    }
    if (typeof value === 'boolean') {
      dropInEnabled = value
      return true
    }
    if (value === 'allow-drop-in') {
      dropInEnabled = true
      return true
    }
    return false
  })
  return { realtimeEnabled, dropInEnabled }
}

export async function loadMatchingResources({ supabase, gameId, mode, realtimeEnabled, brawlEnabled }) {
  const [roles, queueResult, participantPool, roleStatusMap] = await Promise.all([
    loadActiveRoles(supabase, gameId),
    loadQueueEntries(supabase, { gameId, mode }),
    realtimeEnabled ? Promise.resolve([]) : loadParticipantPool(supabase, gameId),
    brawlEnabled ? loadRoleStatusCounts(supabase, gameId) : Promise.resolve(new Map()),
  ])

  return {
    roles,
    queue: queueResult,
    participantPool,
    roleStatusMap,
  }
}

export function buildCandidateSample({ queue, participantPool, realtimeEnabled }) {
  if (realtimeEnabled) {
    return queue
  }

  const ownersInQueue = new Set(queue.map((row) => row?.owner_id || row?.ownerId).filter(Boolean))
  const filteredPool = participantPool.filter((row) => {
    const ownerId = row?.owner_id || row?.ownerId
    if (!ownerId) return false
    if (ownersInQueue.has(ownerId)) {
      return false
    }
    return true
  })

  const shuffled = filteredPool.slice()
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const tmp = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = tmp
  }

  return queue.concat(shuffled)
}

export async function findRealtimeDropInTarget() {
  return null
}
