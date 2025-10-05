import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig'
import {
  START_SESSION_KEYS,
  readStartSessionValue,
  writeStartSessionValue,
  removeStartSessionValue,
} from '@/lib/rank/startSessionChannel'

const MATCH_META_KEY = START_SESSION_KEYS.MATCH_META

function safeClone(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return value
  if (value instanceof Map) {
    try {
      return JSON.parse(JSON.stringify(Object.fromEntries(value.entries())))
    } catch (error) {
      console.warn('매치 메타데이터 Map 직렬화 실패:', error)
      return null
    }
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    console.warn('매치 메타데이터를 직렬화하지 못했습니다:', error)
    return null
  }
}

function normalizeAssignmentMember(member, index) {
  if (!member || typeof member !== 'object') {
    return { index }
  }

  const clone = { ...member }
  const heroId =
    member.hero_id ??
    member.heroId ??
    member.heroID ??
    (member.hero && (member.hero.id ?? member.heroId)) ??
    null
  const ownerId = member.owner_id ?? member.ownerId ?? member.ownerID ?? null
  const slotCandidate =
    member.slot_no ??
    member.slotNo ??
    member.slot_index ??
    member.slotIndex ??
    null
  const slotNo =
    slotCandidate != null && Number.isFinite(Number(slotCandidate))
      ? Number(slotCandidate)
      : null

  const normalizedHeroId = heroId != null ? String(heroId).trim() : null
  if (normalizedHeroId) {
    clone.hero_id = normalizedHeroId
    clone.heroId = normalizedHeroId
  }
  const normalizedOwnerId = ownerId != null ? String(ownerId).trim() : null
  if (normalizedOwnerId) {
    clone.owner_id = normalizedOwnerId
    clone.ownerId = normalizedOwnerId
  }
  if (slotNo != null) {
    clone.slot_no = slotNo
    clone.slotNo = slotNo
  }

  const queueId = member.queue_id ?? member.queueId ?? member.queueID ?? null
  const normalizedQueueId = queueId != null ? String(queueId).trim() : null
  if (normalizedQueueId) {
    clone.queue_id = normalizedQueueId
    clone.queueId = normalizedQueueId
  }

  const partyKey = member.party_key ?? member.partyKey ?? null
  const normalizedPartyKey = partyKey != null ? String(partyKey).trim() : null
  if (normalizedPartyKey) {
    clone.party_key = normalizedPartyKey
    clone.partyKey = normalizedPartyKey
  }

  const partyMemberIndex =
    member.party_member_index ?? member.partyMemberIndex ?? member.memberIndex
  if (partyMemberIndex != null && Number.isFinite(Number(partyMemberIndex))) {
    clone.party_member_index = Number(partyMemberIndex)
    clone.partyMemberIndex = Number(partyMemberIndex)
  }

  const joinedAt = member.joined_at ?? member.joinedAt ?? null
  if (joinedAt) {
    clone.joined_at = joinedAt
    clone.joinedAt = joinedAt
  }

  const rating = member.rating ?? member.score ?? null
  if (rating != null && Number.isFinite(Number(rating))) {
    clone.rating = Number(rating)
  }

  return clone
}

function normalizeAssignment(assignment) {
  if (!assignment || typeof assignment !== 'object') return null

  const role = typeof assignment.role === 'string' ? assignment.role.trim() : ''
  const slots =
    assignment.slots != null && Number.isFinite(Number(assignment.slots))
      ? Number(assignment.slots)
      : null
  const roleSlots = Array.isArray(assignment.roleSlots)
    ? assignment.roleSlots
        .map((slot) => Number(slot))
        .filter((slot) => Number.isFinite(slot))
    : Array.isArray(assignment.role_slots)
    ? assignment.role_slots
        .map((slot) => Number(slot))
        .filter((slot) => Number.isFinite(slot))
    : []
  const heroIds = Array.isArray(assignment.heroIds)
    ? assignment.heroIds
        .map((id) => (id != null ? String(id).trim() : ''))
        .filter((id) => id.length > 0)
    : []
  const members = Array.isArray(assignment.members)
    ? assignment.members
        .map((member, index) => normalizeAssignmentMember(member, index))
        .map((member) => safeClone(member) ?? member)
    : []

  const payload = {
    role,
    slots,
    roleSlots,
    heroIds,
    members,
  }

  if (assignment.groupKey) {
    payload.groupKey = assignment.groupKey
  }
  if (assignment.partyKey) {
    payload.partyKey = assignment.partyKey
  }
  if (assignment.anchorScore != null) {
    payload.anchorScore = assignment.anchorScore
  }

  return payload
}

function normalizeRolesForMeta(roles = []) {
  if (!Array.isArray(roles)) return []
  return roles
    .map((role) => {
      if (!role) return null
      if (typeof role === 'string') {
        const trimmed = role.trim()
        return trimmed ? { name: trimmed } : null
      }
      const name =
        typeof role.name === 'string'
          ? role.name.trim()
          : typeof role.role === 'string'
          ? role.role.trim()
          : ''
      if (!name) return null
      const slotCount = Number(role.slot_count ?? role.slotCount ?? role.slots)
      const normalized = { name }
      if (Number.isFinite(slotCount)) {
        normalized.slotCount = slotCount
      }
      return normalized
    })
    .filter(Boolean)
}

export function buildMatchMetaPayload(match, extras = {}) {
  if (!match || typeof match !== 'object') return null

  const normalizedAssignments = Array.isArray(match.assignments)
    ? match.assignments
        .map((assignment) => normalizeAssignment(assignment))
        .filter(Boolean)
    : []

  const heroMapClone =
    match.heroMap instanceof Map ? safeClone(match.heroMap) : safeClone(match.heroMap || null)

  const payload = {
    storedAt: Date.now(),
    matchType: typeof match.matchType === 'string' ? match.matchType.trim() : null,
    matchCode: typeof match.matchCode === 'string' ? match.matchCode.trim() : null,
    dropInTarget: safeClone(match.dropInTarget || null),
    dropInMeta: safeClone(match.dropInMeta || null),
    sampleMeta: safeClone(match.sampleMeta || null),
    roleStatus: safeClone(match.roleStatus || null),
    roles: normalizeRolesForMeta(match.roles || match.roleStatus?.roles || []),
    assignments: normalizedAssignments,
    scoreWindow:
      match.maxWindow != null && Number.isFinite(Number(match.maxWindow))
        ? Number(match.maxWindow)
        : null,
    heroMap: heroMapClone,
    ...extras,
  }

  if (match.source) {
    payload.source = match.source
  }

  return safeClone(payload)
}

export function storeStartMatchMeta(meta) {
  if (typeof window === 'undefined') return
  if (!meta) {
    removeStartSessionValue(MATCH_META_KEY, { source: 'start-config' })
    return
  }
  const sanitized = safeClone(meta)
  if (!sanitized) {
    removeStartSessionValue(MATCH_META_KEY, { source: 'start-config' })
    return
  }
  try {
    writeStartSessionValue(MATCH_META_KEY, JSON.stringify(sanitized), {
      source: 'start-config',
    })
  } catch (error) {
    console.warn('매치 메타데이터를 저장하지 못했습니다:', error)
  }
}

export function consumeStartMatchMeta() {
  if (typeof window === 'undefined') return null
  try {
    const raw = readStartSessionValue(MATCH_META_KEY)
    if (!raw) return null
    removeStartSessionValue(MATCH_META_KEY, { source: 'start-config' })
    const parsed = JSON.parse(raw)
    return safeClone(parsed)
  } catch (error) {
    console.warn('매치 메타데이터를 불러오지 못했습니다:', error)
    return null
  }
}

export function readStoredStartConfig() {
  if (typeof window === 'undefined') {
    return {
      apiKey: '',
      apiVersion: 'gemini',
      geminiMode: DEFAULT_GEMINI_MODE,
      geminiModel: DEFAULT_GEMINI_MODEL,
    }
  }
  let apiKey = ''
  let apiVersion = 'gemini'
  let geminiMode = DEFAULT_GEMINI_MODE
  let geminiModel = DEFAULT_GEMINI_MODEL
  try {
    apiKey = (readStartSessionValue(START_SESSION_KEYS.API_KEY) || '').trim()
    apiVersion = readStartSessionValue(START_SESSION_KEYS.API_VERSION) || 'gemini'
    geminiMode = normalizeGeminiMode(
      readStartSessionValue(START_SESSION_KEYS.GEMINI_MODE) || DEFAULT_GEMINI_MODE,
    )
    geminiModel = normalizeGeminiModelId(
      readStartSessionValue(START_SESSION_KEYS.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL,
    )
    if (!geminiModel) {
      geminiModel = DEFAULT_GEMINI_MODEL
    }
  } catch (error) {
    console.warn('시작 설정을 불러오지 못했습니다:', error)
  }
  return { apiKey, apiVersion, geminiMode, geminiModel }
}
