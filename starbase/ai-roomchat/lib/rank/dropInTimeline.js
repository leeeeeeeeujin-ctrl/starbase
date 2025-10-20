export function buildDropInExtensionTimelineEvent({
  extraSeconds,
  appliedAt = Date.now(),
  hasActiveDeadline = false,
  dropInMeta = null,
  arrivals = [],
  mode = null,
  turnNumber = null,
} = {}) {
  const numericBonus = Number.isFinite(Number(extraSeconds))
    ? Math.floor(Number(extraSeconds))
    : null
  if (!numericBonus || numericBonus <= 0) {
    return null
  }

  const timestamp = Number.isFinite(Number(appliedAt))
    ? Math.floor(Number(appliedAt))
    : Date.now()

  const normalizedMode = typeof mode === 'string' && mode.trim() ? mode.trim() : null
  const normalizedTurn =
    turnNumber === null || turnNumber === undefined || turnNumber === ''
      ? null
      : Number.isFinite(Number(turnNumber))
        ? Math.floor(Number(turnNumber))
        : null

  const arrivalCount = Array.isArray(arrivals) ? arrivals.filter(Boolean).length : 0

  const context = { bonusSeconds: numericBonus }
  if (normalizedMode) {
    context.mode = normalizedMode
  }
  if (arrivalCount > 0) {
    context.arrivalCount = arrivalCount
  }

  const queueDepth = Number.isFinite(Number(dropInMeta?.queueDepth))
    ? Math.floor(Number(dropInMeta.queueDepth))
    : null
  if (queueDepth !== null) {
    context.queueDepth = queueDepth
  }

  const replacements = Number.isFinite(Number(dropInMeta?.replacements))
    ? Math.floor(Number(dropInMeta.replacements))
    : null
  if (replacements !== null) {
    context.replacements = replacements
  }

  const status = hasActiveDeadline ? 'drop_in_bonus_applied' : 'drop_in_bonus_queued'
  const type = hasActiveDeadline ? 'turn_extended' : 'turn_bonus_pending'

  let metadata = null
  if (dropInMeta && typeof dropInMeta === 'object') {
    try {
      metadata = { dropIn: JSON.parse(JSON.stringify(dropInMeta)) }
    } catch (error) {
      metadata = { dropIn: dropInMeta }
    }
  }

  return {
    type,
    turn: normalizedTurn,
    timestamp,
    reason: status,
    context,
    metadata,
  }
}
