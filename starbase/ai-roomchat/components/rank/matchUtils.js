export function coerceHeroMap(raw) {
  if (!raw) return new Map()
  if (raw instanceof Map) return raw
  if (typeof raw !== 'object') return new Map()
  try {
    return new Map(Object.entries(raw))
  } catch (error) {
    console.warn('히어로 맵 변환 실패:', error)
    return new Map()
  }
}

export function resolveHeroName(heroMap, heroId) {
  if (!heroId) return '미지정 캐릭터'
  const id = typeof heroId === 'string' ? heroId : String(heroId)
  const numericId = Number(id)
  const altKey = Number.isNaN(numericId) ? id : numericId
  const fromMap = heroMap.get(id) || heroMap.get(altKey)
  if (fromMap?.name) {
    return fromMap.name
  }
  if (fromMap?.displayName) {
    return fromMap.displayName
  }
  if (typeof fromMap === 'string' && fromMap.trim()) {
    return fromMap.trim()
  }
  return `캐릭터 #${id}`
}

export function resolveMemberLabel({ member, heroMap }) {
  if (!member) {
    return '알 수 없는 참가자'
  }
  const heroId = member.hero_id || member.heroId || member.heroID || null
  const heroName = resolveHeroName(heroMap, heroId)
  const ownerId = member.owner_id || member.ownerId || ''
  if (!ownerId) {
    return heroName
  }
  const shortOwner = ownerId.length > 6 ? `${ownerId.slice(0, 3)}…${ownerId.slice(-2)}` : ownerId
  return `${heroName} · ${shortOwner}`
}

export function computeRoleOffsets(rawRoles = []) {
  let cursor = 0
  const offsets = new Map()
  rawRoles.forEach((role) => {
    if (!role) return
    const name = typeof role.name === 'string' ? role.name.trim() : ''
    const slotCountRaw = role.slot_count ?? role.slotCount ?? role.capacity
    const slotCount = Number(slotCountRaw)
    if (!name || !Number.isFinite(slotCount) || slotCount <= 0) {
      return
    }
    offsets.set(name, { offset: cursor, count: slotCount })
    cursor += slotCount
  })
  return { offsets, total: cursor }
}

export function normalizeRoleSlots(roleSlots, roleCount) {
  if (!Array.isArray(roleSlots)) return []
  return roleSlots
    .map((slot) => {
      if (typeof slot === 'number') return Number(slot)
      if (typeof slot === 'object' && slot !== null) {
        const candidate = slot.slotIndex ?? slot.slot_index ?? slot.index
        if (Number.isFinite(Number(candidate))) {
          return Number(candidate)
        }
      }
      return Number.NaN
    })
    .filter((slot) => Number.isFinite(slot) && slot >= 0 && slot < roleCount)
}

export function extractHeroIdsFromAssignments({ roles = [], assignments = [] }) {
  const { offsets, total } = computeRoleOffsets(roles)
  if (!total) return []

  const heroIds = new Array(total).fill(null)

  assignments.forEach((assignment) => {
    if (!assignment) return
    const slots = Array.isArray(assignment.roleSlots || assignment.role_slots)
      ? assignment.roleSlots || assignment.role_slots
      : []

    slots.forEach((slot) => {
      const roleName = typeof slot === 'object' ? slot.role || slot.name : null
      const normalizedRole = typeof roleName === 'string' ? roleName.trim() : ''
      if (!normalizedRole || !offsets.has(normalizedRole)) return

      const { offset, count } = offsets.get(normalizedRole)
      const slotIndexRaw =
        (slot && typeof slot === 'object'
          ? slot.localIndex ?? slot.local_index ?? slot.slotIndex ?? slot.slot_index ?? slot.index
          : slot) ?? null
      let slotIndex = Number(slotIndexRaw)
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= count) {
        const globalValue = Number(
          slot && typeof slot === 'object'
            ? slot.slotIndex ?? slot.slot_index ?? slot.index
            : slot,
        )
        if (Number.isInteger(globalValue) && globalValue >= offset && globalValue < offset + count) {
          slotIndex = globalValue - offset
        } else {
          return
        }
      }

      const members = Array.isArray(slot.members)
        ? slot.members
        : Array.isArray(assignment.members)
        ? assignment.members
        : []

      const member = members.find((candidate) => {
        if (!candidate) return false
        if (slot.member && candidate === slot.member) return true
        if (slot.member && slot.member.id && candidate.id && slot.member.id === candidate.id)
          return true
        const heroId = candidate.hero_id || candidate.heroId || candidate.heroID
        if (!heroId) return false
        const slotHero = slot.heroId || slot.hero_id
        if (slotHero && slotHero === heroId) return true
        return false
      }) || (Array.isArray(slot.members) && slot.members[0])

      const heroId =
        (member && (member.hero_id || member.heroId || member.heroID)) ||
        slot.heroId ||
        slot.hero_id ||
        null
      if (!heroId) return

      const globalIndex = offset + slotIndex
      if (globalIndex < 0 || globalIndex >= heroIds.length) return
      heroIds[globalIndex] = String(heroId)
    })
  })

  return heroIds
}
