const TURN_TIMER_VALUES = [15, 30, 60, 120]

export const TURN_TIMER_OPTIONS = TURN_TIMER_VALUES.map((value) => ({
  value,
  label: `${value}초`,
}))

export function normalizeTurnTimerVotes(source) {
  const normalized = {}
  if (!source || typeof source !== 'object') {
    return normalized
  }

  TURN_TIMER_VALUES.forEach((value) => {
    const direct = source[value]
    const fallback = source[String(value)]
    const raw = direct ?? fallback
    const count = Number(raw)
    if (Number.isFinite(count) && count > 0) {
      normalized[value] = count
    }
  })

  return normalized
}

export function registerTurnTimerVote(voteMap, previousValue, nextValue) {
  const normalized = { ...normalizeTurnTimerVotes(voteMap) }

  const previous = Number(previousValue)
  if (TURN_TIMER_VALUES.includes(previous) && normalized[previous]) {
    normalized[previous] -= 1
    if (normalized[previous] <= 0) {
      delete normalized[previous]
    }
  }

  const next = Number(nextValue)
  if (TURN_TIMER_VALUES.includes(next)) {
    normalized[next] = (normalized[next] || 0) + 1
  }

  return normalized
}

export function summarizeTurnTimerVotes(voteMap) {
  const normalized = normalizeTurnTimerVotes(voteMap)
  let maxCount = 0
  const topValues = []

  TURN_TIMER_VALUES.forEach((value) => {
    const count = Number(normalized[value])
    if (!Number.isFinite(count) || count <= 0) {
      return
    }
    if (count > maxCount) {
      maxCount = count
      topValues.length = 0
      topValues.push(value)
    } else if (count === maxCount) {
      topValues.push(value)
    }
  })

  return { normalized, topValues, maxCount }
}

export function pickTurnTimer(voteMap, fallback, rng = Math.random) {
  const { normalized, topValues, maxCount } = summarizeTurnTimerVotes(voteMap)
  if (topValues.length === 0 || maxCount <= 0) {
    const fallbackNumber = Number(fallback)
    if (TURN_TIMER_VALUES.includes(fallbackNumber)) {
      return fallbackNumber
    }
    return 60
  }

  if (topValues.length === 1) {
    return topValues[0]
  }

  const random = typeof rng === 'function' ? rng() : Math.random()
  const rawIndex = Math.floor(Number.isFinite(random) ? random * topValues.length : 0)
  const index = Math.max(0, Math.min(topValues.length - 1, rawIndex))
  return topValues[index] ?? topValues[0]
}

export { TURN_TIMER_VALUES }
