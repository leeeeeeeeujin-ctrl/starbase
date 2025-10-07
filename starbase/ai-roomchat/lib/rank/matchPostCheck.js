import { buildRoleCapacityMap, normalizeRoleName } from './roleLayoutLoader'
import { normalizeHeroIdValue } from './participantUtils'

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
  { loadRoster } = {},
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
  const loadRosterFn = typeof loadRoster === 'function' ? loadRoster : null
  if (loadRosterFn && ownerIds.size > 0) {
    try {
      roster = await loadRosterFn({
        gameId,
        ownerIds: Array.from(ownerIds),
      })
    } catch (error) {
      console.warn('참가자 정보를 확인하지 못해 후검사를 건너뜁니다:', error)
    }
  }

  const heroBuckets = new Map()
  const heroRoleOverrides = new Map()
  memberEntries.forEach((entry) => {
    if (!entry.heroId) return
    const list = heroBuckets.get(entry.heroId) || []
    list.push(entry)
    heroBuckets.set(entry.heroId, list)
  })

  const declaredRoleNames = new Set(
    Array.isArray(roles)
      ? roles
          .map((entry) => normalizeRoleName(entry?.name ?? entry?.role))
          .filter((name) => typeof name === 'string' && name.length > 0)
      : [],
  )

  heroBuckets.forEach((entries, heroId) => {
    entries.forEach((entry) => {
      entry.expectedRole = lookupParticipantRole(roster, entry.ownerId, heroId)
    })

    const mismatched = entries.filter((entry) => {
      if (!entry.expectedRole) return false
      const normalizedRole = normalizeRoleName(entry.roleName)
      const normalizedExpected = normalizeRoleName(entry.expectedRole)
      if (!normalizedExpected) return false
      if (!normalizedRole) return false
      if (declaredRoleNames.size > 0 && !declaredRoleNames.has(normalizedRole)) {
        return false
      }
      return normalizedRole !== normalizedExpected
    })
    mismatched.forEach((entry) => {
      entry.remove = true
      entry.reason = 'role_mismatch'
      if (entry.member) {
        entry.member.__remove = true
      }
    })

    const eligible = entries.filter((entry) => !entry.remove)
    const exactMatches = eligible.filter((entry) => {
      if (!entry.expectedRole) return false
      const normalizedRole = normalizeRoleName(entry.roleName)
      const normalizedExpected = normalizeRoleName(entry.expectedRole)
      if (!normalizedRole || !normalizedExpected) return false
      return normalizedRole === normalizedExpected
    })

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

    const survivingWithRole = entries.find((entry) => {
      if (entry.remove) return false
      const normalizedExpected = normalizeRoleName(entry.expectedRole)
      return Boolean(normalizedExpected)
    })
    if (survivingWithRole) {
      const normalizedRole = normalizeRoleName(survivingWithRole.expectedRole)
      const normalizedHeroId = normalizeHeroIdValue(heroId)
      if (normalizedHeroId && normalizedRole) {
        heroRoleOverrides.set(normalizedHeroId, normalizedRole)
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

  const deriveOverrideRole = (members = []) => {
    if (!Array.isArray(members)) return ''
    for (const member of members) {
      if (!member || typeof member !== 'object') continue
      const heroId = normalizeHeroIdValue(member.hero_id ?? member.heroId ?? null)
      if (heroId && heroRoleOverrides.has(heroId)) {
        return heroRoleOverrides.get(heroId)
      }
    }
    return ''
  }

  const ensureRecognizedRole = (roleName, fallbackCandidates = []) => {
    const normalized = normalizeRoleName(roleName)
    if (normalized && (declaredRoleNames.size === 0 || declaredRoleNames.has(normalized))) {
      return normalized
    }
    if (Array.isArray(fallbackCandidates)) {
      for (const candidate of fallbackCandidates) {
        const normalizedCandidate = normalizeRoleName(candidate)
        if (!normalizedCandidate) continue
        if (declaredRoleNames.size === 0 || declaredRoleNames.has(normalizedCandidate)) {
          return normalizedCandidate
        }
      }
    }
    return declaredRoleNames.size === 0 ? normalized : ''
  }

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
              const declaredRole = normalizeRoleName(assignment.role)
              if (heroId) {
                if (survivorHeroIds.size > 0 && !survivorHeroIds.has(heroId)) {
                  return null
                }
                if (
                  declaredRole &&
                  survivorKeys.size > 0 &&
                  !survivorKeys.has(`${heroId}::${declaredRole}`)
                ) {
                  return null
                }
                const overrideRole = heroRoleOverrides.get(heroId) || ''
                const resolvedRole = ensureRecognizedRole(clone.role ?? overrideRole, [
                  overrideRole,
                  declaredRole,
                ])
                if (resolvedRole) {
                  clone.role = resolvedRole
                }
              } else if (clone.role) {
                const resolvedRole = ensureRecognizedRole(clone.role, [declaredRole])
                if (resolvedRole) {
                  clone.role = resolvedRole
                }
              }
              return clone
            })
            .filter(Boolean)
        : []

      assignment.members = sanitizedMembers
      assignment.roleSlots = []

      const memberRoles = sanitizedMembers
        .map((member) => ensureRecognizedRole(member?.role ?? assignment?.role, [assignment?.role]))
        .filter(Boolean)
      if (memberRoles.length > 0) {
        const uniqueRoles = Array.from(new Set(memberRoles))
        if (uniqueRoles.length === 1) {
          assignment.role = uniqueRoles[0]
        }
      }

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
        const overrideRole = deriveOverrideRole([primaryMember]) || deriveOverrideRole(members)
        const fallbackRole = ensureRecognizedRole(slot.role, [overrideRole, assignment?.role])
        const normalizedOverride = normalizeRoleName(overrideRole)
        const resolvedRole = normalizedOverride || fallbackRole
        sanitizedSlot.role =
          resolvedRole ||
          (declaredRoleNames.size === 0 ? normalizeRoleName(slot.role) : '')
      } else {
        sanitizedSlot.hero_id = null
        sanitizedSlot.heroId = null
        sanitizedSlot.hero_owner_id = null
        sanitizedSlot.heroOwnerId = null
        const fallbackRole = ensureRecognizedRole(slot.role, [assignment?.role])
        sanitizedSlot.role = fallbackRole || (declaredRoleNames.size === 0 ? normalizeRoleName(slot.role) : '')
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

    const slotRoles = sanitizedSlots
      .map((slot) => normalizeRoleName(slot?.role))
      .filter((name) => name && (declaredRoleNames.size === 0 || declaredRoleNames.has(name)))
    if (slotRoles.length > 0) {
      const unique = Array.from(new Set(slotRoles))
      if (unique.length === 1) {
        assignment.role = unique[0]
      }
    }
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
      const overrideRole = heroId && heroRoleOverrides.has(heroId) ? heroRoleOverrides.get(heroId) : ''
      const memberDerivedRole = overrideRole || deriveOverrideRole([slotMember, ...slotMembers])
      const sanitizedRole = ensureRecognizedRole(memberDerivedRole || slot.role, [overrideRole, slot.role])
      const occupied =
        Boolean(slotMember) ||
        Boolean(slot.occupied) ||
        slotMembers.some(Boolean) ||
        hasHero
      return {
        ...slot,
        role: sanitizedRole,
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
