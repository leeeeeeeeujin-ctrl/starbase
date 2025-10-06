export function normalizeHeroIdValue(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return String(value)
  }
  if (typeof value === 'object') {
    if (typeof value.id !== 'undefined') {
      return normalizeHeroIdValue(value.id)
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const resolved = normalizeHeroIdValue(item)
        if (resolved) return resolved
      }
    }
  }
  return null
}

export function resolveParticipantHeroId(participant) {
  if (!participant) return null
  const direct =
    normalizeHeroIdValue(participant?.hero_id ?? participant?.heroId ?? null) ||
    normalizeHeroIdValue(participant?.hero?.id)
  if (direct) return direct

  const candidateLists = []
  if (Array.isArray(participant?.hero_ids)) {
    candidateLists.push(participant.hero_ids)
  }
  if (Array.isArray(participant?.heroIds)) {
    candidateLists.push(participant.heroIds)
  }

  for (const list of candidateLists) {
    for (const candidate of list) {
      const resolved = normalizeHeroIdValue(candidate)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
}
