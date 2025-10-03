import {
  loadActiveRoles,
  loadParticipantPool,
  loadQueueEntries,
  loadRoleStatusCounts,
} from '@/lib/rank/matchmakingService'
import { getQueueModes } from '@/lib/rank/matchModes'
import { withTable } from '@/lib/supabaseTables'
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors'

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

export async function findRealtimeDropInTarget({ supabase, gameId, mode, roles = [], queue = [], rules = {} } = {}) {
  if (!supabase || !gameId) return null
  if (!Array.isArray(queue) || queue.length === 0) return null

  const viableEntries = queue.filter((entry) => {
    if (!entry || entry.simulated) return false
    const roleName = normalizeRoleName(entry.role)
    if (!roleName) return false
    const score = deriveQueueEntryScore(entry)
    return Number.isFinite(score)
  })

  if (!viableEntries.length) return null

  const roomResult = await withTable(supabase, 'rank_rooms', (table) =>
    supabase
      .from(table)
      .select('id, code, mode, status, filled_count, updated_at')
      .eq('game_id', gameId),
  )

  if (roomResult?.error) {
    if (isMissingSupabaseTable(roomResult.error)) {
      return null
    }
    throw roomResult.error
  }

  const rooms = (roomResult?.data || []).filter((room) => isRealtimeRoomMatch(room, mode))
  if (!rooms.length) return null

  const roomIds = rooms.map((room) => room.id).filter(Boolean)
  if (!roomIds.length) return null

  const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
    supabase
      .from(table)
      .select('id, room_id, role, slot_index, occupant_owner_id, occupant_hero_id, joined_at')
      .in('room_id', roomIds),
  )

  if (slotResult?.error) {
    if (isMissingSupabaseTable(slotResult.error)) {
      return null
    }
    throw slotResult.error
  }

  const slotRows = Array.isArray(slotResult?.data) ? slotResult.data : []
  if (!slotRows.length) return null

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

  if (!candidates.length) return null

  candidates.sort(compareCandidates)

  for (const candidate of candidates) {
    const claim = await claimDropInSlot({ supabase, room: candidate.room, slot: candidate.slot, entry: candidate.entry })
    if (claim.missing) {
      return null
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
    }
  }

  return null
}
