export function sanitizeSeconds(value, fallback = 60) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }
  return Math.floor(numeric)
}

export function createTurnTimerService({
  baseSeconds,
  firstTurnBonusSeconds = 30,
  dropInBonusSeconds = 30,
} = {}) {
  let base = sanitizeSeconds(baseSeconds)
  let firstTurnBonusAvailable = true
  let pendingDropInBonus = false
  let lastTurnNumber = 0
  let lastDropInAppliedTurn = 0

  return {
    configureBase(seconds) {
      base = sanitizeSeconds(seconds, base)
    },
    reset() {
      firstTurnBonusAvailable = true
      pendingDropInBonus = false
      lastTurnNumber = 0
      lastDropInAppliedTurn = 0
    },
    nextTurnDuration(turnNumber) {
      const normalizedTurn = Number.isFinite(Number(turnNumber))
        ? Number(turnNumber)
        : 0

      let duration = base

      if (firstTurnBonusAvailable) {
        if (normalizedTurn <= 1) {
          duration += firstTurnBonusSeconds
        }
        firstTurnBonusAvailable = false
      }

      if (pendingDropInBonus) {
        duration += dropInBonusSeconds
        pendingDropInBonus = false
        lastDropInAppliedTurn = normalizedTurn
      }

      lastTurnNumber = normalizedTurn
      return duration
    },
    registerDropInBonus(options = {}) {
      const immediate = options.immediate ?? false
      const turnNumber = Number.isFinite(Number(options.turnNumber))
        ? Number(options.turnNumber)
        : lastTurnNumber

      if (immediate) {
        if (lastDropInAppliedTurn === turnNumber) {
          return 0
        }
        lastDropInAppliedTurn = turnNumber
        pendingDropInBonus = false
        return dropInBonusSeconds
      }

      pendingDropInBonus = true
      return dropInBonusSeconds
    },
    hasPendingDropInBonus() {
      return pendingDropInBonus
    },
    getSnapshot() {
      return {
        baseSeconds: base,
        firstTurnBonusSeconds,
        firstTurnBonusAvailable,
        dropInBonusSeconds,
        pendingDropInBonus,
        lastTurnNumber,
        lastDropInAppliedTurn,
      }
    },
  }
}

export default createTurnTimerService
