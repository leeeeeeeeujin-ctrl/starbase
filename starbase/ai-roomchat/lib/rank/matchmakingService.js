// lib/rank/matchmakingService.js
// Utilities that bridge the generic matching helpers with Supabase storage.

import {
  matchCasualParticipants,
  matchRankParticipants,
  matchSoloRankParticipants,
} from './matching'
import {
  getDefaultPartySize,
  getMatcherKey,
  getQueueModes,
} from './matchModes'
import { withTable } from '../supabaseTables'
import {
  partitionQueueByHeartbeat,
  QUEUE_STALE_THRESHOLD_MS,
} from './queueHeartbeat'
import {
  buildOwnerParticipantIndex,
  guessOwnerParticipant,
  normalizeHeroIdValue,
  resolveParticipantHeroId as deriveParticipantHeroId,
} from './participantUtils'

const WAIT_THRESHOLD_SECONDS = 30

const MATCHER_BY_KEY = {
  rank: matchRankParticipants,
  rank_solo: matchSoloRankParticipants,
  casual: matchCasualParticipants,
}

function nowIso() {
  return new Date().toISOString()
}

function hasNavigator() {
  return typeof navigator !== 'undefined' && navigator !== null
}

function hasWindow() {
  return typeof window !== 'undefined' && window !== null
}

function ensureArray(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function deriveParticipantScore(row) {
  const score = Number(row?.score)
  if (Number.isFinite(score) && score > 0) {
    return score
  }
  const rating = Number(row?.rating)
  if (Number.isFinite(rating) && rating > 0) {
    return rating
  }
  return 1000
}

function resolveParticipantHeroId(row) {
  return deriveParticipantHeroId(row)
}

async function resolveQueueHeroId(supabaseClient, { gameId, ownerId, heroId, role }) {
  const explicitHeroId = normalizeHeroIdValue(heroId)
  if (!gameId || !ownerId) {
    return explicitHeroId
  }

  try {
    const roster = await loadOwnerParticipantRoster(supabaseClient, {
      gameId,
      ownerIds: [ownerId],
    })
    const guess = guessOwnerParticipant({
      ownerId,
      roster,
      rolePreference: role,
      fallbackHeroId: explicitHeroId,
    })
    return guess.heroId || explicitHeroId
  } catch (error) {
    console.warn('참가자 정보를 확인하지 못했습니다:', error)
  }

  return explicitHeroId
}

async function loadRoleResources(supabaseClient, gameId) {
  if (!gameId) {
    return { roles: [], slotLayout: [] }
  }

  const [roleResult, slotResult] = await Promise.all([
    withTable(supabaseClient, 'rank_game_roles', (table) =>
      supabaseClient
        .from(table)
        .select('name, slot_count, active')
        .eq('game_id', gameId),
    ),
    withTable(supabaseClient, 'rank_game_slots', (table) =>
      supabaseClient
        .from(table)
        .select('slot_index, role, active, hero_id, hero_owner_id')
        .eq('game_id', gameId),
    ),
  ])

  if (roleResult?.error) throw roleResult.error
  if (slotResult?.error) throw slotResult.error

  const roleRows = Array.isArray(roleResult?.data) ? roleResult.data : []
  const slotRows = Array.isArray(slotResult?.data) ? slotResult.data : []

  const resources = normaliseRolesAndSlots(roleRows, slotRows)
  if (resources.slotLayout.length > 0 || resources.roles.length > 0) {
    return resources
  }

  const gameResult = await withTable(supabaseClient, 'rank_games', (table) =>
    supabaseClient.from(table).select('roles').eq('id', gameId).maybeSingle(),
  )

  if (gameResult?.error) throw gameResult.error

  let gameRoles = []
  const rawGameRoles = gameResult?.data?.roles
  if (Array.isArray(rawGameRoles)) {
    gameRoles = rawGameRoles
  } else if (typeof rawGameRoles === 'string' && rawGameRoles.trim()) {
    try {
      const parsed = JSON.parse(rawGameRoles)
      if (Array.isArray(parsed)) {
        gameRoles = parsed
      }
    } catch (error) {
      console.warn('rank_games.roles 파싱 실패:', error)
      gameRoles = []
    }
  }

  return normaliseRolesAndSlots([], [], gameRoles)
}

export async function loadActiveRoles(supabaseClient, gameId) {
  const { roles } = await loadRoleResources(supabaseClient, gameId)
  return roles
}

function normalizeRoleName(value) {
  if (!value) return ''
  if (typeof value !== 'string') return ''
  return value.trim()
}

function coerceSlotIndex(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.trunc(numeric)
}

function deriveGameRoleSlots(rawSlots = []) {
  if (!Array.isArray(rawSlots)) return []

  const layout = []

  rawSlots.forEach((value, index) => {
    if (value == null) return

    let name = ''
    if (typeof value === 'string') {
      name = normalizeRoleName(value)
    } else if (typeof value === 'object') {
      name = normalizeRoleName(value.name ?? value.role ?? value.label ?? '')
    }

    if (!name) return

    layout.push({
      slotIndex: index,
      role: name,
      heroId: null,
      heroOwnerId: null,
    })
  })

  return layout
}

function coerceSlotCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.trunc(numeric)
}

function attachSlotCountPayload(name, count) {
  const slotCount = coerceSlotCount(count)
  return { name, slot_count: slotCount, slotCount }
}

function buildRolesFromLayout(layout = []) {
  const roleOrder = []
  const roleCounts = new Map()

  layout.forEach((slot) => {
    if (!slot) return
    const name = normalizeRoleName(slot.role)
    if (!name) return
    if (!roleCounts.has(name)) {
      roleCounts.set(name, 1)
      roleOrder.push(name)
    } else {
      roleCounts.set(name, roleCounts.get(name) + 1)
    }
  })

  return roleOrder.map((name) => attachSlotCountPayload(name, roleCounts.get(name) || 0))
}

function buildLayoutFromSlotRows(slotRows = []) {
  const layout = []

  slotRows.forEach((row) => {
    if (!row) return
    if (row.active === false) return
    const roleName = normalizeRoleName(row.role)
    if (!roleName) return
    const slotIndex = coerceSlotIndex(row.slot_index ?? row.slotIndex ?? row.slot_no ?? row.slotNo)
    if (slotIndex == null) return

    layout.push({
      slotIndex,
      role: roleName,
      heroId: row.hero_id || row.heroId || null,
      heroOwnerId: row.hero_owner_id || row.heroOwnerId || null,
    })
  })

  layout.sort((a, b) => a.slotIndex - b.slotIndex)
  return layout
}

function buildRolesFromRoleRows(roleRows = []) {
  const normalizedRoles = []
  const roleMap = new Map()

  roleRows
    .filter((row) => row && row.active !== false)
    .forEach((row) => {
      const name = normalizeRoleName(row.name)
      if (!name) return
      const requestedCount = Number(row.slot_count ?? row.slotCount ?? row.capacity)
      const normalizedCount =
        Number.isFinite(requestedCount) && requestedCount > 0 ? Math.trunc(requestedCount) : 0
      if (normalizedCount <= 0) return

      if (!roleMap.has(name)) {
        const entry = attachSlotCountPayload(name, normalizedCount)
        roleMap.set(name, entry)
        normalizedRoles.push(entry)
      } else {
        const entry = roleMap.get(name)
        const total = coerceSlotCount(entry.slot_count + normalizedCount)
        entry.slot_count = total
        entry.slotCount = total
      }
    })

  return normalizedRoles
}

function buildLayoutFromRoleCounts(roleEntries = []) {
  const layout = []
  let cursor = 0

  roleEntries.forEach((entry) => {
    if (!entry) return
    const name = normalizeRoleName(entry.name)
    if (!name) return
    const count = coerceSlotCount(entry.slot_count ?? entry.slotCount ?? 0)
    if (count <= 0) return

    for (let index = 0; index < count; index += 1) {
      layout.push({ slotIndex: cursor, role: name, heroId: null, heroOwnerId: null })
      cursor += 1
    }
  })

  return layout
}

function normaliseRolesAndSlots(roleRows = [], slotRows = [], gameRoleSlots = []) {
  const rolesFromRows = buildRolesFromRoleRows(roleRows)

  const slotLayout = buildLayoutFromSlotRows(slotRows)
  if (slotLayout.length > 0) {
    if (rolesFromRows.length > 0) {
      const roleNames = new Set(
        rolesFromRows
          .map((role) => normalizeRoleName(role.name))
          .filter((name) => typeof name === 'string' && name.length > 0),
      )
      const layoutNames = new Set(
        slotLayout
          .map((slot) => normalizeRoleName(slot.role))
          .filter((name) => typeof name === 'string' && name.length > 0),
      )

      const layoutIncludesAllDeclaredRoles =
        roleNames.size === 0 || Array.from(roleNames).every((name) => layoutNames.has(name))
      const layoutOnlyUsesDeclaredRoles =
        layoutNames.size === 0 || Array.from(layoutNames).every((name) => roleNames.has(name))

      const shouldFallbackToRoles =
        roleNames.size > 0 &&
        (layoutNames.size === 0 ||
          (layoutNames.size < roleNames.size && (!layoutIncludesAllDeclaredRoles || !layoutOnlyUsesDeclaredRoles)))

      if (!shouldFallbackToRoles) {
        return {
          roles: buildRolesFromLayout(slotLayout),
          slotLayout,
        }
      }
    } else {
      return {
        roles: buildRolesFromLayout(slotLayout),
        slotLayout,
      }
    }
  }

  if (rolesFromRows.length > 0) {
    return {
      roles: rolesFromRows,
      slotLayout: buildLayoutFromRoleCounts(rolesFromRows),
    }
  }

  const inlineLayout = deriveGameRoleSlots(gameRoleSlots)
  if (inlineLayout.length > 0) {
    return {
      roles: buildRolesFromLayout(inlineLayout),
      slotLayout: inlineLayout,
    }
  }

  return { roles: [], slotLayout: [] }
}

export async function loadRoleLayout(supabaseClient, gameId) {
  const result = await loadRoleResources(supabaseClient, gameId)
  if (!Array.isArray(result.slotLayout)) {
    return { roles: Array.isArray(result.roles) ? result.roles : [], slotLayout: [] }
  }

  const sanitizedLayout = result.slotLayout
    .map((slot, index) => {
      if (!slot) return null
      const roleName = normalizeRoleName(slot?.role)
      if (!roleName) return null
      const rawIndex = Number(slot?.slotIndex ?? slot?.slot_index ?? index)
      if (!Number.isFinite(rawIndex) || rawIndex < 0) return null
      return {
        slotIndex: rawIndex,
        role: roleName,
        heroId: slot?.heroId ?? slot?.hero_id ?? null,
        heroOwnerId: slot?.heroOwnerId ?? slot?.hero_owner_id ?? null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.slotIndex - b.slotIndex)

  return {
    roles: Array.isArray(result.roles) ? result.roles : [],
    slotLayout: sanitizedLayout,
  }
}

export async function loadParticipantPool(supabaseClient, gameId) {
  if (!gameId) return []

  const result = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select(
        'id, owner_id, hero_id, hero_ids, role, score, rating, status, updated_at, created_at',
      )
      .eq('game_id', gameId),
  )

  if (result?.error) throw result.error

  const rows = Array.isArray(result?.data) ? result.data : []
  const alive = rows.filter((row) => (row?.status || 'alive') !== 'dead')
  const eligible = alive.filter((row) => {
    if (!row) return false
    const role = row.role || row.role_name || row.roleName
    if (!role) return false
    const heroId = resolveParticipantHeroId(row)
    if (!heroId) return false
    const status = normalizeStatus(row?.status)
    if (DEFEATED_STATUS_SET.has(status)) return false
    if (status === 'victory') return false
    if (status === 'retired') return false
    if (LOCKED_STATUS_SET.has(status)) return false
    return true
  })

  return eligible.map((row) => ({
    // Use null id so queue updates ignore simulated entries.
    id: null,
    owner_id: row.owner_id || row.ownerId || null,
    ownerId: row.owner_id || row.ownerId || null,
    hero_id: resolveParticipantHeroId(row),
    hero_ids: Array.isArray(row.hero_ids) ? row.hero_ids.filter(Boolean) : [],
    role: row.role || '',
    score: deriveParticipantScore(row),
    rating: deriveParticipantScore(row),
    status: 'waiting',
    joined_at: row.updated_at || row.created_at || null,
    simulated: true,
    standin: true,
    match_source: 'participant_pool',
  }))
}

function normalizeOwnerIds(values = []) {
  return values
    .map((value) => {
      if (value == null) return null
      if (typeof value === 'string') return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      if (typeof value === 'object' && value !== null && typeof value.id !== 'undefined') {
        return String(value.id)
      }
      return null
    })
    .filter((value) => typeof value === 'string' && value.length > 0)
}

export async function loadOwnerParticipantRoster(
  supabaseClient,
  { gameId, ownerIds = [] } = {},
) {
  if (!gameId) {
    return new Map()
  }

  const result = await withTable(supabaseClient, 'rank_participants', (table) => {
    let query = supabaseClient
      .from(table)
      .select(
        'owner_id, hero_id, hero_ids, role, score, rating, status, slot_index, slot_no, updated_at, created_at',
      )
      .eq('game_id', gameId)

    const ids = normalizeOwnerIds(ownerIds)
    if (ids.length > 0) {
      if (ids.length === 1) {
        query = query.eq('owner_id', ids[0])
      } else {
        query = query.in('owner_id', ids)
      }
    }

    return query
  })

  if (result?.error) {
    throw result.error
  }

  const rows = Array.isArray(result?.data) ? result.data : []
  return buildOwnerParticipantIndex(rows)
}

function buildRoleCapacityMap({ roles = [], slotLayout = [] } = {}) {
  const capacity = new Map()

  if (Array.isArray(slotLayout) && slotLayout.length > 0) {
    slotLayout.forEach((slot) => {
      if (!slot) return
      const roleName = normalizeRoleName(slot.role)
      if (!roleName) return
      capacity.set(roleName, (capacity.get(roleName) || 0) + 1)
    })
    return capacity
  }

  if (Array.isArray(roles)) {
    roles.forEach((role) => {
      if (!role) return
      const roleName = normalizeRoleName(role.name ?? role.role)
      if (!roleName) return
      const rawCount = role.slot_count ?? role.slotCount ?? role.capacity
      const slotCount = coerceSlotCount(rawCount, 0)
      if (slotCount <= 0) return
      capacity.set(roleName, slotCount)
    })
  }

  return capacity
}

function lookupParticipantRole(roster, ownerId, heroId) {
  if (!ownerId) return ''
  if (!(roster instanceof Map)) return ''
  const entries = roster.get(String(ownerId)) || []
  if (!Array.isArray(entries) || entries.length === 0) return ''

  const normalizedHeroId = normalizeHeroIdValue(heroId)
  if (!normalizedHeroId) return ''

  for (const entry of entries) {
    if (!entry) continue
    if (entry.heroId && entry.heroId === normalizedHeroId) {
      return typeof entry.role === 'string' ? entry.role : ''
    }
    if (Array.isArray(entry.heroIds) && entry.heroIds.includes(normalizedHeroId)) {
      return typeof entry.role === 'string' ? entry.role : ''
    }
  }

  return ''
}

function cloneAssignment(assignment) {
  if (!assignment) return null
  const members = Array.isArray(assignment.members)
    ? assignment.members.map((member) => (member && typeof member === 'object' ? { ...member } : member))
    : []
  const roleSlots = Array.isArray(assignment.roleSlots || assignment.role_slots)
    ? (assignment.roleSlots || assignment.role_slots).map((slot) =>
        slot && typeof slot === 'object' ? { ...slot } : slot,
      )
    : []

  return {
    ...assignment,
    members,
    roleSlots,
  }
}

function cloneRoom(room) {
  if (!room) return null
  const slots = Array.isArray(room.slots)
    ? room.slots.map((slot) => (slot && typeof slot === 'object' ? { ...slot } : slot))
    : []
  return {
    ...room,
    slots,
  }
}

export async function postCheckMatchAssignments(
  supabaseClient,
  { gameId, assignments = [], rooms = [], roles = [], slotLayout = [] } = {},
) {
  const clonedAssignments = Array.isArray(assignments)
    ? assignments.map((assignment) => cloneAssignment(assignment)).filter(Boolean)
    : []
  const clonedRooms = Array.isArray(rooms)
    ? rooms.map((room) => cloneRoom(room)).filter(Boolean)
    : []

  const memberEntries = []
  const ownerIds = new Set()

  clonedAssignments.forEach((assignment, assignmentIndex) => {
    const roleName = normalizeRoleName(assignment?.role)
    const members = Array.isArray(assignment?.members) ? assignment.members : []
    members.forEach((member, memberIndex) => {
      if (!member || typeof member !== 'object') return
      const ownerIdRaw = member.owner_id ?? member.ownerId
      const ownerId = ownerIdRaw != null ? String(ownerIdRaw) : ''
      const heroId = normalizeHeroIdValue(member.hero_id ?? member.heroId ?? null)
      if (ownerId) {
        ownerIds.add(ownerId)
      }
      memberEntries.push({
        assignmentIndex,
        memberIndex,
        roleName,
        ownerId,
        heroId,
        member,
        remove: false,
        expectedRole: '',
      })
    })
  })

  if (!memberEntries.length) {
    return { assignments: clonedAssignments, rooms: clonedRooms, removedMembers: [] }
  }

  let roster = new Map()
  if (ownerIds.size > 0) {
    try {
      roster = await loadOwnerParticipantRoster(supabaseClient, {
        gameId,
        ownerIds: Array.from(ownerIds),
      })
    } catch (error) {
      console.warn('참가자 정보를 확인하지 못해 후검사를 건너뜁니다:', error)
    }
  }

  const heroBuckets = new Map()
  memberEntries.forEach((entry) => {
    if (!entry.heroId) return
    const list = heroBuckets.get(entry.heroId) || []
    list.push(entry)
    heroBuckets.set(entry.heroId, list)
  })

  heroBuckets.forEach((entries, heroId) => {
    entries.forEach((entry) => {
      entry.expectedRole = lookupParticipantRole(roster, entry.ownerId, heroId)
    })

    const mismatched = entries.filter(
      (entry) => entry.expectedRole && entry.roleName && entry.roleName !== entry.expectedRole,
    )
    mismatched.forEach((entry) => {
      entry.remove = true
      entry.reason = 'role_mismatch'
      if (entry.member) {
        entry.member.__remove = true
      }
    })

    const eligible = entries.filter((entry) => !entry.remove)
    const exactMatches = eligible.filter(
      (entry) => entry.expectedRole && entry.roleName === entry.expectedRole,
    )

    if (exactMatches.length > 1) {
      exactMatches.slice(1).forEach((entry) => {
        entry.remove = true
        entry.reason = 'duplicate_role'
        if (entry.member) {
          entry.member.__remove = true
        }
      })
    }

    const survivors = entries.filter((entry) => !entry.remove)
    if (survivors.length > 1) {
      const ambiguous = survivors.filter((entry) => !entry.expectedRole)
      if (ambiguous.length > 1) {
        ambiguous
          .slice(1)
          .forEach((entry) => {
            entry.remove = true
            entry.reason = 'duplicate_ambiguous'
            if (entry.member) {
              entry.member.__remove = true
            }
          })
      }
    }
  })

  const capacity = buildRoleCapacityMap({ roles, slotLayout })
  capacity.forEach((limit, roleName) => {
    if (!Number.isFinite(limit) || limit <= 0) return
    const bucket = memberEntries.filter((entry) => entry.roleName === roleName && !entry.remove)
    if (bucket.length <= limit) return
    bucket
      .slice(limit)
      .forEach((entry) => {
        entry.remove = true
        entry.reason = 'exceeds_capacity'
        if (entry.member) {
          entry.member.__remove = true
        }
      })
  })

  const removedMembers = memberEntries
    .filter((entry) => entry.remove)
    .map((entry) => ({
      heroId: entry.heroId || null,
      ownerId: entry.ownerId || null,
      role: entry.roleName || '',
      reason: entry.reason || 'removed',
    }))

  const assignmentMeta = new Map()
  memberEntries.forEach((entry) => {
    const assignmentIndex = Number(entry.assignmentIndex)
    if (!Number.isFinite(assignmentIndex)) return
    if (!assignmentMeta.has(assignmentIndex)) {
      assignmentMeta.set(assignmentIndex, { removalIndices: new Set() })
    }
    if (entry.remove && Number.isFinite(Number(entry.memberIndex))) {
      assignmentMeta.get(assignmentIndex).removalIndices.add(Number(entry.memberIndex))
    }
  })

  const survivorHeroIds = new Set(
    memberEntries.filter((entry) => !entry.remove && entry.heroId).map((entry) => entry.heroId),
  )
  const survivorKeys = new Set(
    memberEntries
      .filter((entry) => !entry.remove && entry.heroId && entry.roleName)
      .map((entry) => `${entry.heroId}::${entry.roleName}`),
  )

  const sanitizeSlotMembers = (slot, { removalIndices }) => {
    const roleName = normalizeRoleName(slot?.role)
    const rawMembers = []
    if (slot?.member) {
      rawMembers.push(slot.member)
    }
    if (Array.isArray(slot?.members)) {
      rawMembers.push(...slot.members)
    }

    const sanitized = []
    rawMembers.forEach((member) => {
      if (!member || typeof member !== 'object') return
      const clone = { ...member }
      delete clone.__remove
      const memberIndex = Number(clone.memberIndex ?? clone.member_index)
      if (Number.isFinite(memberIndex) && removalIndices.has(memberIndex)) {
        return
      }
      const heroId = normalizeHeroIdValue(clone.hero_id ?? clone.heroId ?? null)
      if (heroId) {
        if (survivorHeroIds.size > 0 && !survivorHeroIds.has(heroId)) {
          return
        }
        if (roleName && survivorKeys.size > 0 && !survivorKeys.has(`${heroId}::${roleName}`)) {
          return
        }
      }
      sanitized.push(clone)
    })

    return sanitized
  }

  clonedAssignments.forEach((assignment, assignmentIndex) => {
    const removalIndices = assignmentMeta.get(assignmentIndex)?.removalIndices || new Set()

    if (!Array.isArray(assignment.roleSlots) || assignment.roleSlots.length === 0) {
      const sanitizedMembers = Array.isArray(assignment.members)
        ? assignment.members
            .map((member, memberIndex) => {
              if (!member || typeof member !== 'object') return null
              const clone = { ...member }
              delete clone.__remove
              const index = Number(clone.memberIndex ?? clone.member_index ?? memberIndex)
              if (Number.isFinite(index) && removalIndices.has(index)) {
                return null
              }
              const heroId = normalizeHeroIdValue(clone.hero_id ?? clone.heroId ?? null)
              const roleName = normalizeRoleName(assignment.role)
              if (heroId) {
                if (survivorHeroIds.size > 0 && !survivorHeroIds.has(heroId)) {
                  return null
                }
                if (roleName && survivorKeys.size > 0 && !survivorKeys.has(`${heroId}::${roleName}`)) {
                  return null
                }
              }
              return clone
            })
            .filter(Boolean)
        : []

      assignment.members = sanitizedMembers
      assignment.roleSlots = []

      const totalSlots = Number.isFinite(Number(assignment.slots))
        ? Number(assignment.slots)
        : sanitizedMembers.length
      const filledSlots = Math.min(sanitizedMembers.length, totalSlots)
      assignment.filledSlots = filledSlots
      assignment.missingSlots = Math.max(0, totalSlots - filledSlots)
      assignment.ready = totalSlots > 0 && assignment.missingSlots === 0
      return
    }

    const sanitizedSlots = assignment.roleSlots.map((slot) => {
      if (!slot || typeof slot !== 'object') return slot
      const members = sanitizeSlotMembers(slot, { removalIndices })
      const primaryMember = members.length > 0 ? members[0] : null
      const sanitizedSlot = {
        ...slot,
        members,
        member: primaryMember,
        occupied: members.length > 0,
      }
      if (primaryMember) {
        const heroId = primaryMember.hero_id ?? primaryMember.heroId ?? null
        const ownerId = primaryMember.owner_id ?? primaryMember.ownerId ?? null
        if (heroId != null) {
          sanitizedSlot.hero_id = heroId
          sanitizedSlot.heroId = heroId
        }
        if (ownerId != null) {
          sanitizedSlot.hero_owner_id = ownerId
          sanitizedSlot.heroOwnerId = ownerId
        }
      } else {
        sanitizedSlot.hero_id = null
        sanitizedSlot.heroId = null
        sanitizedSlot.hero_owner_id = null
        sanitizedSlot.heroOwnerId = null
      }
      return sanitizedSlot
    })

    assignment.roleSlots = sanitizedSlots

    const rebuiltMembers = []
    sanitizedSlots.forEach((slot) => {
      if (!slot || typeof slot !== 'object') return
      if (Array.isArray(slot.members) && slot.members.length > 0) {
        slot.members.forEach((member) => {
          if (member) {
            rebuiltMembers.push(member)
          }
        })
      } else if (slot.member) {
        rebuiltMembers.push(slot.member)
      }
    })

    assignment.members = rebuiltMembers

    const totalSlots = Number.isFinite(Number(assignment.slots))
      ? Number(assignment.slots)
      : sanitizedSlots.length
    const filledSlots = sanitizedSlots.filter((slot) => slot && slot.occupied).length
    assignment.filledSlots = filledSlots
    assignment.missingSlots = Math.max(0, totalSlots - filledSlots)
    assignment.ready = totalSlots > 0 && assignment.missingSlots === 0
  })

  clonedRooms.forEach((room) => {
    if (!Array.isArray(room.slots)) return
    room.slots = room.slots.map((slot) => {
      if (!slot || typeof slot !== 'object') return slot
      const roleName = normalizeRoleName(slot.role)
      const heroId = normalizeHeroIdValue(slot.hero_id ?? slot.heroId ?? null)
      const compositeKey = heroId && roleName ? `${heroId}::${roleName}` : null
      const heroSurvives =
        (!heroId || survivorHeroIds.size === 0 || survivorHeroIds.has(heroId)) &&
        (!compositeKey || survivorKeys.size === 0 || survivorKeys.has(compositeKey))

      if (!heroSurvives) {
        return {
          ...slot,
          hero_id: null,
          heroId: null,
          hero_owner_id: null,
          heroOwnerId: null,
          member: null,
          members: Array.isArray(slot.members) ? [] : slot.members,
          occupied: false,
        }
      }

      const slotMember = slot.member
      const slotMembers = Array.isArray(slot.members) ? slot.members : []
      const hasHero =
        heroId != null ||
        normalizeHeroIdValue(slotMember?.hero_id ?? slotMember?.heroId ?? null) != null ||
        slotMembers.some((member) => {
          if (!member || typeof member !== 'object') return false
          const memberHero = normalizeHeroIdValue(member.hero_id ?? member.heroId ?? null)
          return memberHero != null
        })
      const occupied =
        Boolean(slotMember) ||
        Boolean(slot.occupied) ||
        slotMembers.some(Boolean) ||
        hasHero
      return {
        ...slot,
        occupied,
      }
    })

    const totalSlots = Number.isFinite(Number(room.totalSlots))
      ? Number(room.totalSlots)
      : room.slots.length
    const filledSlots = room.slots.filter((slot) => slot && (slot.occupied || slot.member)).length
    room.filledSlots = filledSlots
    room.missingSlots = Math.max(0, totalSlots - filledSlots)
    room.ready = totalSlots > 0 && room.missingSlots === 0
  })

  return { assignments: clonedAssignments, rooms: clonedRooms, removedMembers }
}

function normalizeStatus(value) {
  if (!value) return 'alive'
  if (typeof value !== 'string') return 'alive'
  return value.trim().toLowerCase() || 'alive'
}

const DEFEATED_STATUS_SET = new Set([
  'defeated',
  'lost',
  'out',
  'retired',
  'eliminated',
  'dead',
])

const LOCKED_STATUS_SET = new Set([
  'engaged',
  'engaged_offense',
  'engaged_defense',
  'locked',
  'pending_battle',
])

export async function loadRoleStatusCounts(supabaseClient, gameId) {
  if (!gameId) return new Map()

  const result = await withTable(supabaseClient, 'rank_participants', (table) =>
    supabaseClient
      .from(table)
      .select('role, status')
      .eq('game_id', gameId),
  )

  if (result?.error) throw result.error

  const rows = Array.isArray(result?.data) ? result.data : []
  const map = new Map()

  rows.forEach((row) => {
    const roleName = (row?.role || '').trim()
    if (!roleName) return
    const status = normalizeStatus(row?.status)
    const bucket = map.get(roleName) || { total: 0, active: 0, defeated: 0 }
    bucket.total += 1
    if (DEFEATED_STATUS_SET.has(status)) {
      bucket.defeated += 1
    } else {
      bucket.active += 1
    }
    map.set(roleName, bucket)
  })

  return map
}

async function loadRealtimeToggle(supabaseClient, gameId) {
  if (!gameId) return false

  const { data, error } = await withTable(supabaseClient, 'rank_games', (table) =>
    supabaseClient.from(table).select('realtime_match').eq('id', gameId).maybeSingle(),
  )

  if (error) throw error

  return Boolean(data?.realtime_match)
}

export async function loadMatchSampleSource(
  supabaseClient,
  { gameId, mode, realtimeEnabled: realtimeOverride } = {},
) {
  if (!gameId) {
    return {
      realtimeEnabled: false,
      sampleType: 'participant_pool',
      entries: [],
      queue: [],
      participantPool: [],
      generatedAt: new Date().toISOString(),
    }
  }

  let realtimeEnabled =
    typeof realtimeOverride === 'boolean'
      ? realtimeOverride
      : await loadRealtimeToggle(supabaseClient, gameId)

  const [queueEntries, participantPool] = await Promise.all([
    loadQueueEntries(supabaseClient, { gameId, mode }),
    loadParticipantPool(supabaseClient, gameId),
  ])

  const queueAnnotated = Array.isArray(queueEntries)
    ? queueEntries.map((entry) => ({
        ...entry,
        match_source: entry?.match_source || 'realtime_queue',
        standin: false,
        simulated: Boolean(entry?.simulated) && entry.simulated === true,
      }))
    : []

  const participantAnnotated = Array.isArray(participantPool)
    ? participantPool.map((entry) => ({
        ...entry,
        match_source: entry?.match_source || 'participant_pool',
        standin: true,
        simulated: true,
      }))
    : []

  const waitInfo = computeQueueWaitInfo(queueAnnotated)

  let sampleEntries = realtimeEnabled ? queueAnnotated.slice() : participantAnnotated.slice()
  let sampleType = realtimeEnabled ? 'realtime_queue' : 'participant_pool'

  if (realtimeEnabled) {
    if (queueAnnotated.length === 0) {
      sampleEntries = participantAnnotated.slice()
      if (sampleEntries.length > 0) {
        sampleType = 'realtime_queue_fallback_pool'
      }
    } else if (
      typeof waitInfo.waitSeconds === 'number' &&
      waitInfo.waitSeconds < WAIT_THRESHOLD_SECONDS &&
      waitInfo.waitSeconds >= 0
    ) {
      sampleEntries = queueAnnotated.slice()
      sampleType = 'realtime_queue_waiting'
    } else {
      sampleEntries = queueAnnotated.slice()
      sampleType = 'realtime_queue'
    }
  } else if (!Array.isArray(sampleEntries) || sampleEntries.length === 0) {
    sampleEntries = queueAnnotated.slice()
    if (Array.isArray(sampleEntries) && sampleEntries.length > 0) {
      sampleType = 'participant_pool_fallback_queue'
    }
  }

  return {
    realtimeEnabled: Boolean(realtimeEnabled),
    sampleType,
    entries: Array.isArray(sampleEntries) ? sampleEntries : [],
    queue: queueAnnotated,
    participantPool: participantAnnotated,
    generatedAt: new Date().toISOString(),
    queueWaitSeconds:
      typeof waitInfo.waitSeconds === 'number' && Number.isFinite(waitInfo.waitSeconds)
        ? waitInfo.waitSeconds
        : null,
    queueOldestJoinedAt: waitInfo.oldestJoinedAt,
    queueWaitThresholdSeconds: WAIT_THRESHOLD_SECONDS,
    standinCount: 0,
  }
}

function computeQueueWaitInfo(queueEntries = []) {
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

export async function loadQueueEntries(supabaseClient, { gameId, mode }) {
  if (!gameId) return []
  const queueModes = getQueueModes(mode)
  const filters = queueModes.length ? queueModes : [mode].filter(Boolean)
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient
      .from(table)
      .select(
        'id, game_id, mode, owner_id, hero_id, role, score, joined_at, updated_at, status, party_key',
      )
      .eq('game_id', gameId)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true })
    if (filters.length > 1) {
      query = query.in('mode', filters)
    } else if (filters.length === 1) {
      query = query.eq('mode', filters[0])
    }
    return query
  })
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows
    .map((row) => ({
      ...row,
      updatedAt: row?.updated_at || row?.updatedAt || null,
      match_source: row?.match_source || 'realtime_queue',
      simulated: Boolean(row?.simulated) && row.simulated === true,
      standin: false,
    }))
}

export function filterStaleQueueEntries(
  queueEntries = [],
  { staleThresholdMs = QUEUE_STALE_THRESHOLD_MS, nowMs = Date.now() } = {},
) {
  return partitionQueueByHeartbeat(queueEntries, {
    staleThresholdMs,
    nowMs,
  })
}

export async function heartbeatQueueEntry(supabaseClient, { gameId, mode, ownerId }) {
  if (!gameId || !ownerId) {
    return { ok: false, error: '대기열 정보를 확인할 수 없습니다.' }
  }

  const now = nowIso()
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient
      .from(table)
      .update({ updated_at: now })
      .eq('game_id', gameId)
      .eq('owner_id', ownerId)
      .eq('status', 'waiting')
    if (mode) {
      query = query.eq('mode', mode)
    }
    return query
  })

  if (result?.error) {
    console.warn('대기열 하트비트 갱신 실패:', result.error)
    return { ok: false, error: result.error.message || '대기열 상태를 갱신하지 못했습니다.' }
  }

  return { ok: true, updatedAt: now }
}

export async function removeQueueEntry(supabaseClient, { gameId, mode, ownerId }) {
  if (!gameId || !ownerId) return { ok: true }
  const result = await withTable(supabaseClient, 'rank_match_queue', (table) => {
    let query = supabaseClient.from(table).delete().eq('game_id', gameId).eq('owner_id', ownerId)
    if (mode) {
      query = query.eq('mode', mode)
    }
    return query
  })
  if (result?.error) {
    console.warn('큐 제거 실패:', result.error)
    return { ok: false, error: result.error.message || '대기열에서 제거하지 못했습니다.' }
  }
  return { ok: true }
}

export function emitQueueLeaveBeacon({ gameId, mode, ownerId, heroId = null }) {
  if (!gameId || !ownerId || !hasNavigator()) {
    return false
  }

  const payload = {
    gameId,
    ownerId,
    mode: mode || null,
  }

  if (heroId != null) {
    payload.heroId = heroId
  }

  const body = JSON.stringify(payload)
  const endpoint = '/api/rank/match/leave'

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      return navigator.sendBeacon(endpoint, blob)
    }

    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: hasWindow(),
      }).catch(() => {})
      return true
    }
  } catch (error) {
    console.warn('대기열 이탈 신호 전송 실패:', error)
  }

  return false
}

export async function enqueueParticipant(
  supabaseClient,
  { gameId, mode, ownerId, heroId, role, score = 1000, partyKey = null },
) {
  if (!gameId || !mode || !ownerId || !role) {
    return { ok: false, error: '대기열에 필요한 정보가 부족합니다.' }
  }

  const resolvedHeroId = await resolveQueueHeroId(supabaseClient, {
    gameId,
    ownerId,
    heroId,
    role,
  })

  const duplicateCheck = await withTable(
    supabaseClient,
    'rank_match_queue',
    (table) =>
      supabaseClient
        .from(table)
        .select('id, game_id, mode, status, hero_id')
        .eq('owner_id', ownerId)
        .in('status', ['waiting', 'matched']),
  )

  if (duplicateCheck?.error) {
    console.warn('대기열 중복 상태를 확인하지 못했습니다:', duplicateCheck.error)
    return {
      ok: false,
      error: '대기열 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
    }
  }

  const duplicateEntries = Array.isArray(duplicateCheck?.data)
    ? duplicateCheck.data.filter((entry) => {
        if (!entry) return false
        const entryGameId = entry.game_id ?? entry.gameId
        const entryMode = entry.mode
        const entryStatus = entry.status

        const sameGame = String(entryGameId ?? '') === String(gameId ?? '')
        const sameMode = String(entryMode ?? '') === String(mode ?? '')

        if (sameGame && sameMode && entryStatus === 'waiting') {
          return false
        }

        return true
      })
    : []

  if (duplicateEntries.length > 0) {
    return {
      ok: false,
      error: '이미 다른 대기열에 참여 중입니다. 기존 대기열을 먼저 취소해주세요.',
    }
  }

  const payload = {
    game_id: gameId,
    mode,
    owner_id: ownerId,
    hero_id: resolvedHeroId ?? null,
    role,
    score,
    party_key: partyKey,
    status: 'waiting',
    joined_at: nowIso(),
    updated_at: nowIso(),
  }

  const insert = await withTable(supabaseClient, 'rank_match_queue', async (table) => {
    // Supabase upsert requires unique constraint, so attempt delete + insert.
    await supabaseClient
      .from(table)
      .delete()
      .eq('game_id', gameId)
      .eq('mode', mode)
      .eq('owner_id', ownerId)
      .in('status', ['waiting', 'matched'])

    return supabaseClient.from(table).insert(payload, { defaultToNull: false })
  })

  if (insert?.error) {
    console.error('대기열 등록 실패:', insert.error)
    return { ok: false, error: insert.error.message || '대기열에 등록하지 못했습니다.' }
  }

  return { ok: true, heroId: resolvedHeroId ?? null }
}

export function runMatching({ mode, roles, queue }) {
  const matcherKey = getMatcherKey(mode)
  const matcher = MATCHER_BY_KEY[matcherKey] || MATCHER_BY_KEY[mode]
  if (!matcher) {
    return { ready: false, assignments: [], totalSlots: 0, error: { type: 'unsupported_mode' } }
  }
  return matcher({ roles, queue })
}

export function extractViewerAssignment({ assignments = [], viewerId, heroId }) {
  const normalizedViewerId = viewerId ? String(viewerId) : ''
  const normalizedHeroId = heroId ? String(heroId) : ''
  for (const assignment of assignments) {
    if (!Array.isArray(assignment.members)) continue
    const matched = assignment.members.some((member) => {
      if (!member) return false
      const ownerId = member.owner_id ?? member.ownerId
      if (normalizedViewerId && ownerId && String(ownerId) === normalizedViewerId) {
        return true
      }
      if (normalizedHeroId) {
        const memberHeroId = member.hero_id ?? member.heroId
        if (memberHeroId && String(memberHeroId) === normalizedHeroId) {
          return true
        }
      }
      return false
    })
    if (matched) {
      return assignment
    }
  }
  return null
}

export async function markAssignmentsMatched(
  supabaseClient,
  { assignments = [], gameId, mode, matchCode },
) {
  const ids = new Set()
  const ownerIds = new Set()
  assignments.forEach((assignment) => {
    ensureArray(assignment.members).forEach((member) => {
      if (member?.id) {
        ids.add(member.id)
      }
      const ownerId = member?.owner_id || member?.ownerId
      if (ownerId) {
        ownerIds.add(ownerId)
      }
    })
  })
  if (ids.size > 0) {
    const payload = {
      status: 'matched',
      updated_at: nowIso(),
    }
    if (matchCode) payload.match_code = matchCode

    const result = await withTable(supabaseClient, 'rank_match_queue', (table) =>
      supabaseClient
        .from(table)
        .update(payload)
        .in('id', Array.from(ids)),
    )
    if (result?.error) {
      console.warn('매칭 상태 갱신 실패:', result.error)
    }
  }

  if (ownerIds.size > 0) {
    await lockParticipantsForAssignments(supabaseClient, { gameId, ownerIds: Array.from(ownerIds) })
  }
}

async function lockParticipantsForAssignments(supabaseClient, { gameId, ownerIds }) {
  if (!gameId || !Array.isArray(ownerIds) || ownerIds.length === 0) return

  const now = nowIso()
  const filterOwners = Array.from(new Set(ownerIds.filter(Boolean)))
  if (!filterOwners.length) return

  const result = await withTable(supabaseClient, 'rank_participants', (table) => {
    let query = supabaseClient
      .from(table)
      .update({ status: 'engaged', updated_at: now })
      .eq('game_id', gameId)
      .in('owner_id', filterOwners)

    query = query.not('status', 'in', '("victory","defeated","retired","eliminated")')

    return query
  })

  if (result?.error) {
    console.warn('참가자 잠금 실패:', result.error)
  }
}

export async function loadHeroesByIds(supabaseClient, heroIds) {
  const unique = Array.from(new Set(heroIds.filter(Boolean)))
  if (!unique.length) return new Map()
  const result = await withTable(supabaseClient, 'heroes', (table) =>
    supabaseClient
      .from(table)
      .select('id, name, image_url, owner_id')
      .in('id', unique),
  )
  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        hero_name: row.name,
        imageUrl: row.image_url,
        image_url: row.image_url,
        ownerId: row.owner_id,
      },
    ]),
  )
}

export function flattenAssignmentMembers(assignments = []) {
  const members = []
  assignments.forEach((assignment) => {
    ensureArray(assignment.members).forEach((member) => {
      if (member) members.push(member)
    })
  })
  return members
}
