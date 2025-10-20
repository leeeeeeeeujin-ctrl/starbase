import {
  readGameMatchData,
  clearGameMatchData,
} from '../../modules/rank/matchDataStore'
import { readRankAuthSnapshot, createEmptyRankAuthSnapshot } from './rankAuthStorage'
import {
  createEmptyRankKeyringSnapshot,
  hasActiveKeyInSnapshot,
  readRankKeyringSnapshot,
} from './keyringStorage'

const EMPTY_SLOT_TEMPLATE = Object.freeze({
  slots: [],
  roles: [],
  version: 0,
  source: '',
  updatedAt: 0,
})

const EMPTY_TURN_STATE = Object.freeze({
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
})

const EMPTY_SESSION_META = Object.freeze({
  turnTimer: null,
  vote: null,
  dropIn: null,
  asyncFill: null,
  turnState: EMPTY_TURN_STATE,
  extras: null,
  source: '',
  updatedAt: 0,
})

const EMPTY_SESSION_HISTORY = Object.freeze({
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
})

const EMPTY_MATCH_FLOW_STATE = {
  snapshot: null,
  roster: [],
  assignments: [],
  viewer: {
    heroId: '',
    role: '',
    ownerId: '',
    viewerId: '',
    heroName: '',
  },
  room: null,
  matchMode: '',
  matchInstanceId: '',
  hasActiveKey: false,
  rosterReadyCount: 0,
  totalSlots: 0,
  authSnapshot: createEmptyRankAuthSnapshot(),
  keyringSnapshot: createEmptyRankKeyringSnapshot(),
  raw: null,
  slotTemplate: EMPTY_SLOT_TEMPLATE,
  slotTemplateVersion: 0,
  slotTemplateUpdatedAt: 0,
  sessionMeta: EMPTY_SESSION_META,
  sessionHistory: EMPTY_SESSION_HISTORY,
}

export function createEmptyMatchFlowState(overrides = {}) {
  const {
    authSnapshot: overrideAuth,
    keyringSnapshot: overrideKeyring,
    slotTemplate: overrideSlotTemplate,
    sessionMeta: overrideSessionMeta,
    sessionHistory: overrideSessionHistory,
    slotTemplateVersion: overrideSlotVersion,
    slotTemplateUpdatedAt: overrideSlotUpdatedAt,
    ...rest
  } = overrides || {}
  const authSnapshot = overrideAuth
    ? { ...createEmptyRankAuthSnapshot(), ...overrideAuth }
    : createEmptyRankAuthSnapshot()
  const keyringSnapshot = overrideKeyring
    ? { ...createEmptyRankKeyringSnapshot(), ...overrideKeyring }
    : createEmptyRankKeyringSnapshot()

  const slotTemplate = overrideSlotTemplate
    ? { ...EMPTY_SLOT_TEMPLATE, ...overrideSlotTemplate }
    : { ...EMPTY_SLOT_TEMPLATE }
  const sessionMeta = overrideSessionMeta
    ? {
        ...EMPTY_SESSION_META,
        ...overrideSessionMeta,
        turnState: {
          ...EMPTY_TURN_STATE,
          ...(overrideSessionMeta.turnState || {}),
        },
      }
    : { ...EMPTY_SESSION_META }
  const slotTemplateVersion =
    overrideSlotVersion != null ? overrideSlotVersion : slotTemplate.version || 0
  const slotTemplateUpdatedAt =
    overrideSlotUpdatedAt != null ? overrideSlotUpdatedAt : slotTemplate.updatedAt || 0
  const sessionHistory = overrideSessionHistory
    ? { ...EMPTY_SESSION_HISTORY, ...overrideSessionHistory }
    : { ...EMPTY_SESSION_HISTORY }

  return {
    ...EMPTY_MATCH_FLOW_STATE,
    authSnapshot,
    keyringSnapshot,
    slotTemplate,
    slotTemplateVersion,
    slotTemplateUpdatedAt,
    sessionMeta,
    sessionHistory,
    ...rest,
  }
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toString(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim()
  return trimmed
}

function deepClone(value) {
  if (value === null || value === undefined) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return null
  }
}

function sanitizeRoster(roster) {
  if (!Array.isArray(roster)) return []
  return roster
    .map((entry, index) => {
      if (!entry) return null
      return {
        slotId: entry.slotId ?? null,
        slotIndex: toNumber(entry.slotIndex) ?? index,
        role: entry.role || '역할 미지정',
        ownerId: toString(entry.ownerId),
        heroId: toString(entry.heroId),
        heroName: entry.heroName || '',
        ready: !!entry.ready,
        joinedAt: entry.joinedAt || null,
        standin: entry.standin === true,
        matchSource:
          entry.matchSource != null
            ? String(entry.matchSource).trim()
            : entry.standin
              ? 'participant_pool'
              : '',
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0))
}

function sanitizeAssignments(assignments) {
  if (!Array.isArray(assignments)) return []
  return assignments
    .map((assignment, index) => {
      if (!assignment) return null
      const roleName = assignment.role || `역할 ${index + 1}`
      const members = Array.isArray(assignment.members)
        ? assignment.members.map((member, memberIndex) => ({
            ownerId: toString(member?.ownerId),
            heroId: toString(member?.heroId),
            heroName: member?.heroName || '',
            ready: !!member?.ready,
            slotIndex: toNumber(member?.slotIndex) ?? memberIndex,
            standin: member?.standin === true,
            matchSource:
              member?.matchSource != null
                ? String(member.matchSource).trim()
                : member?.standin
                  ? 'participant_pool'
                  : '',
          }))
        : []
      return {
        role: roleName,
        members,
      }
    })
    .filter(Boolean)
}

function normalizeTemplateRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return []
  return rawRoles
    .map((role, index) => {
      if (!role) return null
      const roleName = role.role ? toString(role.role) : `역할 ${index + 1}`
      const slotsValue = toNumber(role.slots)
      const members = Array.isArray(role.members)
        ? role.members
            .map((member, memberIndex) => {
              if (!member) return null
              const memberSlotIndex = toNumber(member.slotIndex ?? member.slot_index)
              return {
                ownerId: toString(member.ownerId ?? member.owner_id),
                heroId: toString(member.heroId ?? member.hero_id),
                heroName: member.heroName || member.hero_name || '',
                ready: !!member.ready,
                slotIndex: memberSlotIndex ?? memberIndex,
              }
            })
            .filter(Boolean)
        : []
      return {
        role: roleName || `역할 ${index + 1}`,
        slots: slotsValue != null && slotsValue >= 0 ? slotsValue : members.length,
        members,
      }
    })
    .filter(Boolean)
}

function normalizeSlotTemplate(rawSlotTemplate, snapshot) {
  const base = {
    slots: [],
    roles: [],
    version: 0,
    source: '',
    updatedAt: 0,
  }

  if (rawSlotTemplate && typeof rawSlotTemplate === 'object') {
    if (Array.isArray(rawSlotTemplate.slots)) {
      base.slots = sanitizeRoster(rawSlotTemplate.slots)
    }
    if (Array.isArray(rawSlotTemplate.roles)) {
      base.roles = normalizeTemplateRoles(rawSlotTemplate.roles)
    }
    const versionValue = toNumber(rawSlotTemplate.version)
    if (versionValue != null) {
      base.version = versionValue
    }
    const updatedAtValue = toNumber(rawSlotTemplate.updatedAt)
    if (updatedAtValue != null) {
      base.updatedAt = updatedAtValue
    }
    if (typeof rawSlotTemplate.source === 'string') {
      const trimmed = rawSlotTemplate.source.trim()
      if (trimmed) base.source = trimmed
    }
  }

  if (!base.slots.length && snapshot) {
    const fallbackSlots = sanitizeRoster(
      (snapshot.match?.roleStatus && snapshot.match.roleStatus.slotLayout) || snapshot.match?.slotLayout,
    )
    if (fallbackSlots.length) {
      base.slots = fallbackSlots
    }
    if (Array.isArray(snapshot.match?.roles)) {
      base.roles = normalizeTemplateRoles(snapshot.match.roles)
    }
    const fallbackVersion =
      toNumber(snapshot.match?.roleStatus?.version) ?? toNumber(snapshot.match?.roleStatus?.updatedAt)
    if (fallbackVersion != null && fallbackVersion > base.version) {
      base.version = fallbackVersion
    }
    const fallbackUpdatedAt = toNumber(snapshot.match?.roleStatus?.updatedAt)
    if (fallbackUpdatedAt != null) {
      base.updatedAt = fallbackUpdatedAt
    }
    if (!base.source) {
      base.source = 'snapshot'
    }
    if (!base.updatedAt) {
      base.updatedAt = Date.now()
    }
  }

  return base
}

function normalizeSessionMeta(rawSessionMeta, snapshot) {
  const base = {
    turnTimer: null,
    vote: null,
    dropIn: null,
    asyncFill: null,
    turnState: { ...EMPTY_TURN_STATE },
    extras: null,
    source: '',
    updatedAt: 0,
  }

  if (rawSessionMeta && typeof rawSessionMeta === 'object') {
    if (rawSessionMeta.turnTimer !== undefined) {
      const cloned = deepClone(rawSessionMeta.turnTimer)
      base.turnTimer = cloned === undefined ? null : cloned
    }
    if (rawSessionMeta.vote !== undefined) {
      const cloned = deepClone(rawSessionMeta.vote)
      base.vote = cloned === undefined ? null : cloned
    }
    if (rawSessionMeta.dropIn !== undefined) {
      const cloned = deepClone(rawSessionMeta.dropIn)
      base.dropIn = cloned === undefined ? null : cloned
    }
    if (rawSessionMeta.asyncFill !== undefined) {
      const cloned = deepClone(rawSessionMeta.asyncFill)
      base.asyncFill = cloned === undefined ? null : cloned
    }
    if (rawSessionMeta.turnState !== undefined) {
      base.turnState = normalizeTurnState(rawSessionMeta.turnState)
    }
    if (rawSessionMeta.extras !== undefined) {
      const cloned = deepClone(rawSessionMeta.extras)
      base.extras = cloned === undefined ? null : cloned
    }
    if (rawSessionMeta.source !== undefined) {
      const trimmed = typeof rawSessionMeta.source === 'string' ? rawSessionMeta.source.trim() : ''
      if (trimmed) base.source = trimmed
    }
    const updatedAtValue = toNumber(rawSessionMeta.updatedAt)
    if (updatedAtValue != null) {
      base.updatedAt = updatedAtValue
    }
  }

  if (!base.turnTimer && snapshot?.match?.turnTimer) {
    const cloned = deepClone(snapshot.match.turnTimer)
    base.turnTimer = cloned === undefined ? null : cloned
  }
  if (!base.vote && snapshot?.match?.turnTimer?.vote) {
    const cloned = deepClone(snapshot.match.turnTimer.vote)
    base.vote = cloned === undefined ? null : cloned
  }
  if (!base.dropIn && snapshot?.match?.dropInMeta) {
    const cloned = deepClone(snapshot.match.dropInMeta)
    base.dropIn = cloned === undefined ? null : cloned
  }
  if (!base.asyncFill && snapshot?.match?.asyncFillMeta) {
    const cloned = deepClone(snapshot.match.asyncFillMeta)
    base.asyncFill = cloned === undefined ? null : cloned
  }

  if (!rawSessionMeta?.turnState && snapshot?.match?.turnState) {
    base.turnState = normalizeTurnState(snapshot.match.turnState)
  }

  return base
}

function normalizeHistoryTurn(turn, index) {
  if (!turn || typeof turn !== 'object') {
    return {
      id: null,
      idx: index,
      role: 'system',
      content: '',
      public: true,
      isVisible: true,
      createdAt: null,
      summaryPayload: null,
      metadata: null,
    }
  }

  const idxValue = Number(turn.idx)
  const role = turn.role != null ? String(turn.role).trim() : ''
  const content = turn.content != null ? String(turn.content) : ''
  const summaryPayload =
    turn.summaryPayload != null
      ? deepClone(turn.summaryPayload)
      : turn.summary_payload != null
      ? deepClone(turn.summary_payload)
      : null
  const metadata = turn.metadata != null ? deepClone(turn.metadata) : null

  return {
    id:
      turn.id != null
        ? String(turn.id).trim() || null
        : turn.turn_id != null
        ? String(turn.turn_id).trim() || null
        : null,
    idx: Number.isFinite(idxValue) ? idxValue : index,
    role: role || 'system',
    content,
    public: turn.public !== false,
    isVisible: turn.isVisible !== false && turn.is_visible !== false,
    createdAt: turn.createdAt || turn.created_at || null,
    summaryPayload,
    metadata,
  }
}

function normalizeSessionHistory(rawHistory) {
  if (!rawHistory || typeof rawHistory !== 'object') {
    return { ...EMPTY_SESSION_HISTORY }
  }

  const base = { ...EMPTY_SESSION_HISTORY }
  const turns = Array.isArray(rawHistory.turns) ? rawHistory.turns : []
  base.turns = turns.map((turn, index) => normalizeHistoryTurn(turn, index))

  if (rawHistory.sessionId !== undefined) {
    const sessionId = String(rawHistory.sessionId || '').trim()
    base.sessionId = sessionId || null
  }

  if (rawHistory.totalCount !== undefined) {
    const total = Number(rawHistory.totalCount)
    base.totalCount = Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0
  }

  if (rawHistory.publicCount !== undefined) {
    const publicCount = Number(rawHistory.publicCount)
    base.publicCount = Number.isFinite(publicCount) && publicCount >= 0 ? Math.floor(publicCount) : 0
  }

  if (rawHistory.hiddenCount !== undefined) {
    const hiddenCount = Number(rawHistory.hiddenCount)
    base.hiddenCount = Number.isFinite(hiddenCount) && hiddenCount >= 0 ? Math.floor(hiddenCount) : 0
  }

  if (rawHistory.suppressedCount !== undefined) {
    const suppressedCount = Number(rawHistory.suppressedCount)
    base.suppressedCount =
      Number.isFinite(suppressedCount) && suppressedCount >= 0 ? Math.floor(suppressedCount) : 0
  }

  if (rawHistory.truncated !== undefined) {
    base.truncated = Boolean(rawHistory.truncated)
  }

  if (rawHistory.lastIdx !== undefined) {
    const lastIdx = Number(rawHistory.lastIdx)
    base.lastIdx = Number.isFinite(lastIdx) ? Math.floor(lastIdx) : null
  }

  if (rawHistory.updatedAt !== undefined) {
    const updatedAt = Number(rawHistory.updatedAt)
    base.updatedAt = Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : 0
  }

  if (rawHistory.source !== undefined) {
    base.source = typeof rawHistory.source === 'string' ? rawHistory.source.trim() : ''
  }

  if (rawHistory.diagnostics !== undefined) {
    const diagnostics = deepClone(rawHistory.diagnostics)
    base.diagnostics = diagnostics === undefined ? null : diagnostics
  }

  return base
}

function normalizeTurnState(rawTurnState) {
  const normalized = { ...EMPTY_TURN_STATE }
  if (!rawTurnState || typeof rawTurnState !== 'object') {
    return normalized
  }

  if (rawTurnState.version !== undefined) {
    const version = Number(rawTurnState.version)
    if (Number.isFinite(version) && version > 0) {
      normalized.version = Math.floor(version)
    }
  }
  if (rawTurnState.turnNumber !== undefined) {
    const turnNumber = Number(rawTurnState.turnNumber)
    if (Number.isFinite(turnNumber) && turnNumber >= 0) {
      normalized.turnNumber = Math.floor(turnNumber)
    }
  }
  if (rawTurnState.scheduledAt !== undefined) {
    const scheduledAt = Number(rawTurnState.scheduledAt)
    normalized.scheduledAt = Number.isFinite(scheduledAt) && scheduledAt > 0 ? scheduledAt : 0
  }
  if (rawTurnState.deadline !== undefined) {
    const deadline = Number(rawTurnState.deadline)
    normalized.deadline = Number.isFinite(deadline) && deadline > 0 ? deadline : 0
  }
  if (rawTurnState.durationSeconds !== undefined) {
    const duration = Number(rawTurnState.durationSeconds)
    normalized.durationSeconds = Number.isFinite(duration) && duration >= 0 ? duration : 0
  }
  if (rawTurnState.remainingSeconds !== undefined) {
    const remaining = Number(rawTurnState.remainingSeconds)
    normalized.remainingSeconds = Number.isFinite(remaining) && remaining >= 0 ? remaining : 0
  }
  if (rawTurnState.status !== undefined) {
    normalized.status = typeof rawTurnState.status === 'string' ? rawTurnState.status.trim() : ''
  }
  if (rawTurnState.dropInBonusSeconds !== undefined) {
    const bonus = Number(rawTurnState.dropInBonusSeconds)
    normalized.dropInBonusSeconds = Number.isFinite(bonus) && bonus >= 0 ? bonus : 0
  }
  if (rawTurnState.dropInBonusAppliedAt !== undefined) {
    const appliedAt = Number(rawTurnState.dropInBonusAppliedAt)
    normalized.dropInBonusAppliedAt = Number.isFinite(appliedAt) && appliedAt > 0 ? appliedAt : 0
  }
  if (rawTurnState.dropInBonusTurn !== undefined) {
    const bonusTurn = Number(rawTurnState.dropInBonusTurn)
    normalized.dropInBonusTurn = Number.isFinite(bonusTurn) && bonusTurn >= 0 ? Math.floor(bonusTurn) : 0
  }
  if (rawTurnState.source !== undefined) {
    normalized.source = typeof rawTurnState.source === 'string' ? rawTurnState.source.trim() : ''
  }
  if (rawTurnState.updatedAt !== undefined) {
    const updatedAt = Number(rawTurnState.updatedAt)
    normalized.updatedAt = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
  }

  return normalized
}

function deriveUserId({ viewer, authSnapshot }) {
  const fromViewer = toString(viewer?.viewerId) || toString(viewer?.ownerId)
  if (fromViewer) return fromViewer
  const fromAuth = toString(authSnapshot?.userId)
  if (fromAuth) return fromAuth
  return ''
}

export function readMatchFlowState(gameId) {
  if (!gameId && gameId !== 0) {
    return createEmptyMatchFlowState()
  }

  const raw = readGameMatchData(gameId) || {}
  const snapshot = raw?.matchSnapshot || null
  const participation = raw?.participation || {}
  const roster = sanitizeRoster(participation?.roster || snapshot?.match?.slotLayout)
  const assignments = sanitizeAssignments(snapshot?.match?.assignments)
  const slotTemplate = normalizeSlotTemplate(raw?.slotTemplate, snapshot)
  const sessionMeta = normalizeSessionMeta(raw?.sessionMeta, snapshot)
  const sessionHistory = normalizeSessionHistory(raw?.sessionHistory)

  const heroSelection = raw?.heroSelection || {}
  const viewer = {
    heroId: toString(heroSelection?.heroId),
    role: heroSelection?.role || '',
    ownerId: toString(heroSelection?.ownerId),
    viewerId: toString(heroSelection?.viewerId),
    heroName: heroSelection?.heroMeta?.name || '',
  }

  const rooms = Array.isArray(snapshot?.match?.rooms) ? snapshot.match.rooms : []
  const room = rooms.length
    ? {
        ...rooms[0],
        blindMode:
          rooms[0]?.blindMode === true ||
          rooms[0]?.blind_mode === true ||
          snapshot?.match?.blindMode === true,
      }
    : snapshot?.match?.blindMode
    ? { blindMode: true }
    : null

  const authSnapshot = readRankAuthSnapshot()
  const keyringSnapshot = readRankKeyringSnapshot()
  const userId = deriveUserId({ viewer, authSnapshot })
  const hasActiveKey = hasActiveKeyInSnapshot(keyringSnapshot, userId)

  const readyCount = roster.filter((entry) => entry.heroId && entry.ownerId).length
  const totalSlots = roster.length

  return {
    ...createEmptyMatchFlowState({ authSnapshot, keyringSnapshot }),
    snapshot,
    roster,
    assignments,
    viewer,
    room,
    matchMode: snapshot?.mode || '',
    matchInstanceId:
      snapshot?.match?.instanceId ||
      snapshot?.match?.matchInstanceId ||
      snapshot?.match?.match_instance_id ||
      '',
    hasActiveKey,
    rosterReadyCount: readyCount,
    totalSlots,
    raw,
    slotTemplate,
    slotTemplateVersion: slotTemplate?.version || 0,
    slotTemplateUpdatedAt: slotTemplate?.updatedAt || 0,
    sessionMeta,
    sessionHistory,
  }
}

export function clearMatchFlow(gameId) {
  if (!gameId && gameId !== 0) return
  clearGameMatchData(gameId)
}
