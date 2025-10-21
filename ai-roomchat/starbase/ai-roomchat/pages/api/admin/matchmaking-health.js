import { supabase } from '@/lib/rank/db'
import {
  loadActiveRoles,
  loadRoleLayout,
  loadQueueEntries,
  runMatching,
} from '@/lib/rank/matchmakingService'
import { buildRoleCapacityMap } from '@/lib/rank/roleLayoutLoader'

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'y'].includes(v)) return true
    if (['0', 'false', 'no', 'n'].includes(v)) return false
  }
  return fallback
}

function parseQuery(req) {
  const { gameId, mode, debug } = req.query || {}
  return {
    gameId: gameId || null,
    mode: mode || 'rank_solo',
    debug: parseBool(debug, false),
  }
}

function buildQueueRoleCounts(queue = []) {
  const map = new Map()
  queue.forEach((e) => {
    const role = (e?.role || '').trim()
    if (!role) return
    map.set(role, (map.get(role) || 0) + 1)
  })
  return Object.fromEntries(map.entries())
}

function aggregateErrorGroups(error) {
  const agg = new Map()
  const items = Array.isArray(error?.groups) ? error.groups : []
  items.forEach((g) => {
    const role = (g?.role || '').trim() || 'unknown'
    const reason = (g?.reason || '').trim() || 'unknown'
    const key = `${role}::${reason}`
    const size = Number(g?.size) || 0
    const prev = agg.get(key) || { role, reason, groups: 0, size: 0 }
    prev.groups += 1
    prev.size += size
    agg.set(key, prev)
  })
  return Array.from(agg.values())
}

function computeWaitInfo(queueEntries = []) {
  if (!Array.isArray(queueEntries) || queueEntries.length === 0) {
    return { waitSeconds: null, oldestJoinedAt: null }
  }

  let oldestTimestamp = Number.POSITIVE_INFINITY
  let oldestIso = null

  queueEntries.forEach((entry) => {
    if (!entry) return
    const joined = entry.joined_at || entry.joinedAt
    if (!joined) return
    const parsed = Date.parse(joined)
    if (!Number.isFinite(parsed)) return
    if (parsed < oldestTimestamp) {
      oldestTimestamp = parsed
      oldestIso = new Date(parsed).toISOString()
    }
  })

  if (!Number.isFinite(oldestTimestamp)) {
    return { waitSeconds: null, oldestJoinedAt: null }
  }

  const now = Date.now()
  const diffMs = Math.max(0, now - oldestTimestamp)
  return { waitSeconds: diffMs / 1000, oldestJoinedAt: oldestIso }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { gameId, mode, debug } = parseQuery(req)
  if (!gameId) {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  try {
    const [{ roles, slotLayout }, activeRoles, queue] = await Promise.all([
      loadRoleLayout(supabase, gameId),
      loadActiveRoles(supabase, gameId),
      loadQueueEntries(supabase, { gameId, mode }),
    ])

    const capacityMap = Object.fromEntries(buildRoleCapacityMap({ roles: activeRoles, slotLayout }).entries())
    const queueCounts = buildQueueRoleCounts(queue)
    const totalSlots = Object.values(capacityMap).reduce((a, b) => a + Number(b || 0), 0)

    const result = runMatching({ mode, roles: activeRoles, queue })
    const errorAgg = aggregateErrorGroups(result?.error)
    const assigned = Array.isArray(result?.assignments)
      ? result.assignments.reduce((acc, a) => acc + (Array.isArray(a.members) ? a.members.length : 0), 0)
      : 0

    // Rough deficit estimate: per-role capacity minus number of queue candidates for that role
    // Note: availability != feasibility (score/party conflicts), but helpful as a first glance.
    const deficit = Object.entries(capacityMap).map(([role, cap]) => {
      const available = Number(queueCounts[role] || 0)
      const missing = Math.max(0, Number(cap || 0) - available)
      return { role, capacity: Number(cap || 0), available, missing }
    })

    const waitInfo = computeWaitInfo(queue)

    const payload = {
      ready: Boolean(result?.ready),
      mode,
      totalSlots: Number(result?.totalSlots ?? totalSlots),
      assignedSlots: assigned,
      missingSlots: Math.max(0, Number(result?.totalSlots ?? totalSlots) - assigned),
      maxWindow: Number(result?.maxWindow || 0),
      error: result?.error || null,
      errorAggregates: errorAgg,
      roles: Array.isArray(activeRoles) ? activeRoles : [],
      slotLayout: Array.isArray(slotLayout) ? slotLayout : [],
      capacityMap,
      queueCounts,
      queueSize: Array.isArray(queue) ? queue.length : 0,
      queueWaitSeconds: waitInfo.waitSeconds,
      queueOldestJoinedAt: waitInfo.oldestJoinedAt,
      deficit,
    }

    if (debug) {
      payload.debug = {
        assignments: result?.assignments || [],
        rooms: result?.rooms || [],
      }
    }

    return res.status(200).json(payload)
  } catch (error) {
    console.error('matchmaking-health failed:', error)
    return res.status(500).json({ error: 'internal_error', message: error?.message || String(error) })
  }
}
