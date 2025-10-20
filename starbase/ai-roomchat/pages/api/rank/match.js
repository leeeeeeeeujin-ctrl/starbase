import { supabase } from '@/lib/rank/db'
import {
  loadHeroesByIds,
  markAssignmentsMatched,
  runMatching,
  flattenAssignmentMembers,
  postCheckMatchAssignments,
  sanitizeAssignments,
} from '@/lib/rank/matchmakingService'
import {
  buildCandidateSample,
  extractMatchingToggles,
  findRealtimeDropInTarget,
  loadMatchingResources,
} from '@/lib/rank/matchingPipeline'
import { withTable } from '@/lib/supabaseTables'
import { recordMatchmakingLog, buildAssignmentSummary } from '@/lib/rank/matchmakingLogs'
import { computeRoleReadiness } from '@/lib/rank/matchRoleSummary'

function generateMatchCode() {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `match_${stamp}_${random}`
}

function nowIso() {
  return new Date().toISOString()
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

function serializeRoles(roles) {
  if (!Array.isArray(roles)) return []
  return roles
    .map((role) => {
      if (!role) return null
      const name = typeof role.name === 'string' ? role.name.trim() : ''
      if (!name) return null
      const slotCountRaw = role.slot_count ?? role.slotCount ?? role.capacity
      const slotCount = Number(slotCountRaw)
      const payload = { name }
      if (Number.isFinite(slotCount) && slotCount >= 0) {
        const normalized = Math.trunc(slotCount)
        payload.slot_count = normalized
        payload.slotCount = normalized
      }
      return payload
    })
    .filter(Boolean)
}

function serializeSlotLayout(layout) {
  if (!Array.isArray(layout)) return []
  return layout
    .map((slot, index) => {
      if (!slot) return null
      const roleName = typeof slot.role === 'string' ? slot.role.trim() : ''
      if (!roleName) return null
      const rawIndex = Number(slot.slotIndex ?? slot.slot_index ?? index)
      if (!Number.isFinite(rawIndex) || rawIndex < 0) return null
      const payload = {
        slotIndex: rawIndex,
        role: roleName,
      }
      const heroId = slot.heroId ?? slot.hero_id
      if (heroId != null && heroId !== '') {
        payload.heroId = heroId
      }
      const heroOwnerId = slot.heroOwnerId ?? slot.hero_owner_id
      if (heroOwnerId != null && heroOwnerId !== '') {
        payload.heroOwnerId = heroOwnerId
      }
      return payload
    })
    .filter(Boolean)
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

function normalizeHostQueueEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const heroId = raw.heroId || raw.hero_id
  const ownerId = raw.ownerId || raw.owner_id
  const roleRaw = raw.role || raw.role_name || raw.roleName
  const role = typeof roleRaw === 'string' ? roleRaw.trim() : ''
  if (!heroId || !ownerId || !role) {
    return null
  }

  const joinedAt = nowIso()
  const score = Number(raw.score)
  const rating = Number(raw.rating)
  const entry = {
    id: raw.queueId || raw.id || `host_${heroId}`,
    hero_id: heroId,
    heroId,
    owner_id: ownerId,
    ownerId,
    role,
    score: Number.isFinite(score) ? score : Number.isFinite(rating) ? rating : null,
    rating: Number.isFinite(rating) ? rating : Number.isFinite(score) ? score : null,
    joined_at: joinedAt,
    joinedAt,
    status: 'host',
    simulated: false,
    standin: false,
    match_source: 'host',
  }

  if (Number.isFinite(Number(raw.winRate))) {
    entry.win_rate = Number(raw.winRate)
  }
  if (Number.isFinite(Number(raw.sessions))) {
    entry.session_count = Number(raw.sessions)
  }

  return entry
}

function normalizeRemovedMember(entry) {
  if (!entry || typeof entry !== 'object') return null

  const ownerId = entry.ownerId ?? entry.owner_id ?? null
  const heroId = entry.heroId ?? entry.hero_id ?? null
  const role = entry.role ?? entry.roleName ?? null
  const slotIndexRaw = entry.slotIndex ?? entry.slot_index
  const slotIndex = Number.isFinite(Number(slotIndexRaw))
    ? Number(slotIndexRaw)
    : null
  const reason = entry.reason ?? entry.code ?? null
  const slotKey = entry.slotKey ?? entry.slot_key ?? null

  if (!ownerId && !heroId && !reason) {
    return null
  }

  const normalized = {
    ownerId: ownerId || null,
    heroId: heroId || null,
    role: role || null,
    slotIndex,
    reason: reason || null,
  }

  if (slotKey) {
    normalized.slotKey = String(slotKey)
  }

  return normalized
}

function mergeRemovedMembersLists(lists = []) {
  const merged = []
  const seen = new Set()

  lists
    .filter(Array.isArray)
    .forEach((list) => {
      list.forEach((entry) => {
        const normalized = normalizeRemovedMember(entry)
        if (!normalized) return
        const key = [
          normalized.ownerId || '',
          normalized.heroId || '',
          normalized.role || '',
          normalized.slotIndex ?? '',
          normalized.reason || '',
          normalized.slotKey || '',
        ].join('|')
        if (seen.has(key)) return
        seen.add(key)
        merged.push(normalized)
      })
    })

  return merged
}

function collectAssignmentRemovedMembers(assignments = []) {
  const removed = []
  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return
    if (!Array.isArray(assignment.removedMembers)) return
    assignment.removedMembers.forEach((entry) => {
      removed.push(entry)
    })
  })
  return mergeRemovedMembersLists([removed])
}

function isStandinCandidate(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (entry.simulated === true || entry.standin === true) return true
  const source = entry.match_source || entry.matchSource
  if (typeof source === 'string' && source.trim() === 'participant_pool') {
    return true
  }
  return false
}

function buildStandinId(entry, index) {
  const parts = [
    'standin',
    index,
    entry?.queue_id || entry?.queueId || entry?.id || entry?.hero_id || entry?.heroId || 'anon',
  ]
  return parts
    .map((part) => {
      if (part == null) return 'anon'
      const normalized = String(part)
      return normalized.length ? normalized : 'anon'
    })
    .join('_')
}

function extractMemberPosition(member) {
  if (!member || typeof member !== 'object') return {}
  const result = {}
  const keys = ['memberIndex', 'member_index', 'slotIndex', 'slot_index', 'localIndex', 'local_index']
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(member, key)) {
      result[key] = member[key]
    }
  })
  return result
}

function replaceStandinMember(member, lookup) {
  if (!lookup || lookup.size === 0) return member
  if (!member || typeof member !== 'object') return member
  const keyCandidate =
    member.queue_id || member.queueId || member.id || member.standin_queue_id || member.standinQueueId
  if (!keyCandidate) return member
  const key = String(keyCandidate)
  if (!lookup.has(key)) {
    return member
  }

  const base = lookup.get(key)
  const indices = extractMemberPosition(member)
  const merged = { ...member, ...base, ...indices }
  merged.id = base.id
  merged.queue_id = base.queue_id
  merged.queueId = base.queue_id
  merged.match_source = base.match_source || base.matchSource || 'participant_pool'
  merged.matchSource = merged.match_source
  merged.standin = true
  merged.simulated = true
  return merged
}

function hydrateAssignmentsWithStandins(assignments = [], lookup) {
  if (!lookup || lookup.size === 0) return assignments
  return assignments.map((assignment) => {
    if (!assignment || typeof assignment !== 'object') return assignment
    const clone = { ...assignment }
    if (Array.isArray(assignment.members)) {
      clone.members = assignment.members.map((member) => replaceStandinMember(member, lookup))
    }
    if (Array.isArray(assignment.roleSlots)) {
      clone.roleSlots = assignment.roleSlots.map((slot) => {
        if (!slot || typeof slot !== 'object') return slot
        const slotClone = { ...slot }
        if (Array.isArray(slot.members)) {
          slotClone.members = slot.members.map((member) => replaceStandinMember(member, lookup))
        }
        if (slotClone.member) {
          slotClone.member = replaceStandinMember(slotClone.member, lookup)
        }
        if (slotClone.member) {
          slotClone.occupied = true
        }
        return slotClone
      })
    }
    return clone
  })
}

function hydrateRoomsWithStandins(rooms = [], lookup) {
  if (!lookup || lookup.size === 0) return rooms
  return rooms.map((room) => {
    if (!room || typeof room !== 'object') return room
    const clone = { ...room }
    if (Array.isArray(room.slots)) {
      clone.slots = room.slots.map((slot) => {
        if (!slot || typeof slot !== 'object') return slot
        const slotClone = { ...slot }
        if (Array.isArray(slot.members)) {
          slotClone.members = slot.members.map((member) => replaceStandinMember(member, lookup))
        }
        if (slotClone.member) {
          slotClone.member = replaceStandinMember(slotClone.member, lookup)
        }
        if (slotClone.member) {
          slotClone.occupied = true
        }
        return slotClone
      })
    }
    return clone
  })
}

function prepareMatchingQueue(sample = []) {
  const lookup = new Map()
  const queue = sample.map((entry, index) => {
    if (!isStandinCandidate(entry)) {
      return entry
    }

    const standinId = buildStandinId(entry, index)
    const finalEntry = {
      ...entry,
      id: standinId,
      queue_id: standinId,
      queueId: standinId,
      match_source: entry.match_source || entry.matchSource || 'participant_pool',
      matchSource: entry.match_source || entry.matchSource || 'participant_pool',
      simulated: true,
      standin: true,
    }

    const proxyEntry = {
      ...finalEntry,
      simulated: false,
      standin: false,
    }

    lookup.set(standinId, finalEntry)
    return proxyEntry
  })

  return { queue, lookup }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { gameId, mode, host } = req.body || {}
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

    const {
      roles,
      slotLayout,
      queue: queueResult,
      participantPool: participantPoolResult,
      roleStatusMap,
    } = await loadMatchingResources({
      supabase,
      gameId,
      mode,
      realtimeEnabled: toggles.realtimeEnabled,
      brawlEnabled,
    })

    let queue = Array.isArray(queueResult) ? [...queueResult] : []
    let participantPool = Array.isArray(participantPoolResult) ? [...participantPoolResult] : []

    if (!toggles.realtimeEnabled) {
      const hostEntry = normalizeHostQueueEntry(host)
      if (hostEntry) {
        const ownerKey = String(hostEntry.owner_id)
        const heroKey = String(hostEntry.hero_id)
        queue = queue.filter((entry) => {
          const entryOwner = entry?.owner_id || entry?.ownerId
          if (entryOwner && String(entryOwner) === ownerKey) {
            return false
          }
          const entryHero = entry?.hero_id || entry?.heroId
          if (entryHero && String(entryHero) === heroKey) {
            return false
          }
          return true
        })
        participantPool = participantPool.filter((entry) => {
          const entryOwner = entry?.owner_id || entry?.ownerId
          if (entryOwner && String(entryOwner) === ownerKey) {
            return false
          }
          const entryHero = entry?.hero_id || entry?.heroId
          if (entryHero && String(entryHero) === heroKey) {
            return false
          }
          return true
        })
        queue.unshift(hostEntry)
      }
    }

    const baseMetadata = {
      realtimeEnabled: toggles.realtimeEnabled,
      dropInEnabled: toggles.dropInEnabled,
      queueSize: queue.length,
      participantPoolSize: participantPool.length,
      roles: Array.isArray(roles) ? roles.map((role) => role?.name).filter(Boolean) : [],
      slotLayout: serializeSlotLayout(slotLayout),
    }

    const baseLog = {
      game_id: gameId,
      mode: mode || null,
    }

    const logStage = (overrides = {}) =>
      recordMatchmakingLog(supabase, {
        ...baseLog,
        ...overrides,
        metadata: { ...baseMetadata, ...(overrides.metadata || {}) },
      })

    if (brawlEnabled) {
        const brawlVacancies = determineBrawlVacancies(roles, roleStatusMap)
        if (brawlVacancies.length) {
          const brawlResult = runMatching({ mode, roles: brawlVacancies, queue })
        if (brawlResult.ready) {
          const matchCode = generateMatchCode()
          await markAssignmentsMatched(supabase, {
            assignments: brawlResult.assignments,
            gameId,
            mode,
            matchCode,
          })

          await logStage({
            stage: 'brawl_fill',
            status: 'matched',
            match_code: matchCode,
            score_window: brawlResult.maxWindow || 0,
            metadata: {
              assignments: buildAssignmentSummary(brawlResult.assignments),
              brawlVacancies,
              roleStatus: mapCountsToPlain(roleStatusMap),
            },
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
            roles: serializeRoles(roles),
            slotLayout: serializeSlotLayout(slotLayout),
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

      if (dropInResult && dropInResult.meta && !dropInResult.ready) {
        await logStage({
          stage: 'drop_in',
          status: dropInResult.missing ? 'missing_dependency' : 'skipped',
          drop_in: true,
          metadata: {
            dropInMeta: dropInResult.meta,
          },
        })
      }

      if (dropInResult && dropInResult.ready) {
        await markAssignmentsMatched(supabase, {
          assignments: dropInResult.assignments,
          gameId,
          mode,
          matchCode: dropInResult.matchCode || dropInResult.dropInTarget?.roomCode || null,
        })

        await logStage({
          stage: 'drop_in',
          status: 'matched',
          drop_in: true,
          match_code: dropInResult.matchCode || dropInResult.dropInTarget?.roomCode || null,
          score_window: dropInResult.maxWindow || null,
          metadata: {
            assignments: buildAssignmentSummary(dropInResult.assignments),
            dropInTarget: dropInResult.dropInTarget || null,
            dropInMeta: dropInResult.meta || null,
          },
        })

        const members = flattenAssignmentMembers(dropInResult.assignments)
        const heroIds = members.map((member) => member.hero_id || member.heroId).filter(Boolean)
        const heroMap = heroIds.length ? await loadHeroesByIds(supabase, heroIds) : new Map()

        return res.status(200).json({
          ...dropInResult,
          matchType: dropInResult.matchType || 'drop_in',
          matchCode: dropInResult.matchCode || dropInResult.dropInTarget?.roomCode || null,
          heroMap: mapToPlain(heroMap),
          roles: serializeRoles(roles),
          slotLayout: serializeSlotLayout(slotLayout),
        })
      }
    }

    const { sample: candidateSample, meta: sampleMeta, standins: sampledStandins } = buildCandidateSample({
      queue,
      participantPool,
      realtimeEnabled: toggles.realtimeEnabled,
      roles,
      rules,
    })

    const { queue: preparedQueue, lookup: standinLookup } = toggles.realtimeEnabled
      ? { queue: candidateSample, lookup: new Map() }
      : prepareMatchingQueue(candidateSample)

    baseMetadata.standinSampled = sampleMeta?.standinSampled ?? sampledStandins?.length ?? 0

    const result = runMatching({ mode, roles, queue: preparedQueue })

    let assignments = Array.isArray(result.assignments) ? result.assignments : []
    let rooms = Array.isArray(result.rooms) ? result.rooms : []
    assignments = hydrateAssignmentsWithStandins(assignments, standinLookup)
    rooms = hydrateRoomsWithStandins(rooms, standinLookup)
    assignments = sanitizeAssignments(assignments)
    let aggregatedRemovedMembers = collectAssignmentRemovedMembers(assignments)

    let readiness = computeRoleReadiness({
      roles,
      slotLayout,
      assignments,
      rooms,
    })

    let matchReady = Boolean(result.ready || readiness.ready)
    let postCheckResult = null

    if (matchReady) {
      postCheckResult = await postCheckMatchAssignments(supabase, {
        gameId,
        assignments,
        rooms,
        roles,
        slotLayout,
      })

      assignments = sanitizeAssignments(postCheckResult.assignments)
      rooms = postCheckResult.rooms
      aggregatedRemovedMembers = mergeRemovedMembersLists([
        aggregatedRemovedMembers,
        postCheckResult?.removedMembers || [],
        collectAssignmentRemovedMembers(assignments),
      ])
      readiness = computeRoleReadiness({
        roles,
        slotLayout,
        assignments,
        rooms,
      })
      matchReady = readiness.ready
    }

    if (!matchReady) {
      const errorCode = postCheckResult ? 'post_check_pending' : result.error || null
      const combinedRemoved = mergeRemovedMembersLists([
        aggregatedRemovedMembers,
        postCheckResult?.removedMembers || [],
      ])
      await logStage({
        stage: toggles.realtimeEnabled ? 'realtime_pool' : 'standard_pool',
        status: 'pending',
        score_window: result.maxWindow || sampleMeta?.window || null,
        metadata: {
          error: errorCode,
          sampleMeta,
          assignments: buildAssignmentSummary(assignments),
          roleBuckets: readiness.buckets,
          postCheckRemoved: combinedRemoved,
        },
      })

      return res.status(200).json({
        ready: false,
        assignments,
        rooms,
        totalSlots: result.totalSlots,
        maxWindow: result.maxWindow || 0,
        error: errorCode,
        sampleMeta,
        roles: serializeRoles(roles),
        slotLayout: serializeSlotLayout(slotLayout),
        roleBuckets: readiness.buckets,
        removedMembers: combinedRemoved,
      })
    }

    const matchCode = generateMatchCode()
    await markAssignmentsMatched(supabase, {
      assignments,
      gameId,
      mode,
      matchCode,
    })

    await logStage({
      stage: toggles.realtimeEnabled ? 'realtime_match' : 'offline_match',
      status: 'matched',
      match_code: matchCode,
      score_window: result.maxWindow || null,
      metadata: {
        sampleMeta,
        assignments: buildAssignmentSummary(assignments),
        roleBuckets: readiness.buckets,
        postCheckRemoved: aggregatedRemovedMembers,
      },
    })

    const members = flattenAssignmentMembers(assignments)
    const heroIds = members.map((member) => member.hero_id || member.heroId)
    const heroMap = await loadHeroesByIds(supabase, heroIds)

    return res.status(200).json({
      ready: true,
      assignments,
      rooms,
      totalSlots: result.totalSlots,
      maxWindow: result.maxWindow || 0,
      matchCode,
      matchType: 'standard',
      heroMap: mapToPlain(heroMap),
      sampleMeta,
      roles: serializeRoles(roles),
      slotLayout: serializeSlotLayout(slotLayout),
      roleBuckets: readiness.buckets,
      removedMembers: aggregatedRemovedMembers,
    })
  } catch (error) {
    await recordMatchmakingLog(supabase, {
      game_id: gameId || req.body?.gameId || null,
      mode: mode || req.body?.mode || null,
      stage: 'handler',
      status: 'error',
      reason: error?.code || error?.message || 'match_failed',
      metadata: {
        detail: error?.message || null,
      },
    })
    console.error('match handler error:', error)
    return res.status(500).json({ error: 'match_failed', detail: error?.message || String(error) })
  }
}

