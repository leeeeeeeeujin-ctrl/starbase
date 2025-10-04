const DEFAULT_THRESHOLD_RATIO = 0.8

function normalizeOwnerId(value) {
  if (value == null) return null
  const asString = String(value).trim()
  return asString ? asString : null
}

const DEFEATED_STATUSES = new Set([
  'defeated',
  'lost',
  'dead',
  'eliminated',
  'retired',
  'out',
  'spectating',
])

export function deriveEligibleOwnerIds(participants = []) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return []
  }
  const owners = []
  participants.forEach((participant) => {
    const ownerId =
      normalizeOwnerId(
        participant?.owner_id ??
          participant?.ownerId ??
          participant?.ownerID ??
          participant?.owner?.id ??
          null,
      )
    if (!ownerId) return
    const status = String(participant?.status || '').toLowerCase()
    if (DEFEATED_STATUSES.has(status)) return
    owners.push(ownerId)
  })
  if (!owners.length) {
    return []
  }
  return Array.from(new Set(owners))
}

export function createTurnVoteController({ thresholdRatio = DEFAULT_THRESHOLD_RATIO } = {}) {
  let ratio = Number.isFinite(Number(thresholdRatio)) ? Number(thresholdRatio) : DEFAULT_THRESHOLD_RATIO
  if (ratio <= 0) {
    ratio = DEFAULT_THRESHOLD_RATIO
  }

  let eligibleOwnerIds = []
  let consentedOwnerIds = new Set()
  let snapshot = {
    eligibleOwnerIds,
    consentedOwnerIds: [],
    consensusCount: 0,
    threshold: 0,
    needsConsensus: false,
    hasReachedThreshold: false,
  }

  function computeSnapshot() {
    const eligibleSet = new Set(eligibleOwnerIds)
    const normalizedVotes = []
    consentedOwnerIds.forEach((ownerId) => {
      if (eligibleSet.has(ownerId)) {
        normalizedVotes.push(ownerId)
      }
    })
    const needsConsensus = eligibleOwnerIds.length > 0
    const threshold = needsConsensus ? Math.max(1, Math.ceil(eligibleOwnerIds.length * ratio)) : 0
    const consensusCount = normalizedVotes.length
    snapshot = {
      eligibleOwnerIds: eligibleOwnerIds.slice(),
      consentedOwnerIds: normalizedVotes,
      consensusCount,
      threshold,
      needsConsensus,
      hasReachedThreshold: needsConsensus && consensusCount >= threshold,
    }
    return snapshot
  }

  return {
    configure({ thresholdRatio: nextRatio } = {}) {
      if (Number.isFinite(Number(nextRatio))) {
        const numeric = Number(nextRatio)
        if (numeric > 0) {
          ratio = numeric
        }
      }
      return computeSnapshot()
    },
    syncEligibleOwners(nextEligible = []) {
      const normalized = Array.isArray(nextEligible)
        ? nextEligible
            .map((value) => normalizeOwnerId(value))
            .filter((value) => value !== null)
        : []
      const unique = Array.from(new Set(normalized))
      const sameLength = unique.length === eligibleOwnerIds.length
      const sameOrder = sameLength && unique.every((value, index) => eligibleOwnerIds[index] === value)
      if (!sameOrder) {
        eligibleOwnerIds = unique
        const eligibleSet = new Set(eligibleOwnerIds)
        consentedOwnerIds.forEach((ownerId) => {
          if (!eligibleSet.has(ownerId)) {
            consentedOwnerIds.delete(ownerId)
          }
        })
      }
      return computeSnapshot()
    },
    registerConsent(ownerId) {
      const normalized = normalizeOwnerId(ownerId)
      if (!normalized) {
        return computeSnapshot()
      }
      if (!eligibleOwnerIds.includes(normalized)) {
        return computeSnapshot()
      }
      consentedOwnerIds.add(normalized)
      return computeSnapshot()
    },
    revokeConsent(ownerId) {
      const normalized = normalizeOwnerId(ownerId)
      if (!normalized) {
        return computeSnapshot()
      }
      consentedOwnerIds.delete(normalized)
      return computeSnapshot()
    },
    clear() {
      consentedOwnerIds.clear()
      return computeSnapshot()
    },
    hasConsented(ownerId) {
      const normalized = normalizeOwnerId(ownerId)
      if (!normalized) return false
      return consentedOwnerIds.has(normalized)
    },
    getSnapshot() {
      return snapshot
    },
  }
}

export default createTurnVoteController
