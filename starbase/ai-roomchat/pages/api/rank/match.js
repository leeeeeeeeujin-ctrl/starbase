import { supabase } from '@/lib/rank/db'
import { loadHeroesByIds, markAssignmentsMatched, runMatching, flattenAssignmentMembers } from '@/lib/rank/matchmakingService'
import {
  buildCandidateSample,
  extractMatchingToggles,
  findRealtimeDropInTarget,
  loadMatchingResources,
} from '@/lib/rank/matchingPipeline'
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

function parseRules(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch (err) {
      console.warn('rules parse failed:', err)
      return {}
    }
    return {}
  }
  if (typeof raw === 'object') {
    return raw
  }
  return {}
}

function determineBrawlVacancies(roles, statusMap) {
  const vacancies = []
  if (!Array.isArray(roles) || !(statusMap instanceof Map)) {
    return vacancies
  }
  roles.forEach((role) => {
    if (!role) return
    const name = typeof role.name === 'string' ? role.name.trim() : ''
    if (!name) return
    const slotCountRaw = role.slot_count ?? role.slotCount ?? role.capacity
    const slotCount = Number(slotCountRaw)
    if (!Number.isFinite(slotCount) || slotCount <= 0) return
    const bucket = statusMap.get(name) || { active: 0, defeated: 0 }
    const activeCount = Number(bucket.active) || 0
    const defeatedCount = Number(bucket.defeated) || 0
    const vacancy = slotCount - activeCount
    if (vacancy > 0 && defeatedCount > 0) {
      vacancies.push({ name, slot_count: vacancy, defeated: defeatedCount })
    }
  })
  return vacancies
}

function mapCountsToPlain(statusMap) {
  const plain = {}
  if (!(statusMap instanceof Map)) return plain
  statusMap.forEach((value, key) => {
    plain[key] = value
  })
  return plain
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

    const rules = parseRules(gameRow?.rules)
    const brawlEnabled = rules?.brawl_rule === 'allow-brawl'
    const toggles = extractMatchingToggles(gameRow, rules)

    const { roles, queue: queueResult, participantPool, roleStatusMap } = await loadMatchingResources({
      supabase,
      gameId,
      mode,
      realtimeEnabled: toggles.realtimeEnabled,
      brawlEnabled,
    })

    let queue = queueResult

    if (brawlEnabled) {
      const brawlVacancies = determineBrawlVacancies(roles, roleStatusMap)
      if (brawlVacancies.length) {
        const brawlResult = runMatching({ mode, roles: brawlVacancies, queue: queueResult })
        if (brawlResult.ready) {
          const matchCode = generateMatchCode()
          await markAssignmentsMatched(supabase, {
            assignments: brawlResult.assignments,
            gameId,
            mode,
            matchCode,
          })

          const members = flattenAssignmentMembers(brawlResult.assignments)
          const heroIds = members.map((member) => member.hero_id || member.heroId)
          const heroMap = await loadHeroesByIds(supabase, heroIds)

          return res.status(200).json({
            ready: true,
            assignments: brawlResult.assignments,
            totalSlots: brawlResult.totalSlots,
            maxWindow: brawlResult.maxWindow || 0,
            matchCode,
            heroMap: mapToPlain(heroMap),
            matchType: 'brawl',
            brawlVacancies,
            roleStatus: mapCountsToPlain(roleStatusMap),
          })
        }
      }
    }

    if (toggles.realtimeEnabled && toggles.dropInEnabled) {
      const dropInResult = await findRealtimeDropInTarget({
        supabase,
        gameId,
        mode,
        roles,
        queue,
        rules,
      })

      if (dropInResult && dropInResult.ready) {
        await markAssignmentsMatched(supabase, {
          assignments: dropInResult.assignments,
          gameId,
          mode,
          matchCode: dropInResult.matchCode || dropInResult.dropInTarget?.roomCode || null,
        })

        const members = flattenAssignmentMembers(dropInResult.assignments)
        const heroIds = members.map((member) => member.hero_id || member.heroId).filter(Boolean)
        const heroMap = heroIds.length ? await loadHeroesByIds(supabase, heroIds) : new Map()

        return res.status(200).json({
          ...dropInResult,
          matchType: dropInResult.matchType || 'drop_in',
          matchCode: dropInResult.matchCode || dropInResult.dropInTarget?.roomCode || null,
          heroMap: mapToPlain(heroMap),
        })
      }
    }

    const candidateSample = buildCandidateSample({
      queue,
      participantPool,
      realtimeEnabled: toggles.realtimeEnabled,
    })

    const result = runMatching({ mode, roles, queue: candidateSample })

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
      matchType: 'standard',
      heroMap: mapToPlain(heroMap),
    })
  } catch (error) {
    console.error('match handler error:', error)
    return res.status(500).json({ error: 'match_failed', detail: error?.message || String(error) })
  }
}

