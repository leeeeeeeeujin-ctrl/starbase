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
    .map((slot) => Number(slot))
    .filter((slot) => Number.isFinite(slot) && slot >= 0 && slot < roleCount)
}

export function extractHeroIdsFromAssignments({ roles = [], assignments = [] }) {
  const { offsets, total } = computeRoleOffsets(roles)
  if (!total) return []

  const heroIds = new Array(total).fill(null)
  const roleUsage = new Map()

  assignments.forEach((assignment) => {
    if (!assignment) return
    const roleName = typeof assignment.role === 'string' ? assignment.role.trim() : ''
    if (!roleName || !offsets.has(roleName)) return
    const { offset, count } = offsets.get(roleName)
    if (!roleUsage.has(roleName)) {
      roleUsage.set(roleName, new Set())
    }
    const usedSlots = roleUsage.get(roleName)
    const normalizedSlots = normalizeRoleSlots(
      assignment.roleSlots || assignment.role_slots,
      count,
    )
    const members = Array.isArray(assignment.members) ? assignment.members : []

    normalizedSlots.forEach((slotIndex, index) => {
      const member = members[index]
      if (!member) return
      const heroId = member.hero_id || member.heroId || member.heroID || null
      if (!heroId) return
      const globalIndex = offset + slotIndex
      if (globalIndex < 0 || globalIndex >= heroIds.length) return
      heroIds[globalIndex] = String(heroId)
      usedSlots.add(slotIndex)
    })

    members.forEach((member) => {
      if (!member) return
      const heroId = member.hero_id || member.heroId || member.heroID || null
      if (!heroId) return
      const alreadyAssigned = heroIds.includes(String(heroId))
      if (alreadyAssigned) return
      let slotIndex = 0
      while (slotIndex < count && usedSlots.has(slotIndex)) {
        slotIndex += 1
      }
      if (slotIndex >= count) {
        return
      }
      const globalIndex = offset + slotIndex
      if (globalIndex < 0 || globalIndex >= heroIds.length) {
        return
      }
      heroIds[globalIndex] = String(heroId)
      usedSlots.add(slotIndex)
    })
  })

  return heroIds
}
