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

function getStorageKey(gameId) {
  if (!gameId && gameId !== 0) return ''
  const key = String(gameId).trim()
  return key ? `${STORAGE_PREFIX}${key}` : ''
}

const memoryStore = new Map()

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
  updater(next)
  next.updatedAt = Date.now()
  memoryStore.set(key, next)
  persistToSession(key, next)
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
  }

  next.updatedAt = Date.now()
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
  }

  next.updatedAt = Date.now()
  return next
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
  const updatedAt = Date.now()
  return updateEntry(gameId, (entry) => {
    entry.participation = {
      roster,
      heroOptions,
      participantPool,
      heroMap,
      updatedAt,
    }
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
  return updateEntry(gameId, (entry) => {
    entry.sessionMeta = sanitizeSessionMetaPatch(payload, entry.sessionMeta)
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
}

export function consumeGameMatchData(gameId) {
  const snapshot = readGameMatchData(gameId)
  clearGameMatchData(gameId)
  return snapshot
}
