const GENERIC_ROLE_KEYS = new Set([
  '',
  '역할 미지정',
  '미지정',
  'unassigned',
  'none',
  'any',
  'generic',
])

export function toTrimmed(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function toOptionalUuid(value) {
  const trimmed = toTrimmed(value)
  if (!trimmed) return null
  return trimmed
}

export function toNumber(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function normalizeRole(role) {
  const trimmed = toTrimmed(role)
  const key = trimmed.toLowerCase()
  if (GENERIC_ROLE_KEYS.has(key)) {
    return null
  }
  return trimmed || null
}

function sanitizeExcludeOwnerIds(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return []
  return rawList
    .map((value) => toOptionalUuid(value))
    .filter((value) => typeof value === 'string')
}

export function sanitizeSeatRequests(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return []
  return rawList
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const slotIndex = toNumber(entry.slotIndex ?? entry.slot_index)
      if (slotIndex === null || slotIndex < 0) return null

      const role = normalizeRole(entry.role)
      const score = toNumber(entry.score)
      const rating = toNumber(entry.rating)
      const excludeOwnerIds = sanitizeExcludeOwnerIds(
        entry.excludeOwnerIds ?? entry.exclude_owner_ids
      )

      return {
        slotIndex,
        role,
        score: score !== null ? Math.floor(score) : null,
        rating: rating !== null ? Math.floor(rating) : null,
        excludeOwnerIds,
      }
    })
    .filter(Boolean)
}

export function parseSeatRequestsInput(value) {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    const requests = sanitizeSeatRequests(parsed)
    if (requests.length) {
      return requests
    }
  } catch (error) {
    // ignore JSON parse errors and fall back to manual parsing
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const requests = lines
    .map((line) => {
      const [slotIndexStr, roleRaw = '', scoreStr = '', ratingStr = ''] = line
        .split(',')
        .map((segment) => segment.trim())

      const slotIndex = toNumber(slotIndexStr)
      if (slotIndex === null || slotIndex < 0) return null

      const role = normalizeRole(roleRaw)
      const score = toNumber(scoreStr)
      const rating = toNumber(ratingStr)

      return {
        slotIndex,
        role,
        score: score !== null ? Math.floor(score) : null,
        rating: rating !== null ? Math.floor(rating) : null,
        excludeOwnerIds: [],
      }
    })
    .filter(Boolean)

  return requests
}

export function formatCandidate(row) {
  if (!row || typeof row !== 'object') return null
  const ownerId = toOptionalUuid(row.owner_id ?? row.ownerId)
  const heroId = toOptionalUuid(row.hero_id ?? row.heroId)
  const heroName = toTrimmed(row.hero_name ?? row.heroName)
  const role = toTrimmed(row.role)
  const score = toNumber(row.score)
  const rating = toNumber(row.rating)
  const battles = toNumber(row.battles)
  const winRate = row.win_rate !== undefined && row.win_rate !== null ? Number(row.win_rate) : null
  const status = toTrimmed(row.status)
  const updatedAt = row.updated_at || null
  const scoreGap = toNumber(row.score_gap)
  const ratingGap = toNumber(row.rating_gap)

  return {
    ownerId,
    heroId,
    heroName,
    role,
    score: score !== null ? score : null,
    rating: rating !== null ? rating : null,
    battles: battles !== null ? battles : null,
    winRate: winRate !== null && Number.isFinite(winRate) ? winRate : null,
    status: status || 'standin',
    updatedAt,
    scoreGap: scoreGap !== null ? scoreGap : null,
    ratingGap: ratingGap !== null ? ratingGap : null,
    matchSource: 'participant_pool',
  }
}

export function normalizeExcludeOwnerIds(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return []
  return rawList
    .map((value) => toOptionalUuid(value))
    .filter((value) => typeof value === 'string')
}

export function toSeatRequestsPayload(seatRequests) {
  if (!Array.isArray(seatRequests)) return []
  return seatRequests.map((seat) => ({
    slot_index: seat.slotIndex,
    role: seat.role,
    score: seat.score,
    rating: seat.rating,
    exclude_owner_ids: Array.isArray(seat.excludeOwnerIds)
      ? seat.excludeOwnerIds
      : [],
  }))
}

export function buildDebugSeatExample() {
  return [
    { slotIndex: 0, role: '탱커', score: 1500, rating: 2000, excludeOwnerIds: [] },
    { slotIndex: 1, role: '딜러', score: 1520, rating: 1980, excludeOwnerIds: [] },
  ]
}

export function isGenericRole(role) {
  if (role === null || role === undefined) return true
  const normalized = toTrimmed(role).toLowerCase()
  return GENERIC_ROLE_KEYS.has(normalized)
}

export function createEmptySeatRow() {
  return { slotIndex: '', role: '', score: '', rating: '', excludeOwnerIds: '' }
}
