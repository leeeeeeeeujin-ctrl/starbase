import { supabase } from '@/lib/rank/db'
import {
  loadActiveRoles,
  loadHeroesByIds,
  loadParticipantPool,
  loadQueueEntries,
  markAssignmentsMatched,
  runMatching,
  flattenAssignmentMembers,
} from '@/lib/rank/matchmakingService'
import { withTable } from '@/lib/supabaseTables'

function generateMatchCode() {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `match_${stamp}_${random}`
}

function mapToPlain(map) {
  const plain = {}
  if (!map || typeof map.forEach !== 'function') return plain
  map.forEach((value, key) => {
    plain[key] = value
  })
  return plain
}

function shuffle(entries) {
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const tmp = entries[index]
    entries[index] = entries[swapIndex]
    entries[swapIndex] = tmp
  }
  return entries
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { gameId, mode } = req.body || {}
  if (!gameId) {
    return res.status(400).json({ error: 'missing_game_id' })
  }

  try {
    const { data: gameRow, error: gameError } = await withTable(
      supabase,
      'rank_games',
      (table) => supabase.from(table).select('id, realtime_match, rules').eq('id', gameId).single(),
    )
    if (gameError) throw gameError

    const [roles, queueResult, participantPool] = await Promise.all([
      loadActiveRoles(supabase, gameId),
      loadQueueEntries(supabase, { gameId, mode }),
      gameRow?.realtime_match ? Promise.resolve([]) : loadParticipantPool(supabase, gameId),
    ])

    let queue = queueResult

    if (!gameRow?.realtime_match) {
      const ownersInQueue = new Set(
        queueResult.map((row) => row?.owner_id || row?.ownerId).filter(Boolean),
      )
      const filteredPool = participantPool.filter((row) => {
        const ownerId = row?.owner_id || row?.ownerId
        if (!ownerId) return false
        if (ownersInQueue.has(ownerId)) {
          return false
        }
        return true
      })

      queue = queueResult.concat(shuffle(filteredPool.slice()))
    }

    const result = runMatching({ mode, roles, queue })

    if (!result.ready) {
      return res.status(200).json({
        ready: false,
        assignments: result.assignments || [],
        totalSlots: result.totalSlots,
        maxWindow: result.maxWindow || 0,
        error: result.error || null,
      })
    }

    const matchCode = generateMatchCode()
    await markAssignmentsMatched(supabase, {
      assignments: result.assignments,
      gameId,
      mode,
      matchCode,
    })

    const members = flattenAssignmentMembers(result.assignments)
    const heroIds = members.map((member) => member.hero_id || member.heroId)
    const heroMap = await loadHeroesByIds(supabase, heroIds)

    return res.status(200).json({
      ready: true,
      assignments: result.assignments,
      totalSlots: result.totalSlots,
      maxWindow: result.maxWindow || 0,
      matchCode,
      heroMap: mapToPlain(heroMap),
    })
  } catch (error) {
    console.error('match handler error:', error)
    return res.status(500).json({ error: 'match_failed', detail: error?.message || String(error) })
  }
}

