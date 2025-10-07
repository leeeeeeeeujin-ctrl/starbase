import {
  filterStaleQueueEntries,
  loadParticipantPool,
  loadQueueEntries,
  loadRoleLayout,
  loadRoleStatusCounts,
  removeQueueEntry,
} from '@/lib/rank/matchmakingService'
import { getQueueModes } from '@/lib/rank/matchModes'
import { withTable } from '@/lib/supabaseTables'
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors'
import { QUEUE_STALE_THRESHOLD_MS } from '@/lib/rank/queueHeartbeat'

const DROP_IN_RULE_KEYS = ['drop_in', 'allow_drop_in', 'dropIn', 'allowDropIn', 'enable_drop_in', 'drop_in_enabled']
const DROP_IN_WINDOW_KEYS = [
  'drop_in_score_window',
  'dropInScoreWindow',
  'drop_in_window',
  'dropInWindow',
  'drop_in_max_window',
  'dropInMaxWindow',
]
const ACTIVE_ROOM_STATUSES = new Set(['active', 'running', 'in_progress', 'open', 'pending'])
const DEFAULT_DROP_IN_WINDOW = 200
const NON_REALTIME_WINDOW_KEYS = [
  'non_realtime_score_window',
  'nonRealtimeScoreWindow',
  'offline_score_window',
  'offlineScoreWindow',
]
const NON_REALTIME_PER_ROLE_KEYS = [
  'non_realtime_simulated_per_role',
  'nonRealtimeSimulatedPerRole',
  'offline_simulated_per_role',
]
const NON_REALTIME_TOTAL_KEYS = [
  'non_realtime_simulated_total',
  'nonRealtimeSimulatedTotal',
  'offline_simulated_total',
]
const DEFAULT_NON_REALTIME_WINDOW = 300
const DEFAULT_NON_REALTIME_PER_ROLE = 6
const DEFAULT_NON_REALTIME_TOTAL = 24

function nowIso() {
  return new Date().toISOString()
}

function normalizeId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && typeof value.id !== 'undefined') {
    return normalizeId(value.id)
  }
  return String(value)
}

function normalizeBooleanFlag(value, defaultValue = false) {
  if (value == null) return defaultValue
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return defaultValue
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return defaultValue
    if (['true', '1', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false
    }
    if (['realtime', 'real-time', 'realtime_only', 'realtime-only', 'live'].includes(normalized)) {
      return true
    }
    if (
      [
        'manual',
        'manual_only',
        'manual-only',
        'offline',
        'off-line',
        'nonrealtime',
        'non-realtime',
        'non_realtime',
        'queue',
        'turn',
        'turn-based',
        'turn_based',
      ].includes(normalized)
    ) {
      return false
    }
    if (normalized === 'allow') return true
    if (normalized === 'forbid' || normalized === 'ban') return false
    if (normalized === 'allow-drop-in') return true
  }
  if (typeof value === 'object' && value !== null) {
    if (typeof value.value !== 'undefined') {
      return normalizeBooleanFlag(value.value, defaultValue)
    }
  }
  return Boolean(value)
}

function normalizeRoleName(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'object') {
    if (typeof raw.name === 'string') return raw.name.trim()
    if (typeof raw.role === 'string') return raw.role.trim()
  }
  return ''
}

function extractNumeric(value, fallback = null) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return fallback
}

function deriveQueueEntryScore(entry) {
  if (!entry) return 1000
  if (Number.isFinite(Number(entry.score))) return Number(entry.score)
  if (Number.isFinite(Number(entry.rating))) return Number(entry.rating)
  return 1000
}

function deriveTimestamp(value) {
  if (!value) return Number.NaN
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  return Number.NaN
}

function resolveDropInWindow(rules = {}) {
  for (const key of DROP_IN_WINDOW_KEYS) {
    const candidate = rules?.[key]
    const numeric = Number(candidate)
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric
    }
  }
  return DEFAULT_DROP_IN_WINDOW
}

function resolveNonRealtimeWindow(rules = {}) {
  for (const key of NON_REALTIME_WINDOW_KEYS) {
    const candidate = rules?.[key]
    const numeric = Number(candidate)
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric
    }
  }
  return DEFAULT_NON_REALTIME_WINDOW
}

function resolveNonRealtimePerRoleLimit(rules = {}) {
  for (const key of NON_REALTIME_PER_ROLE_KEYS) {
    const candidate = rules?.[key]
    const numeric = Number(candidate)
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric
    }
  }
  return DEFAULT_NON_REALTIME_PER_ROLE
}

function resolveNonRealtimeTotalLimit(rules = {}) {
  for (const key of NON_REALTIME_TOTAL_KEYS) {
    const candidate = rules?.[key]
    const numeric = Number(candidate)
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric
    }
  }
  return DEFAULT_NON_REALTIME_TOTAL
}

function cloneQueueMember(entry, extras = {}) {
  if (!entry || typeof entry !== 'object') return { ...extras }
  const ownerId = entry.owner_id || entry.ownerId || null
  const base = {
    id: entry.id || entry.queue_id || entry.queueId || null,
    owner_id: ownerId,
    ownerId,
    hero_id: entry.hero_id || entry.heroId || null,
    role: normalizeRoleName(entry.role),
    score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
    rating: Number.isFinite(Number(entry.rating)) ? Number(entry.rating) : null,
    joined_at: entry.joined_at || entry.joinedAt || null,
    joinedAt: entry.joined_at || entry.joinedAt || null,
  }
  return { ...base, ...extras }
}

function isRealtimeRoomMatch(room, mode) {
  if (!room) return false
  const status = normalizeRoleName(room.status).toLowerCase()
  if (status && !ACTIVE_ROOM_STATUSES.has(status)) return false
  if (!mode) return true
  const queueModes = new Set(getQueueModes(mode))
  if (!queueModes.size) return true
  if (room.mode && queueModes.has(room.mode)) return true
  const normalized = normalizeRoleName(room.mode).toLowerCase()
  return normalized ? queueModes.has(normalized) : false
}

function buildRoomStats({ slots = [], participantScores }) {
  const openSlotsByRole = new Map()
  const firstOpenSlotByRole = new Map()
  const roleScoreBuckets = new Map()
  const occupantScores = []

  slots.forEach((slot) => {
    if (!slot) return
    const roleName = normalizeRoleName(slot.role)
    if (!roleName) return
    const ownerId = normalizeId(slot.occupant_owner_id || slot.occupantOwnerId)
    if (!ownerId) {
      openSlotsByRole.set(roleName, (openSlotsByRole.get(roleName) || 0) + 1)
      if (!firstOpenSlotByRole.has(roleName)) {
        firstOpenSlotByRole.set(roleName, slot)
      }
      return
    }

    const score = participantScores.get(ownerId)
    if (Number.isFinite(score)) {
      occupantScores.push(score)
      if (!roleScoreBuckets.has(roleName)) {
        roleScoreBuckets.set(roleName, [])
      }
      roleScoreBuckets.get(roleName).push(score)
    }
  })

  const roleAverages = new Map()
  roleScoreBuckets.forEach((scores, role) => {
    if (!scores.length) return
    const sum = scores.reduce((acc, value) => acc + value, 0)
    roleAverages.set(role, sum / scores.length)
  })

  let overallAverage = null
  if (occupantScores.length) {
    const sum = occupantScores.reduce((acc, value) => acc + value, 0)
    overallAverage = sum / occupantScores.length
  }

  return {
    openSlotsByRole,
    firstOpenSlotByRole,
    roleAverages,
    occupantCount: occupantScores.length,
    overallAverage,
  }
}

function compareCandidates(a, b) {
  if (a.scoreGap !== b.scoreGap) {
    return a.scoreGap - b.scoreGap
  }
  if (a.stats.occupantCount !== b.stats.occupantCount) {
    return b.stats.occupantCount - a.stats.occupantCount
  }
  const aJoined = Date.parse(a.entry.joined_at || a.entry.joinedAt || '')
  const bJoined = Date.parse(b.entry.joined_at || b.entry.joinedAt || '')
  if (!Number.isNaN(aJoined) || !Number.isNaN(bJoined)) {
    if (Number.isNaN(aJoined)) return 1
    if (Number.isNaN(bJoined)) return -1
    if (aJoined !== bJoined) return aJoined - bJoined
  }
  const aUpdated = Date.parse(a.room.updated_at || a.room.updatedAt || '')
  const bUpdated = Date.parse(b.room.updated_at || b.room.updatedAt || '')
  if (!Number.isNaN(aUpdated) || !Number.isNaN(bUpdated)) {
    if (Number.isNaN(aUpdated)) return 1
    if (Number.isNaN(bUpdated)) return -1
    return aUpdated - bUpdated
  }
  return 0
}

async function claimDropInSlot({ supabase, room, slot, entry }) {
  const ownerId = normalizeId(entry?.owner_id || entry?.ownerId)
  if (!ownerId || !slot?.id) {
    return { ok: false }
  }

  const now = nowIso()

  const updateResult = await withTable(supabase, 'rank_room_slots', (table) =>
    supabase
      .from(table)
      .update({
        occupant_owner_id: ownerId,
        occupant_hero_id: entry?.hero_id || entry?.heroId || null,
        occupant_ready: false,
        joined_at: now,
        updated_at: now,
      })
      .eq('id', slot.id)
      .is('occupant_owner_id', null)
      .select('id, room_id, slot_index, role, occupant_owner_id, occupant_hero_id, joined_at')
      .maybeSingle(),
  )

  if (updateResult?.error) {
    if (isMissingSupabaseTable(updateResult.error)) {
      return { ok: false, missing: true }
    }
    throw updateResult.error
  }

  const claimed = updateResult?.data || null
  if (!claimed) {
    return { ok: false }
  }

  if (room?.id) {
    const payload = { updated_at: now }
    const currentFilled = extractNumeric(room.filled_count)
    if (currentFilled !== null) {
      payload.filled_count = currentFilled + 1
    }
    await withTable(supabase, 'rank_rooms', (table) =>
      supabase
        .from(table)
        .update(payload)
        .eq('id', room.id),
    )
  }

  return { ok: true, slot: claimed, now }
}

export function extractMatchingToggles(gameRow, rules = {}) {
  let realtimeEnabled = normalizeBooleanFlag(gameRow?.realtime_match, false)

  const matchSourceRaw =
    typeof gameRow?.match_source === 'string'
      ? gameRow.match_source
      : typeof gameRow?.matchSource === 'string'
      ? gameRow.matchSource
      : null

  if (matchSourceRaw) {
    const normalized = matchSourceRaw.trim().toLowerCase()
    if (['manual', 'manual_only', 'manual-only', 'offline', 'nonrealtime', 'non-realtime', 'non_realtime'].includes(normalized)) {
      realtimeEnabled = false
    }
    if (['realtime', 'real-time', 'realtime_only', 'realtime-only', 'live'].includes(normalized)) {
      realtimeEnabled = true
    }
  }

  let dropInEnabled = false
  for (const key of DROP_IN_RULE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rules || {}, key)) {
      continue
    }
    const candidate = rules?.[key]
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase()
      if (!normalized) continue
      if (['allow', 'allow-drop-in', 'enabled', 'enable', 'on', 'true', 'yes', '1'].includes(normalized)) {
        dropInEnabled = true
        break
      }
      if (['forbid', 'disabled', 'disable', 'off', 'false', 'no', '0', 'ban'].includes(normalized)) {
        dropInEnabled = false
        break
      }
      continue
    }
    dropInEnabled = normalizeBooleanFlag(candidate, dropInEnabled)
    break
  }

  return { realtimeEnabled, dropInEnabled }
}

export async function loadMatchingResources({ supabase, gameId, mode, realtimeEnabled, brawlEnabled }) {
  const [{ roles, slotLayout }, queueResult, participantPool, roleStatusMap] = await Promise.all([
    loadRoleLayout(supabase, gameId),
    loadQueueEntries(supabase, { gameId, mode }),
    realtimeEnabled ? Promise.resolve([]) : loadParticipantPool(supabase, gameId),
    brawlEnabled ? loadRoleStatusCounts(supabase, gameId) : Promise.resolve(new Map()),
  ])

  const { freshEntries, staleEntries } = filterStaleQueueEntries(queueResult, {
    staleThresholdMs: QUEUE_STALE_THRESHOLD_MS,
  })

  if (staleEntries.length) {
    try {
      await Promise.all(
        staleEntries
          .map((entry) => ({
            ownerId: entry?.owner_id || entry?.ownerId,
            mode: entry?.mode || mode,
          }))
          .filter((entry) => entry.ownerId)
          .map((entry) => removeQueueEntry(supabase, {
            gameId,
            mode: entry.mode,
            ownerId: entry.ownerId,
          })),
      )
    } catch (error) {
      console.warn('stale queue cleanup failed:', error)
    }
  }

  return {
    roles,
    slotLayout,
    queue: freshEntries,
    participantPool,
    roleStatusMap,
  }
}

function summarizeRoleAverages(queue = []) {
  const roleTotals = new Map()
  let overallSum = 0
  let overallCount = 0

  queue.forEach((entry) => {
    const role = normalizeRoleName(entry?.role)
    if (!role) return
    const score = deriveQueueEntryScore(entry)
    if (!Number.isFinite(score)) return
    overallSum += score
    overallCount += 1
    const bucket = roleTotals.get(role) || { sum: 0, count: 0 }
    bucket.sum += score
    bucket.count += 1
    roleTotals.set(role, bucket)
  })

  const roleAverages = new Map()
  roleTotals.forEach((value, key) => {
    if (value.count > 0) {
      roleAverages.set(key, value.sum / value.count)
    }
  })

  const overallAverage = overallCount > 0 ? overallSum / overallCount : null

  return { roleAverages, overallAverage }
}

function toPlainNumberMap(map) {
  const plain = {}
  if (!map || typeof map.forEach !== 'function') return plain
  map.forEach((value, key) => {
    if (Number.isFinite(value)) {
      plain[key] = Math.round(value)
    }
  })
  return plain
}

export function buildCandidateSample({
  queue = [],
  participantPool = [],
  realtimeEnabled,
  roles = [],
  rules = {},
}) {
  const baseQueue = Array.isArray(queue) ? queue : []
  const meta = {
    realtime: Boolean(realtimeEnabled),
    sampleType: realtimeEnabled ? 'realtime_queue' : 'participant_pool',
    queueCount: baseQueue.length,
    participantPoolCount: Array.isArray(participantPool) ? participantPool.length : 0,
    queueSampled: baseQueue.length,
    simulatedSelected: 0,
    simulatedEligible: 0,
    simulatedFiltered: 0,
    duplicateEligible: 0,
    duplicateSelected: 0,
    scoreWindow: null,
    perRoleLimit: null,
    totalLimit: null,
    queueAverageScore: null,
    roleAverageScores: {},
  }

  if (realtimeEnabled) {
    return { sample: baseQueue, meta }
  }

  const ownersInQueue = new Set(baseQueue.map((row) => row?.owner_id || row?.ownerId).filter(Boolean))
  const roleTargets = new Set(
    roles
      .map((role) => normalizeRoleName(role?.name ?? role))
      .filter((name) => typeof name === 'string' && name.length > 0),
  )

  const { roleAverages, overallAverage } = summarizeRoleAverages(queue)
  if (Number.isFinite(overallAverage)) {
    meta.queueAverageScore = Math.round(overallAverage)
  }
  meta.roleAverageScores = toPlainNumberMap(roleAverages)

  const windowSize = resolveNonRealtimeWindow(rules)
  const perRoleLimit = resolveNonRealtimePerRoleLimit(rules)
  const totalLimit = resolveNonRealtimeTotalLimit(rules)

  meta.scoreWindow = windowSize
  meta.perRoleLimit = perRoleLimit
  meta.totalLimit = totalLimit

  const uniqueOwnerCandidates = []
  const duplicateOwnerCandidates = []

  const createCandidate = ({ entry, role, scoreGap, joinedStamp, duplicateOwner }) => ({
    entry,
    role,
    scoreGap,
    joinedStamp,
    duplicateOwner: Boolean(duplicateOwner),
  })

  participantPool.forEach((row) => {
    if (!row) return
    const ownerId = row?.owner_id || row?.ownerId
    if (!ownerId) {
      return
    }

    const roleName = normalizeRoleName(row.role)
    if (!roleName) return
    if (roleTargets.size > 0 && !roleTargets.has(roleName)) return

    const score = deriveQueueEntryScore(row)
    const baseAverage = Number.isFinite(roleAverages.get(roleName))
      ? roleAverages.get(roleName)
      : overallAverage
    let scoreGap = 0
    if (Number.isFinite(baseAverage) && Number.isFinite(score)) {
      scoreGap = Math.abs(baseAverage - score)
    }

    if (Number.isFinite(windowSize) && windowSize >= 0 && Number.isFinite(baseAverage)) {
      if (scoreGap > windowSize) {
        meta.simulatedFiltered += 1
        return
      }
    }

    const duplicateOwner = ownersInQueue.has(ownerId)
    const candidate = createCandidate({
      entry: row,
      role: roleName,
      scoreGap,
      joinedStamp: deriveTimestamp(row?.joined_at || row?.joinedAt || null),
      duplicateOwner,
    })

    if (duplicateOwner) {
      duplicateOwnerCandidates.push(candidate)
    } else {
      uniqueOwnerCandidates.push(candidate)
    }
  })

  meta.simulatedEligible = uniqueOwnerCandidates.length
  meta.duplicateEligible = duplicateOwnerCandidates.length

  const sortCandidates = (list) =>
    list.sort((a, b) => {
      if (a.scoreGap !== b.scoreGap) {
        if (!Number.isFinite(a.scoreGap)) return 1
        if (!Number.isFinite(b.scoreGap)) return -1
        return a.scoreGap - b.scoreGap
      }
      if (a.joinedStamp !== b.joinedStamp) {
        if (Number.isNaN(a.joinedStamp)) return 1
        if (Number.isNaN(b.joinedStamp)) return -1
        return a.joinedStamp - b.joinedStamp
      }
      return 0
    })

  sortCandidates(uniqueOwnerCandidates)
  sortCandidates(duplicateOwnerCandidates)

  const totalSlots = Array.isArray(roles)
    ? roles.reduce((acc, role) => acc + Math.max(0, Number(role?.slot_count ?? role?.slotCount ?? role?.slots ?? 0) || 0), 0)
    : 0

  const requiredStandins = Math.max(0, totalSlots - baseQueue.length)
  const allowDuplicateOwners = duplicateOwnerCandidates.length > 0 && requiredStandins > uniqueOwnerCandidates.length

  const orderedCandidates = allowDuplicateOwners
    ? uniqueOwnerCandidates.concat(duplicateOwnerCandidates)
    : uniqueOwnerCandidates.slice()

  const totalLimitCap =
    Number.isFinite(totalLimit) && totalLimit >= 0 ? totalLimit : Number.POSITIVE_INFINITY
  const standinLimitCap = requiredStandins > 0 ? requiredStandins : Number.POSITIVE_INFINITY
  const selectionCap = Math.min(totalLimitCap, standinLimitCap)

  const selectedCandidates = []
  const perRoleSelected = new Map()

  for (const candidate of orderedCandidates) {
    if (candidate.duplicateOwner && !allowDuplicateOwners) {
      continue
    }
    if (selectedCandidates.length >= selectionCap) {
      break
    }
    const currentCount = perRoleSelected.get(candidate.role) || 0
    if (Number.isFinite(perRoleLimit) && perRoleLimit >= 0 && currentCount >= perRoleLimit) {
      continue
    }
    selectedCandidates.push(candidate)
    perRoleSelected.set(candidate.role, currentCount + 1)
  }

  const selectedEntries = selectedCandidates.map((candidate) => candidate.entry)

  meta.simulatedSelected = selectedEntries.length
  meta.duplicateSelected = selectedCandidates.filter((candidate) => candidate.duplicateOwner).length

  return { sample: baseQueue.concat(selectedEntries), meta }
}

export async function findRealtimeDropInTarget({ supabase, gameId, mode, roles = [], queue = [], rules = {} } = {}) {
  if (!supabase || !gameId) return null

  const attemptMeta = {
    attempted: true,
    queueSize: Array.isArray(queue) ? queue.length : 0,
    viableEntries: 0,
    roomsConsidered: 0,
    slotsScanned: 0,
    candidates: 0,
    reason: null,
    timestamp: nowIso(),
  }

  if (!Array.isArray(queue) || queue.length === 0) {
    attemptMeta.reason = 'empty_queue'
    return { ready: false, meta: attemptMeta }
  }

  const viableEntries = queue.filter((entry) => {
    if (!entry || entry.simulated) return false
    const roleName = normalizeRoleName(entry.role)
    if (!roleName) return false
    const score = deriveQueueEntryScore(entry)
    return Number.isFinite(score)
  })

  attemptMeta.viableEntries = viableEntries.length

  if (!viableEntries.length) {
    attemptMeta.reason = 'no_viable_entries'
    return { ready: false, meta: attemptMeta }
  }

  const roomResult = await withTable(supabase, 'rank_rooms', (table) =>
    supabase
      .from(table)
      .select('id, code, mode, status, filled_count, updated_at')
      .eq('game_id', gameId),
  )

  if (roomResult?.error) {
    if (isMissingSupabaseTable(roomResult.error)) {
      attemptMeta.reason = 'missing_rank_rooms'
      return { ready: false, missing: true, meta: attemptMeta }
    }
    throw roomResult.error
  }

  const rooms = (roomResult?.data || []).filter((room) => isRealtimeRoomMatch(room, mode))
  attemptMeta.roomsConsidered = rooms.length
  if (!rooms.length) {
    attemptMeta.reason = 'no_realtime_rooms'
    return { ready: false, meta: attemptMeta }
  }

  const roomIds = rooms.map((room) => room.id).filter(Boolean)
  if (!roomIds.length) {
    attemptMeta.reason = 'missing_room_ids'
    return { ready: false, meta: attemptMeta }
  }

  const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
    supabase
      .from(table)
      .select('id, room_id, role, slot_index, occupant_owner_id, occupant_hero_id, joined_at')
      .in('room_id', roomIds),
  )

  if (slotResult?.error) {
    if (isMissingSupabaseTable(slotResult.error)) {
      attemptMeta.reason = 'missing_rank_room_slots'
      return { ready: false, missing: true, meta: attemptMeta }
    }
    throw slotResult.error
  }

  const slotRows = Array.isArray(slotResult?.data) ? slotResult.data : []
  attemptMeta.slotsScanned = slotRows.length
  if (!slotRows.length) {
    attemptMeta.reason = 'no_open_slots'
    return { ready: false, meta: attemptMeta }
  }

  const slotsByRoom = new Map()
  const occupantOwnerIds = new Set()
  slotRows.forEach((slot) => {
    if (!slot) return
    const roomId = slot.room_id || slot.roomId
    if (!roomId) return
    if (!slotsByRoom.has(roomId)) {
      slotsByRoom.set(roomId, [])
    }
    slotsByRoom.get(roomId).push(slot)
    const ownerId = normalizeId(slot.occupant_owner_id || slot.occupantOwnerId)
    if (ownerId) {
      occupantOwnerIds.add(ownerId)
    }
  })

  const participantScores = new Map()
  if (occupantOwnerIds.size > 0) {
    const participantResult = await withTable(supabase, 'rank_participants', (table) =>
      supabase
        .from(table)
        .select('owner_id, score, rating')
        .eq('game_id', gameId)
        .in('owner_id', Array.from(occupantOwnerIds)),
    )

    if (participantResult?.error) {
      throw participantResult.error
    }

    const rows = Array.isArray(participantResult?.data) ? participantResult.data : []
    rows.forEach((row) => {
      const ownerKey = normalizeId(row?.owner_id)
      if (!ownerKey) return
      const value = Number.isFinite(Number(row?.score))
        ? Number(row.score)
        : Number.isFinite(Number(row?.rating))
        ? Number(row.rating)
        : 1000
      participantScores.set(ownerKey, value)
    })
  }

  const roomStats = new Map()
  rooms.forEach((room) => {
    if (!room || !room.id) return
    const stats = buildRoomStats({
      slots: slotsByRoom.get(room.id) || [],
      participantScores,
    })
    roomStats.set(room.id, stats)
  })

  const dropInWindow = resolveDropInWindow(rules)
  const candidates = []

  viableEntries.forEach((entry) => {
    const roleName = normalizeRoleName(entry.role)
    if (!roleName) return
    const entryScore = deriveQueueEntryScore(entry)
    rooms.forEach((room) => {
      if (!room?.id) return
      const stats = roomStats.get(room.id)
      if (!stats) return
      const slot = stats.firstOpenSlotByRole.get(roleName)
      if (!slot) return
      const roleAverage = stats.roleAverages.get(roleName)
      const baseAverage = Number.isFinite(roleAverage) ? roleAverage : stats.overallAverage
      let gap = 0
      if (Number.isFinite(baseAverage)) {
        gap = Math.abs(baseAverage - entryScore)
      }
      if (stats.occupantCount > 0 && gap > dropInWindow) return
      candidates.push({
        entry,
        entryScore,
        room,
        slot,
        stats,
        scoreGap: gap,
      })
    })
  })

  attemptMeta.candidates = candidates.length

  if (!candidates.length) {
    attemptMeta.reason = 'no_open_candidates'
    return { ready: false, meta: attemptMeta }
  }

  candidates.sort(compareCandidates)

  for (const candidate of candidates) {
    const claim = await claimDropInSlot({ supabase, room: candidate.room, slot: candidate.slot, entry: candidate.entry })
    if (claim.missing) {
      attemptMeta.reason = 'missing_slot_table'
      return { ready: false, missing: true, meta: attemptMeta }
    }
    if (!claim.ok || !claim.slot) {
      continue
    }

    const member = cloneQueueMember(candidate.entry, {
      dropIn: true,
      dropInRoomId: candidate.room.id,
      dropInSlotId: claim.slot.id,
    })

    const roleSlots = []
    if (Number.isFinite(Number(claim.slot.slot_index))) {
      roleSlots.push(Number(claim.slot.slot_index))
    } else {
      roleSlots.push(0)
    }

    const assignments = [
      {
        role: normalizeRoleName(candidate.slot.role) || normalizeRoleName(candidate.entry.role),
        slots: 1,
        roleSlots,
        members: [member],
        groupKey:
          `drop_in:${
            normalizeId(member.id) || normalizeId(member.owner_id) || normalizeId(claim.slot.id) || normalizeId(candidate.room.id)
          }`,
        anchorScore: candidate.entryScore,
        joinedAt: member.joined_at || member.joinedAt || null,
      },
    ]

    attemptMeta.reason = 'matched'
    attemptMeta.matchedCandidate = {
      roomId: candidate.room.id,
      slotId: claim.slot.id,
      scoreGap: candidate.scoreGap,
      role: normalizeRoleName(candidate.slot.role) || normalizeRoleName(candidate.entry.role),
    }

    return {
      ready: true,
      assignments,
      totalSlots: 1,
      maxWindow: Math.round(candidate.scoreGap || 0),
      matchType: 'drop_in',
      matchCode: candidate.room.code || null,
      dropInTarget: {
        roomId: candidate.room.id,
        roomCode: candidate.room.code || null,
        roomMode: candidate.room.mode || null,
        slotId: claim.slot.id,
        slotIndex: claim.slot.slot_index ?? null,
        role: normalizeRoleName(candidate.slot.role) || normalizeRoleName(candidate.entry.role),
        scoreDifference: candidate.scoreGap,
        averageScore:
          candidate.stats.roleAverages.get(normalizeRoleName(candidate.slot.role)) ?? candidate.stats.overallAverage ?? null,
        occupantCount: candidate.stats.occupantCount,
        openSlotsBefore: candidate.stats.openSlotsByRole.get(normalizeRoleName(candidate.slot.role)) || 1,
        claimedAt: claim.now,
      },
      meta: attemptMeta,
    }
  }

  attemptMeta.reason = 'claims_failed'
  return { ready: false, meta: attemptMeta }
}
