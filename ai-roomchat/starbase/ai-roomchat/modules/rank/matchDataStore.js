import { normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'

const STORAGE_PREFIX = 'rank.match.game.'

function createEmptySlotTemplate() {
  return {
    slots: [],
    roles: [],
    version: 0,
    source: '',
    updatedAt: 0,
  }
}

function createEmptyTurnState() {
  return {
    version: 1,
    turnNumber: 0,
    scheduledAt: 0,
    deadline: 0,
    durationSeconds: 0,
    remainingSeconds: 0,
    status: '',
    dropInBonusSeconds: 0,
    dropInBonusAppliedAt: 0,
    dropInBonusTurn: 0,
    source: '',
    updatedAt: 0,
  }
}

function createEmptySessionMeta() {
  return {
    turnTimer: null,
    vote: null,
    dropIn: null,
    asyncFill: null,
    turnState: createEmptyTurnState(),
    extras: null,
    source: '',
    updatedAt: 0,
  }
}

function createEmptySessionHistory() {
  return {
    sessionId: null,
    turns: [],
    totalCount: 0,
    publicCount: 0,
    hiddenCount: 0,
    suppressedCount: 0,
    truncated: false,
    lastIdx: null,
    updatedAt: 0,
    source: '',
    diagnostics: null,
  }
}

function sanitizeHistoryTurn(turn, index) {
  if (!turn || typeof turn !== 'object') return null

  const idxValue = Number(turn.idx)
  const roleRaw = typeof turn.role === 'string' ? turn.role.trim() : ''
  const content = typeof turn.content === 'string' ? turn.content : ''
  const createdAt = turn.createdAt || turn.created_at || null
  const summaryPayload =
    turn.summaryPayload ||
    turn.summary_payload ||
    (turn.summary && typeof turn.summary === 'object' ? turn.summary : null)
  const metadata =
    turn.metadata && typeof turn.metadata === 'object'
      ? safeClone(turn.metadata)
      : null

  return {
    id:
      turn.id != null
        ? String(turn.id).trim() || null
        : turn.turn_id != null
        ? String(turn.turn_id).trim() || null
        : null,
    idx: Number.isFinite(idxValue) ? idxValue : index,
    role: roleRaw || 'system',
    content,
    public: turn.public !== false,
    isVisible: turn.isVisible !== false && turn.is_visible !== false,
    createdAt,
    summaryPayload: summaryPayload != null ? safeClone(summaryPayload) : null,
    metadata,
  }
}


function sanitizeHistoryTurns(turns = []) {
  if (!Array.isArray(turns)) return []
  const seen = new Set()
  return turns
    .map((turn, index) => {
      const sanitized = sanitizeHistoryTurn(turn, index)
      if (!sanitized) return null
      // 중복/불일치 검증: idx, role, ownerId, heroId 기준
      const key = `${sanitized.idx}::${sanitized.role}`
      if (seen.has(key)) {
        console.warn('[matchDataStore] 중복 턴 감지:', { key, turn: sanitized })
        return null
      }
      seen.add(key)
      return sanitized
    })
    .filter(Boolean)
}

function sanitizeSessionHistoryPayload(patch, previous) {
  if (patch === null) {
    const cleared = createEmptySessionHistory()
    cleared.updatedAt = Date.now()
    return cleared
  }

  const base = previous ? safeClone(previous) || createEmptySessionHistory() : createEmptySessionHistory()
  const next = { ...createEmptySessionHistory(), ...base }

  if (patch && typeof patch === 'object') {
    if (patch.sessionId !== undefined) {
      const sessionId = patch.sessionId != null ? String(patch.sessionId).trim() : ''
      next.sessionId = sessionId || null
    }

    if (patch.turns !== undefined) {
      next.turns = sanitizeHistoryTurns(patch.turns)
    }

    if (patch.totalCount !== undefined) {
      const total = Number(patch.totalCount)
      next.totalCount = Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0
    }

    if (patch.publicCount !== undefined) {
      const publicCount = Number(patch.publicCount)
      next.publicCount = Number.isFinite(publicCount) && publicCount >= 0 ? Math.floor(publicCount) : 0
    }

    if (patch.hiddenCount !== undefined) {
      const hiddenCount = Number(patch.hiddenCount)
      next.hiddenCount = Number.isFinite(hiddenCount) && hiddenCount >= 0 ? Math.floor(hiddenCount) : 0
    }

    if (patch.suppressedCount !== undefined) {
      const suppressedCount = Number(patch.suppressedCount)
      next.suppressedCount = Number.isFinite(suppressedCount) && suppressedCount >= 0 ? Math.floor(suppressedCount) : 0
    }

    if (patch.truncated !== undefined) {
      next.truncated = Boolean(patch.truncated)
    }

    if (patch.lastIdx !== undefined) {
      const lastIdx = Number(patch.lastIdx)
      next.lastIdx = Number.isFinite(lastIdx) ? Math.floor(lastIdx) : null
    }

    if (patch.updatedAt !== undefined) {
      const updatedAt = Number(patch.updatedAt)
      if (Number.isFinite(updatedAt) && updatedAt > 0) {
        next.updatedAt = Math.floor(updatedAt)
      }
    }

    if (patch.source !== undefined) {
      next.source = typeof patch.source === 'string' ? patch.source.trim() : next.source || ''
    }

    if (patch.diagnostics !== undefined) {
      const diagnostics = safeClone(patch.diagnostics)
      next.diagnostics = diagnostics === undefined ? null : diagnostics
    }
  }

  if (!next.updatedAt) {
    next.updatedAt = Date.now()
  }

  return next
}

function createEmptyState() {
  return {
    updatedAt: 0,
    participation: {
      roster: [],
      heroOptions: [],
      heroMap: null,
      participantPool: [],
      updatedAt: 0,
    },
    heroSelection: null,
    matchSnapshot: null,
    postCheck: null,
    confirmation: null,
    slotTemplate: createEmptySlotTemplate(),
    sessionMeta: createEmptySessionMeta(),
    sessionHistory: createEmptySessionHistory(),
  }
}

function safeClone(value) {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Map) {
    return safeClone(Object.fromEntries(value.entries()))
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeClone(item)).filter((item) => item !== undefined)
  }

  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      try {
        const clone = {}
        for (const key of Object.keys(value)) {
          const cloned = safeClone(value[key])
          if (cloned !== undefined) {
            clone[key] = cloned
          }
        }
        return clone
      } catch (innerError) {
        console.warn('[matchDataStore] 데이터를 복제하지 못했습니다:', innerError)
        return null
      }
    }
  }

  if (typeof value === 'function') {
    return undefined
  }

  return value
}

function normalizeTimestampInput(value) {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric)
    }
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
    return null
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) && time > 0 ? Math.floor(time) : null
  }

  return null
}

function getStorageKey(gameId) {
  if (!gameId && gameId !== 0) return ''
  const key = String(gameId).trim()
  return key ? `${STORAGE_PREFIX}${key}` : ''
}

const memoryStore = new Map()
const listenerStore = new Map()

const SESSION_TTL_MS = 1000 * 60 * 60 * 6
const SESSION_CLEANUP_INTERVAL_MS = 1000 * 60 * 5

function isTestEnv() {
  try {
    // Jest sets NODE_ENV to 'test'; also JEST_WORKER_ID is commonly defined
    if (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test') return true
    if (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) return true
  } catch (_) {}
  return false
}

let cleanupTimerId = null
let lastCleanupAt = 0

function canUseSessionStorage() {
  // Avoid using sessionStorage and timers in test environment to prevent act() warnings
  if (isTestEnv()) return false
  return (
    typeof window !== 'undefined' &&
    typeof window.sessionStorage !== 'undefined' &&
    typeof window.setInterval === 'function' &&
    typeof window.clearInterval === 'function'
  )
}

function cleanupExpiredEntries({ now = Date.now(), ttlMs = SESSION_TTL_MS, force = false } = {}) {
  if (isTestEnv()) return
  if (!canUseSessionStorage()) return

  const effectiveTtl = Math.max(0, ttlMs)
  if (!force && effectiveTtl === 0) {
    return
  }

  if (!force && now - lastCleanupAt < SESSION_CLEANUP_INTERVAL_MS / 2) {
    return
  }

  lastCleanupAt = now
  const cutoff = now - effectiveTtl
  const staleKeys = []

  memoryStore.forEach((entry, key) => {
    const updatedAt = Number(entry?.updatedAt ?? 0)
    if (!Number.isFinite(updatedAt) || updatedAt <= cutoff) {
      staleKeys.push(key)
    }
  })

  staleKeys.forEach((key) => {
    clearGameMatchData(key)
  })
}

function ensureCleanupTimer() {
  if (isTestEnv()) return
  if (!canUseSessionStorage()) return
  if (cleanupTimerId != null) return
  cleanupExpiredEntries({ force: true })
  cleanupTimerId = window.setInterval(() => {
    cleanupExpiredEntries()
  }, SESSION_CLEANUP_INTERVAL_MS)
}

function emitUpdate(gameKey, snapshot) {
  if (!gameKey) return
  const listeners = listenerStore.get(gameKey)
  if (!listeners || listeners.size === 0) return
  // 디버그/테스트 유틸 적용: 전달되는 snapshot의 주요 정보 시각화 및 기록
  try {
    const { logError, visualizeState } = require('../../lib/utils/debugTool')
    visualizeState(snapshot, `emitUpdate: 전달된 게임 상태 [${gameKey}]`)
  } catch (e) {}
  listeners.forEach((listener) => {
    if (typeof listener !== 'function') return
    try {
      // 전달되는 snapshot에 주요 상태 정보(게임ID, 턴, 슬롯, 세션 등) 포함
      const enriched = {
        ...safeClone(snapshot),
        __meta: {
          gameKey,
          updatedAt: snapshot?.updatedAt || Date.now(),
          turn: snapshot?.turnState?.turnNumber,
          slots: Array.isArray(snapshot?.slots) ? snapshot.slots.length : undefined,
          sessionId: snapshot?.sessionId || undefined,
        }
      }
      listener(enriched)
    } catch (error) {
      try {
        const { logError } = require('../../lib/utils/debugTool')
        logError(error, '[matchDataStore] 구독자 알림 실패')
      } catch (e) {}
    }
  })
}

function readFromSession(gameId) {
  if (typeof window === 'undefined') return null
  const storageKey = getStorageKey(gameId)
  if (!storageKey) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...createEmptyState(), ...parsed }
  } catch (error) {
    console.warn('[matchDataStore] 세션에서 매칭 데이터를 불러오지 못했습니다:', error)
    return null
  }
}

function persistToSession(gameId, payload) {
  if (typeof window === 'undefined') return
  const storageKey = getStorageKey(gameId)
  if (!storageKey) return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload))
  } catch (error) {
    console.warn('[matchDataStore] 세션에 매칭 데이터를 저장하지 못했습니다:', error)
  }
}

function ensureEntry(gameId) {
  const key = String(gameId || '').trim()
  if (!key) return null
  ensureCleanupTimer()
  cleanupExpiredEntries()
  if (memoryStore.has(key)) {
    return memoryStore.get(key)
  }
  const stored = readFromSession(key)
  const initial = stored ? { ...createEmptyState(), ...stored } : createEmptyState()
  memoryStore.set(key, initial)
  return initial
}

function updateEntry(gameId, updater) {
  const key = String(gameId || '').trim()
  if (!key) return null
  const current = ensureEntry(key)
  if (!current) return null
  const next = { ...current }
  const result = updater(next)
  if (result === false) {
    return safeClone(current)
  }
  next.updatedAt = Date.now()
  memoryStore.set(key, next)
  persistToSession(key, next)
  emitUpdate(key, next)
  return safeClone(next)
}

function sanitizeHeroMap(heroMap) {
  if (!heroMap) return null
  if (heroMap instanceof Map) {
    return safeClone(Object.fromEntries(heroMap.entries()))
  }
  if (typeof heroMap === 'object') {
    return safeClone(heroMap)
  }
  return null
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return []
  return safeClone(list) || []
}

function normalizeRoleLabel(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed
}

function normalizeRoleKey(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function sanitizeParticipantCandidate(entry, fallbackRole) {
  if (!entry) return null

  const role = normalizeRoleLabel(
    entry.role ?? entry.roleName ?? entry.role_label ?? fallbackRole ?? '',
  )
  const ownerId = entry.ownerId ?? entry.owner_id ?? entry.ownerID ?? null
  const heroId = entry.heroId ?? entry.hero_id ?? entry.heroID ?? null

  const ownerKey = ownerId != null ? String(ownerId).trim() : ''
  if (!ownerKey) return null

  return {
    ownerId: ownerKey,
    role,
    roleKey: normalizeRoleKey(role),
    heroId: heroId != null ? String(heroId).trim() : null,
    heroName:
      typeof entry.heroName === 'string'
        ? entry.heroName
        : typeof entry.hero_name === 'string'
        ? entry.hero_name
        : '',
    score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
    rating: Number.isFinite(Number(entry.rating)) ? Number(entry.rating) : null,
  }
}

function sanitizeParticipantPool(pool = [], fallbackRole) {
  if (!Array.isArray(pool)) return []
  const seen = new Set()
  const result = []
  pool.forEach((entry) => {
    const candidate = sanitizeParticipantCandidate(entry, fallbackRole)
    if (!candidate) return
    if (seen.has(candidate.ownerId)) return
    seen.add(candidate.ownerId)
    result.push(candidate)
  })
  return result
}

function sanitizeSlotTemplateSlots(slots) {
  if (!Array.isArray(slots)) return []
  return slots
    .map((slot, index) => {
      if (!slot) return null
      const slotIndex = Number(slot.slotIndex ?? slot.slot_index)
      return {
        slotId: slot.slotId ?? slot.slot_id ?? null,
        slotIndex: Number.isFinite(slotIndex) ? slotIndex : index,
        role: typeof slot.role === 'string' ? slot.role.trim() : slot.role || '',
        ownerId:
          slot.ownerId != null
            ? String(slot.ownerId).trim()
            : slot.owner_id != null
            ? String(slot.owner_id).trim()
            : '',
        heroId:
          slot.heroId != null
            ? String(slot.heroId).trim()
            : slot.hero_id != null
            ? String(slot.hero_id).trim()
            : '',
        heroName:
          typeof slot.heroName === 'string'
            ? slot.heroName
            : typeof slot.hero_name === 'string'
            ? slot.hero_name
            : '',
        ready: slot.ready === true || slot.occupant_ready === true,
        joinedAt: slot.joinedAt ?? slot.joined_at ?? null,
      }
    })
    .filter(Boolean)
}

function sanitizeSlotTemplateRoles(roles) {
  if (!Array.isArray(roles)) return []
  return roles
    .map((role, index) => {
      if (!role) return null
      const members = Array.isArray(role.members)
        ? role.members
            .map((member, memberIndex) => {
              if (!member) return null
              const slotIndex = Number(member.slotIndex ?? member.slot_index)
              return {
                ownerId:
                  member.ownerId != null
                    ? String(member.ownerId).trim()
                    : member.owner_id != null
                    ? String(member.owner_id).trim()
                    : '',
                heroId:
                  member.heroId != null
                    ? String(member.heroId).trim()
                    : member.hero_id != null
                    ? String(member.hero_id).trim()
                    : '',
                heroName:
                  typeof member.heroName === 'string'
                    ? member.heroName
                    : typeof member.hero_name === 'string'
                    ? member.hero_name
                    : '',
                ready: member.ready === true,
                slotIndex: Number.isFinite(slotIndex) ? slotIndex : memberIndex,
              }
            })
            .filter(Boolean)
        : []
      const sanitizedSlots = Array.isArray(role.roleSlots)
        ? sanitizeSlotTemplateSlots(role.roleSlots)
        : []
      const slotCount = Number(role.slots)
      return {
        role: typeof role.role === 'string' ? role.role.trim() : role.role || `역할 ${index + 1}`,
        slots: Number.isFinite(slotCount) && slotCount >= 0 ? slotCount : sanitizedSlots.length || members.length,
        members,
        roleSlots: sanitizedSlots,
      }
    })
    .filter(Boolean)
}

function sanitizeSlotTemplatePayload(payload, previous) {
  if (payload === null) {
    const cleared = createEmptySlotTemplate()
    cleared.updatedAt = Date.now()
    return cleared
  }

  const base = previous ? safeClone(previous) || createEmptySlotTemplate() : createEmptySlotTemplate()
  const next = { ...createEmptySlotTemplate(), ...base }

  if (payload && typeof payload === 'object') {
    if (payload.slots !== undefined) {
      next.slots = sanitizeSlotTemplateSlots(payload.slots)
    }
    if (payload.roles !== undefined) {
      next.roles = sanitizeSlotTemplateRoles(payload.roles)
    }
    if (payload.version !== undefined) {
      const numericVersion = Number(payload.version)
      if (Number.isFinite(numericVersion)) {
        next.version = numericVersion
      }
    }
    if (payload.source !== undefined) {
      next.source = typeof payload.source === 'string' ? payload.source.trim() : next.source || ''
    }
    if (payload.updatedAt !== undefined) {
      const updatedAt = Number(payload.updatedAt)
      if (Number.isFinite(updatedAt)) {
        next.updatedAt = updatedAt
      }
    }
  }

  if (!next.updatedAt) {
    next.updatedAt = Date.now()
  }

  return next
}

function sanitizeSessionMetaPatch(patch, previous) {
  if (patch === null) {
    const cleared = createEmptySessionMeta()
    cleared.updatedAt = Date.now()
    return cleared
  }

  const base = previous ? safeClone(previous) || createEmptySessionMeta() : createEmptySessionMeta()
  const next = { ...createEmptySessionMeta(), ...base }

  let explicitUpdatedAt = null

  if (patch && typeof patch === 'object') {
    if (patch.turnTimer !== undefined) {
      const cloned = safeClone(patch.turnTimer)
      next.turnTimer = cloned === undefined ? null : cloned
    }
    if (patch.vote !== undefined) {
      const cloned = safeClone(patch.vote)
      next.vote = cloned === undefined ? null : cloned
    }
    if (patch.dropIn !== undefined) {
      const cloned = safeClone(patch.dropIn)
      next.dropIn = cloned === undefined ? null : cloned
    }
    if (patch.asyncFill !== undefined) {
      const cloned = safeClone(patch.asyncFill)
      next.asyncFill = cloned === undefined ? null : cloned
    }
    if (patch.turnState !== undefined) {
      next.turnState = sanitizeTurnStatePatch(patch.turnState, next.turnState)
    }
    if (patch.extras !== undefined) {
      const cloned = safeClone(patch.extras)
      next.extras = cloned === undefined ? null : cloned
    }
    if (patch.source !== undefined) {
      next.source = typeof patch.source === 'string' ? patch.source.trim() : next.source || ''
    }

    explicitUpdatedAt = normalizeTimestampInput(
      patch.updatedAt ?? patch.updated_at ?? patch.updated_at_ms ?? null,
    )
    if (explicitUpdatedAt !== null) {
      next.updatedAt = explicitUpdatedAt
    }
  }

  return next
}

function sanitizeTurnStatePatch(patch, previous) {
  if (patch === null) {
    const cleared = createEmptyTurnState()
    cleared.updatedAt = Date.now()
    return cleared
  }

  const base = previous && typeof previous === 'object' ? safeClone(previous) || createEmptyTurnState() : createEmptyTurnState()
  const next = { ...createEmptyTurnState(), ...base }

  let explicitUpdatedAt = null

  if (patch && typeof patch === 'object') {
    if (patch.version !== undefined) {
      const numericVersion = Number(patch.version)
      if (Number.isFinite(numericVersion) && numericVersion > 0) {
        next.version = Math.floor(numericVersion)
      }
    }
    if (patch.turnNumber !== undefined) {
      const turnNumber = Number(patch.turnNumber)
      if (Number.isFinite(turnNumber) && turnNumber >= 0) {
        next.turnNumber = Math.floor(turnNumber)
      }
    }
    if (patch.scheduledAt !== undefined) {
      const scheduledAt = Number(patch.scheduledAt)
      next.scheduledAt = Number.isFinite(scheduledAt) && scheduledAt > 0 ? scheduledAt : 0
    }
    if (patch.deadline !== undefined) {
      const deadline = Number(patch.deadline)
      next.deadline = Number.isFinite(deadline) && deadline > 0 ? deadline : 0
    }
    if (patch.durationSeconds !== undefined) {
      const duration = Number(patch.durationSeconds)
      next.durationSeconds = Number.isFinite(duration) && duration >= 0 ? duration : 0
    }
    if (patch.remainingSeconds !== undefined) {
      const remaining = Number(patch.remainingSeconds)
      next.remainingSeconds = Number.isFinite(remaining) && remaining >= 0 ? remaining : 0
    }
    if (patch.status !== undefined) {
      next.status = typeof patch.status === 'string' ? patch.status.trim() : next.status || ''
    }
    if (patch.dropInBonusSeconds !== undefined) {
      const bonus = Number(patch.dropInBonusSeconds)
      next.dropInBonusSeconds = Number.isFinite(bonus) && bonus >= 0 ? bonus : 0
    }
    if (patch.dropInBonusAppliedAt !== undefined) {
      const appliedAt = Number(patch.dropInBonusAppliedAt)
      next.dropInBonusAppliedAt = Number.isFinite(appliedAt) && appliedAt > 0 ? appliedAt : 0
    }
    if (patch.dropInBonusTurn !== undefined) {
      const bonusTurn = Number(patch.dropInBonusTurn)
      next.dropInBonusTurn = Number.isFinite(bonusTurn) && bonusTurn >= 0 ? Math.floor(bonusTurn) : 0
    }
    if (patch.source !== undefined) {
      next.source = typeof patch.source === 'string' ? patch.source.trim() : next.source || ''
    }

    explicitUpdatedAt = normalizeTimestampInput(
      patch.updatedAt ?? patch.updated_at ?? patch.updated_at_ms ?? null,
    )
    if (explicitUpdatedAt !== null) {
      next.updatedAt = explicitUpdatedAt
    }
  }

  return next
}

function normalizeTurnStateForComparison(value) {
  const base = createEmptyTurnState()
  const snapshot = value && typeof value === 'object' ? safeClone(value) || {} : {}
  const normalized = { ...base, ...snapshot }
  normalized.updatedAt = 0
  return normalized
}

function normalizeSessionMetaForComparison(value) {
  const base = createEmptySessionMeta()
  const snapshot = value && typeof value === 'object' ? safeClone(value) || {} : {}
  const normalized = { ...base, ...snapshot }
  normalized.turnState = normalizeTurnStateForComparison(snapshot.turnState)
  normalized.updatedAt = 0
  return normalized
}

function sessionMetaStructurallyEqual(next, previous) {
  const nextNormalized = normalizeSessionMetaForComparison(next)
  const prevNormalized = normalizeSessionMetaForComparison(previous)
  return JSON.stringify(nextNormalized) === JSON.stringify(prevNormalized)
}

function buildAsyncFillSnapshot({
  roster = [],
  participantPool = [],
  realtimeMode = REALTIME_MODES.OFF,
  hostOwnerId = null,
  hostRoleLimit = null,
}) {
  const normalizedMode = normalizeRealtimeMode(realtimeMode)
  if (normalizedMode !== REALTIME_MODES.OFF) {
    return null
  }

  const ownerKey = hostOwnerId != null ? String(hostOwnerId).trim() : ''
  const rosterEntries = Array.isArray(roster) ? roster.slice() : []
  if (!rosterEntries.length) {
    return {
      mode: REALTIME_MODES.OFF,
      hostOwnerId: ownerKey || null,
      hostRole: null,
      seatLimit: { allowed: 0, total: 0 },
      seatIndexes: [],
      pendingSeatIndexes: [],
      assigned: [],
      overflow: [],
      fillQueue: [],
      poolSize: 0,
      generatedAt: Date.now(),
    }
  }

  const orderedRoster = rosterEntries
    .map((entry, index) => ({
      slotIndex: Number.isFinite(Number(entry?.slotIndex)) ? Number(entry.slotIndex) : index,
      slotId: entry?.slotId ?? null,
      ownerId: entry?.ownerId != null ? String(entry.ownerId).trim() : null,
      heroId: entry?.heroId != null ? String(entry.heroId).trim() : null,
      heroName: typeof entry?.heroName === 'string' ? entry.heroName : '',
      role: normalizeRoleLabel(entry?.role || '역할 미지정'),
      ready: !!entry?.ready,
      joinedAt: entry?.joinedAt || null,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex)

  let hostRole = ''
  if (ownerKey) {
    const hostSeat = orderedRoster.find((entry) => entry.ownerId === ownerKey)
    if (hostSeat) {
      hostRole = hostSeat.role
    }
  }
  if (!hostRole) {
    const firstSeat = orderedRoster.find((entry) => entry.role)
    hostRole = firstSeat ? firstSeat.role : '역할 미지정'
  }
  const hostRoleKey = normalizeRoleKey(hostRole)

  const hostRoleSeats = orderedRoster.filter(
    (entry) => normalizeRoleKey(entry.role) === hostRoleKey,
  )
  const totalHostSeats = hostRoleSeats.length
  const cap = Number.isFinite(Number(hostRoleLimit))
    ? Math.max(1, Math.min(Math.floor(Number(hostRoleLimit)), totalHostSeats || 0))
    : Math.min(totalHostSeats || 0, 3)
  const allowedSeats = cap > 0 ? cap : Math.min(totalHostSeats || 0, 3)

  const seatIndexes = hostRoleSeats.slice(0, allowedSeats).map((entry) => entry.slotIndex)
  const assignedSeats = hostRoleSeats.slice(0, allowedSeats)
  const overflowSeats = hostRoleSeats.slice(allowedSeats)

  const pendingSeats = assignedSeats
    .filter((entry) => !entry.ownerId)
    .map((entry) => entry.slotIndex)

  const occupantIds = new Set(
    assignedSeats.filter((entry) => entry.ownerId).map((entry) => entry.ownerId),
  )

  const candidatePool = sanitizeParticipantPool(participantPool, hostRole)
    .filter((candidate) => candidate.roleKey === hostRoleKey)
    .filter((candidate) => !occupantIds.has(candidate.ownerId))

  const queue = []
  if (pendingSeats.length > 0 && candidatePool.length > 0) {
    const remaining = pendingSeats.length
    const sorted = candidatePool.slice().sort((a, b) => a.ownerId.localeCompare(b.ownerId))
    for (let index = 0; index < sorted.length && queue.length < remaining; index += 1) {
      queue.push(sorted[index])
    }
  }

  return {
    mode: REALTIME_MODES.OFF,
    hostOwnerId: ownerKey || null,
    hostRole,
    seatLimit: {
      allowed: allowedSeats,
      total: totalHostSeats,
    },
    seatIndexes,
    pendingSeatIndexes: pendingSeats,
    assigned: assignedSeats.map((entry) => ({
      slotIndex: entry.slotIndex,
      slotId: entry.slotId,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName,
      ready: entry.ready,
      joinedAt: entry.joinedAt,
    })),
    overflow: overflowSeats.map((entry) => ({
      slotIndex: entry.slotIndex,
      slotId: entry.slotId,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName,
      ready: entry.ready,
      joinedAt: entry.joinedAt,
    })),
    fillQueue: queue,
    poolSize: candidatePool.length,
    generatedAt: Date.now(),
  }
}

export function hydrateGameMatchData(gameId) {
  const entry = ensureEntry(gameId)
  return safeClone(entry)
}

export function readGameMatchData(gameId) {
  if (!memoryStore.has(String(gameId || '').trim())) {
    return hydrateGameMatchData(gameId)
  }
  return safeClone(memoryStore.get(String(gameId || '').trim()))
}

export function setGameMatchParticipation(gameId, payload = {}) {
  const roster = sanitizeList(payload.roster)
  const heroOptions = sanitizeList(payload.heroOptions)
  const participantPool = sanitizeList(payload.participantPool)
  const heroMap = sanitizeHeroMap(payload.heroMap)
  const realtimeMode = payload.realtimeMode ?? payload.mode ?? REALTIME_MODES.OFF
  const hostOwnerId = payload.hostOwnerId ?? null
  const hostRoleLimit = payload.hostRoleLimit ?? null
  const updatedAt = Date.now()
  return updateEntry(gameId, (entry) => {
    entry.participation = {
      roster,
      heroOptions,
      participantPool,
      heroMap,
      updatedAt,
    }

    const asyncFillSnapshot = buildAsyncFillSnapshot({
      roster,
      participantPool,
      realtimeMode,
      hostOwnerId,
      hostRoleLimit,
    })

    entry.sessionMeta = sanitizeSessionMetaPatch(
      {
        asyncFill: asyncFillSnapshot,
        source: 'match-participation',
      },
      entry.sessionMeta,
    )
  })
}

export function setGameMatchHeroSelection(gameId, payload = {}) {
  const heroId = payload.heroId != null ? String(payload.heroId).trim() : ''
  const viewerId = payload.viewerId != null ? String(payload.viewerId).trim() : ''
  const role = payload.role != null ? String(payload.role).trim() : ''
  const ownerId = payload.ownerId != null ? String(payload.ownerId).trim() : viewerId
  const heroMeta = safeClone(payload.heroMeta)
  const updatedAt = Date.now()
  return updateEntry(gameId, (entry) => {
    entry.heroSelection = {
      heroId,
      viewerId,
      ownerId,
      role,
      heroMeta,
      updatedAt,
    }
  })
}

export function setGameMatchSnapshot(gameId, payload = {}) {
  const snapshot = {
    match: safeClone(payload.match) || null,
    pendingMatch: safeClone(payload.pendingMatch) || null,
    viewerId: payload.viewerId != null ? String(payload.viewerId).trim() : '',
    heroId: payload.heroId != null ? String(payload.heroId).trim() : '',
    role: payload.role != null ? String(payload.role).trim() : '',
    mode: payload.mode != null ? String(payload.mode).trim() : '',
    createdAt: payload.createdAt || Date.now(),
  }
  return updateEntry(gameId, (entry) => {
    entry.matchSnapshot = snapshot
  })
}

export function setGameMatchSlotTemplate(gameId, payload = {}) {
  return updateEntry(gameId, (entry) => {
    entry.slotTemplate = sanitizeSlotTemplatePayload(payload, entry.slotTemplate)
  })
}

export function setGameMatchSessionMeta(gameId, payload = {}) {
  const explicitUpdatedAt =
    payload && typeof payload === 'object'
      ? normalizeTimestampInput(payload.updatedAt ?? payload.updated_at ?? payload.updated_at_ms ?? null)
      : null

  return updateEntry(gameId, (entry) => {
    const previous = entry.sessionMeta || createEmptySessionMeta()
    const sanitized = sanitizeSessionMetaPatch(payload, previous)

    const previousUpdatedAt = normalizeTimestampInput(previous.updatedAt)
    const turnStateTimestampPrev = normalizeTimestampInput(previous?.turnState?.updatedAt)
    const turnStateTimestampNext = normalizeTimestampInput(sanitized?.turnState?.updatedAt)
    const hasStructuralChange = !sessionMetaStructurallyEqual(sanitized, previous)
    const turnStateTimestampChanged =
      turnStateTimestampNext !== null && turnStateTimestampNext !== turnStateTimestampPrev

    if (!hasStructuralChange && !turnStateTimestampChanged && explicitUpdatedAt === null) {
      return false
    }

    if (!hasStructuralChange && !turnStateTimestampChanged) {
      if (explicitUpdatedAt !== null && explicitUpdatedAt !== previousUpdatedAt) {
        entry.sessionMeta = { ...previous, updatedAt: explicitUpdatedAt }
        return
      }
      return false
    }

    const targetUpdatedAt =
      explicitUpdatedAt !== null
        ? explicitUpdatedAt
        : turnStateTimestampChanged && turnStateTimestampNext !== null
        ? turnStateTimestampNext
        : previousUpdatedAt ?? Date.now()

    entry.sessionMeta = {
      ...sanitized,
      turnState: sanitized?.turnState ? { ...sanitized.turnState } : createEmptyTurnState(),
      updatedAt: targetUpdatedAt,
    }
  })
}

export function setGameMatchSessionHistory(gameId, payload = {}) {
  return updateEntry(gameId, (entry) => {
    entry.sessionHistory = sanitizeSessionHistoryPayload(payload, entry.sessionHistory)
  })
}

export function setGameMatchPostCheck(gameId, postCheck) {
  const sanitized = safeClone(postCheck)
  if (sanitized === undefined) return hydrateGameMatchData(gameId)
  return updateEntry(gameId, (entry) => {
    entry.postCheck = sanitized
  })
}

export function setGameMatchConfirmation(gameId, confirmation) {
  const sanitized = safeClone(confirmation)
  if (!sanitized) return hydrateGameMatchData(gameId)
  return updateEntry(gameId, (entry) => {
    entry.confirmation = sanitized
  })
}

export function clearGameMatchData(gameId) {
  const key = String(gameId || '').trim()
  if (!key) return
  memoryStore.delete(key)
  if (typeof window !== 'undefined') {
    const storageKey = getStorageKey(key)
    try {
      if (storageKey) {
        window.sessionStorage.removeItem(storageKey)
      }
    } catch (error) {
      console.warn('[matchDataStore] 세션에서 매칭 데이터를 삭제하지 못했습니다:', error)
    }
  }
  emitUpdate(key, createEmptyState())
}

export function consumeGameMatchData(gameId) {
  const snapshot = readGameMatchData(gameId)
  clearGameMatchData(gameId)
  return snapshot
}

export function cleanupStaleGameMatchData(options = {}) {
  cleanupExpiredEntries({ ...options, force: true })
}

export function subscribeGameMatchData(gameId, listener) {
  const key = String(gameId || '').trim()
  if (!key) return () => {}
  if (typeof listener !== 'function') return () => {}
  ensureCleanupTimer()
  let listeners = listenerStore.get(key)
  if (!listeners) {
    listeners = new Set()
    listenerStore.set(key, listeners)
  }
  listeners.add(listener)
  return () => {
    const set = listenerStore.get(key)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) {
      listenerStore.delete(key)
    }
  }
}
