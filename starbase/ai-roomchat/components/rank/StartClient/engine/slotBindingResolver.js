function normalizeVisibleSlots(options = {}) {
  const rawList = Array.isArray(options.visible_slots) ? options.visible_slots : []
  const normalized = rawList
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0)

  return Array.from(new Set(normalized)).filter((value) => value >= 0)
}

export function resolveSlotBinding({ node, actorContext } = {}) {
  const options = node?.options || {}
  const slotIndex = Number.isInteger(actorContext?.slotIndex)
    ? actorContext.slotIndex
    : -1

  const visibleSlots = normalizeVisibleSlots(options)
  const isInvisible = options.invisible === true

  let audienceSlots = [...visibleSlots]
  if (!audienceSlots.length && isInvisible && slotIndex >= 0) {
    audienceSlots = [slotIndex]
  }

  const hasLimitedAudience = audienceSlots.length > 0
  const promptAudience = hasLimitedAudience
    ? { audience: 'slots', slots: audienceSlots }
    : { audience: 'all' }

  return {
    promptAudience,
    responseAudience: promptAudience,
    slotIndex,
    templateSlotRef: slotIndex >= 0 ? slotIndex + 1 : null,
    hasLimitedAudience,
    visibleSlots: audienceSlots.slice(),
  }
}

export default resolveSlotBinding
