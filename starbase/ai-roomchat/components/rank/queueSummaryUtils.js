export function buildRoleSummaries({ match = null, pendingMatch = null, roles, slotLayout } = {}) {
  const activeMatch = match || null
  const fallbackMatch = pendingMatch || null

  const roleSource = Array.isArray(roles)
    ? roles
    : Array.isArray(activeMatch?.roles) && activeMatch.roles.length
    ? activeMatch.roles
    : Array.isArray(fallbackMatch?.roles)
    ? fallbackMatch.roles
    : []

  const layoutSource = Array.isArray(slotLayout)
    ? slotLayout
    : Array.isArray(activeMatch?.slotLayout) && activeMatch.slotLayout.length
    ? activeMatch.slotLayout
    : Array.isArray(fallbackMatch?.slotLayout)
    ? fallbackMatch.slotLayout
    : []

  const assignmentSource = Array.isArray(activeMatch?.assignments) && activeMatch.assignments.length
    ? activeMatch.assignments
    : Array.isArray(fallbackMatch?.assignments)
    ? fallbackMatch.assignments
    : []

  const roomsSource = Array.isArray(activeMatch?.rooms) && activeMatch.rooms.length
    ? activeMatch.rooms
    : Array.isArray(fallbackMatch?.rooms)
    ? fallbackMatch.rooms
    : []

  const roleOrder = []
  const roleOrderSet = new Set()
  const bucketMap = new Map()

  const ensureBucket = (value) => {
    if (typeof value !== 'string') return null
    const name = value.trim()
    if (!name) return null
    if (!bucketMap.has(name)) {
      bucketMap.set(name, { role: name, total: 0, filled: 0 })
    }
    if (!roleOrderSet.has(name)) {
      roleOrderSet.add(name)
      roleOrder.push(name)
    }
    return bucketMap.get(name)
  }

  const layoutSlots = Array.isArray(layoutSource) ? layoutSource : []
  const hasLayout = layoutSlots.length > 0

  layoutSlots.forEach((slot) => {
    if (!slot) return
    const roleName = typeof slot.role === 'string' ? slot.role.trim() : ''
    if (!roleName) return
    const bucket = ensureBucket(roleName)
    if (!bucket) return
    bucket.total += 1
  })

  const markSlot = (slot) => {
    if (!slot) return
    const roleName = typeof slot.role === 'string' ? slot.role.trim() : ''
    if (!roleName) return
    const bucket = ensureBucket(roleName)
    if (!bucket) return
    if (!hasLayout) {
      bucket.total += 1
    }
    const occupied =
      slot.occupied === true ||
      Boolean(slot.member) ||
      (Array.isArray(slot.members) && slot.members.some(Boolean)) ||
      slot.heroId != null ||
      slot.hero_id != null ||
      slot.heroOwnerId != null ||
      slot.hero_owner_id != null
    if (occupied) {
      bucket.filled += 1
    }
  }

  const assignmentSlots = Array.isArray(assignmentSource) ? assignmentSource : []
  if (assignmentSlots.length) {
    assignmentSlots.forEach((assignment) => {
      if (!assignment) return
      const roleSlots = Array.isArray(assignment.roleSlots)
        ? assignment.roleSlots
        : Array.isArray(assignment.role_slots)
        ? assignment.role_slots
        : []
      if (roleSlots.length) {
        roleSlots.forEach(markSlot)
        return
      }
      const fallbackRole = typeof assignment.role === 'string' ? assignment.role.trim() : ''
      if (!fallbackRole) return
      const bucket = ensureBucket(fallbackRole)
      if (!bucket) return
      const members = Array.isArray(assignment.members)
        ? assignment.members.filter(Boolean)
        : []
      if (!hasLayout) {
        const rawCount =
          assignment.slotCount ?? assignment.slot_count ?? assignment.capacity ?? members.length
        const numeric = Number(rawCount)
        const slotCount = Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : members.length || 1
        bucket.total += slotCount
        bucket.filled += Math.min(slotCount, members.length)
      } else {
        bucket.filled += members.length
      }
    })
  } else if (roomsSource.length) {
    roomsSource.forEach((room) => {
      if (!room) return
      const slots = Array.isArray(room.slots) ? room.slots : []
      slots.forEach(markSlot)
    })
  }

  const normalizedRoles = Array.isArray(roleSource)
    ? roleSource
        .map((entry) => {
          if (!entry) return null
          if (typeof entry === 'string') {
            const trimmed = entry.trim()
            return trimmed ? { name: trimmed, slotCount: 1 } : null
          }
          const name =
            typeof entry.name === 'string'
              ? entry.name.trim()
              : typeof entry.role === 'string'
              ? entry.role.trim()
              : ''
          if (!name) return null
          const rawCount = entry.slot_count ?? entry.slotCount ?? entry.capacity
          const numeric = Number(rawCount)
          const slotCount = Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : null
          return { name, slotCount }
        })
        .filter(Boolean)
    : []

  normalizedRoles.forEach((entry) => {
    if (hasLayout && !bucketMap.has(entry.name)) {
      return
    }
    const bucket = ensureBucket(entry.name)
    if (!bucket) return
    if (bucket.total <= 0 && Number.isInteger(entry.slotCount) && entry.slotCount >= 0) {
      bucket.total = entry.slotCount
    }
  })

  const buckets = roleOrder.length
    ? roleOrder
        .map((name) => bucketMap.get(name))
        .filter(Boolean)
    : Array.from(bucketMap.values())

  return buckets
    .map((bucket) => {
      const total = Math.max(0, bucket.total)
      const filled = Math.min(Math.max(0, bucket.filled), total)
      const missing = Math.max(0, total - filled)
      return {
        role: bucket.role,
        filled,
        total,
        missing,
        ready: total > 0 && missing === 0,
      }
    })
    .filter((entry) => entry.total > 0)
}

export default buildRoleSummaries
