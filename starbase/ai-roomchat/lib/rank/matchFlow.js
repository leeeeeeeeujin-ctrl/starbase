import {
  readGameMatchData,
  clearGameMatchData,
} from '../../modules/rank/matchDataStore'
import { readRankAuthSnapshot } from './rankAuthStorage'
import {
  hasActiveKeyInSnapshot,
  readRankKeyringSnapshot,
} from './keyringStorage'

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toString(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim()
  return trimmed
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

function deriveUserId({ viewer, authSnapshot }) {
  const fromViewer = toString(viewer?.viewerId) || toString(viewer?.ownerId)
  if (fromViewer) return fromViewer
  const fromAuth = toString(authSnapshot?.userId)
  if (fromAuth) return fromAuth
  return ''
}

export function readMatchFlowState(gameId) {
  if (!gameId && gameId !== 0) {
    return {
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
      hasActiveKey: false,
      rosterReadyCount: 0,
      totalSlots: 0,
      authSnapshot: { userId: '', accessToken: '', refreshToken: '', expiresAt: null },
      keyringSnapshot: { userId: '', entries: [], updatedAt: 0 },
      raw: null,
    }
  }

  const raw = readGameMatchData(gameId) || {}
  const snapshot = raw?.matchSnapshot || null
  const participation = raw?.participation || {}
  const roster = sanitizeRoster(participation?.roster || snapshot?.match?.slotLayout)
  const assignments = sanitizeAssignments(snapshot?.match?.assignments)

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
    snapshot,
    roster,
    assignments,
    viewer,
    room,
    matchMode: snapshot?.mode || '',
    hasActiveKey,
    rosterReadyCount: readyCount,
    totalSlots,
    authSnapshot,
    keyringSnapshot,
    raw,
  }
}

export function clearMatchFlow(gameId) {
  if (!gameId && gameId !== 0) return
  clearGameMatchData(gameId)
}
