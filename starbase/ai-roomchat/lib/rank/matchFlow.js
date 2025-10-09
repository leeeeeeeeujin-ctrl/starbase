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

const EMPTY_SESSION_META = Object.freeze({
  turnTimer: null,
  vote: null,
  dropIn: null,
  asyncFill: null,
  extras: null,
  source: '',
  updatedAt: 0,
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
}

export function createEmptyMatchFlowState(overrides = {}) {
  const {
    authSnapshot: overrideAuth,
    keyringSnapshot: overrideKeyring,
    slotTemplate: overrideSlotTemplate,
    sessionMeta: overrideSessionMeta,
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
    ? { ...EMPTY_SESSION_META, ...overrideSessionMeta }
    : { ...EMPTY_SESSION_META }
  const slotTemplateVersion =
    overrideSlotVersion != null ? overrideSlotVersion : slotTemplate.version || 0
  const slotTemplateUpdatedAt =
    overrideSlotUpdatedAt != null ? overrideSlotUpdatedAt : slotTemplate.updatedAt || 0

  return {
    ...EMPTY_MATCH_FLOW_STATE,
    authSnapshot,
    keyringSnapshot,
    slotTemplate,
    slotTemplateVersion,
    slotTemplateUpdatedAt,
    sessionMeta,
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

  return base
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
  }
}

export function clearMatchFlow(gameId) {
  if (!gameId && gameId !== 0) return
  clearGameMatchData(gameId)
}
