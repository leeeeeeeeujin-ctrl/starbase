import { normalizeTimelineStatus, sanitizeTimelineEvents } from '@/lib/rank/timelineEvents'

import {
  deriveParticipantOwnerId,
  findParticipantBySlotIndex,
  resolveParticipantSlotIndex,
} from './participants'

function dedupeStrings(list = []) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const result = []
  list.forEach((value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  })
  return result
}

function clone(value) {
  if (!value || typeof value !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return null
  }
}

function normalizeAudience(audience) {
  if (!audience || typeof audience !== 'object') {
    return { type: 'all', slots: [] }
  }

  if (audience.audience === 'slots') {
    const slots = Array.isArray(audience.slots) ? audience.slots : []
    const normalized = Array.from(
      new Set(
        slots
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0),
      ),
    )
    return { type: 'slots', slots: normalized }
  }

  return { type: 'all', slots: [] }
}

function coerceNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function buildParticipantMap(realtimePresence) {
  const map = new Map()
  if (!realtimePresence || typeof realtimePresence !== 'object') return map
  const entries = Array.isArray(realtimePresence.entries) ? realtimePresence.entries : []
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const ownerId = entry.ownerId ? String(entry.ownerId).trim() : ''
    if (!ownerId) return
    map.set(ownerId, {
      status: entry.status || null,
      inactivityStrikes: coerceNumber(entry.inactivityStrikes) || 0,
      proxiedAtTurn: coerceNumber(entry.proxiedAtTurn),
      managed: Boolean(entry.managed),
    })
  })
  return map
}

function buildRoleMap(dropInSnapshot) {
  const map = new Map()
  if (!dropInSnapshot || typeof dropInSnapshot !== 'object') return map
  const roles = Array.isArray(dropInSnapshot.roles) ? dropInSnapshot.roles : []
  roles.forEach((role) => {
    if (!role || typeof role !== 'object') return
    const key = typeof role.role === 'string' ? role.role.trim() : ''
    if (!key) return
    map.set(key, {
      role: key,
      totalArrivals: coerceNumber(role.totalArrivals) || 0,
      replacements: coerceNumber(role.replacements) || 0,
      lastArrivalTurn: coerceNumber(role.lastArrivalTurn),
      lastDepartureTurn: coerceNumber(role.lastDepartureTurn),
      lastDepartureCause: role.lastDepartureCause || null,
      activeOwnerId: role.activeOwnerId ? String(role.activeOwnerId).trim() : null,
      activeHeroName: role.activeHeroName || null,
    })
  })
  return map
}

function normalizeParticipant(participant, index, presenceMap, roleMap, dropInSnapshot) {
  const ownerId = deriveParticipantOwnerId(participant)
  const presence = ownerId ? presenceMap.get(String(ownerId)) : null
  const baseStatus = normalizeTimelineStatus(participant?.status) || 'unknown'
  const status = presence?.status ? normalizeTimelineStatus(presence.status) || baseStatus : baseStatus
  const roleKey = typeof participant?.role === 'string' ? participant.role.trim() : ''
  const roleStats = roleKey ? roleMap.get(roleKey) : null
  const resolvedSlotIndex = resolveParticipantSlotIndex(participant)
  const slotIndex = Number.isInteger(resolvedSlotIndex) ? resolvedSlotIndex : index

  return {
    participantId: participant?.id ?? participant?.hero_id ?? null,
    slotIndex,
    ownerId: ownerId ? String(ownerId) : null,
    role: roleKey || null,
    heroId: participant?.hero?.id ?? participant?.hero_id ?? null,
    heroName:
      participant?.hero?.name ??
      participant?.hero_name ??
      participant?.display_name ??
      participant?.name ??
      null,
    status,
    presence: presence
      ? {
          inactivityStrikes: presence.inactivityStrikes ?? 0,
          proxiedAtTurn: presence.proxiedAtTurn ?? null,
          managed: presence.managed ?? false,
        }
      : null,
    stats: {
      score: coerceNumber(participant?.score ?? participant?.scoreAfter ?? participant?.score_before),
      rating: coerceNumber(participant?.rating),
      battles: coerceNumber(participant?.battles ?? participant?.total_battles),
      winRate: coerceNumber(participant?.win_rate ?? participant?.winRate),
    },
    dropIn:
      roleStats && ownerId && roleStats.activeOwnerId === String(ownerId)
        ? {
            role: roleStats.role,
            replacements: roleStats.replacements,
            totalArrivals: roleStats.totalArrivals,
            lastArrivalTurn: roleStats.lastArrivalTurn,
            lastDepartureTurn: roleStats.lastDepartureTurn,
            lastDepartureCause: roleStats.lastDepartureCause,
            snapshotTurn: coerceNumber(dropInSnapshot?.turn),
          }
        : null,
  }
}

function buildParticipantSummaries(participants = [], { realtimePresence = null, dropInSnapshot = null } = {}) {
  const presenceMap = buildParticipantMap(realtimePresence)
  const roleMap = buildRoleMap(dropInSnapshot)
  return participants.map((participant, index) =>
    normalizeParticipant(participant, index, presenceMap, roleMap, dropInSnapshot),
  )
}

function buildTurnEntries({
  logs = [],
  participants = [],
}) {
  return logs.map((entry) => {
    if (!entry || typeof entry !== 'object') return null
    const turnNumber = coerceNumber(entry.turn)
    const slotIndex = Number.isInteger(entry.slotIndex) ? entry.slotIndex : null
    const participant = Number.isInteger(slotIndex)
      ? findParticipantBySlotIndex(participants, slotIndex)
      : null
    const actorOwnerId = participant ? deriveParticipantOwnerId(participant) : null
    return {
      turn: turnNumber,
      nodeId: entry.nodeId ?? null,
      slotIndex,
      action: entry.action || 'continue',
      nextNodeId: entry.next ?? null,
      prompt: {
        text: entry.prompt || '',
        audience: normalizeAudience(entry.promptAudience),
      },
      response: {
        text: entry.response || '',
        audience: normalizeAudience(entry.responseAudience),
        actors: dedupeStrings(entry.actors),
      },
      outcome: entry.outcome || '',
      variables: dedupeStrings(entry.variables),
      actor: participant
        ? {
            ownerId: actorOwnerId ? String(actorOwnerId) : null,
            role: participant.role || null,
            heroName:
              participant?.hero?.name ??
              participant?.hero_name ??
              participant?.display_name ??
              null,
          }
        : null,
      summary: clone(entry.summary),
    }
  }).filter(Boolean)
}

function buildHistoryEntries(historyEntries = []) {
  return historyEntries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') return null
    return {
      index,
      role: entry.role || 'assistant',
      content: typeof entry.content === 'string' ? entry.content : '',
      public: Boolean(entry.public),
      includeInAi: entry.includeInAi !== false,
      audience: normalizeAudience({ audience: entry.audience, slots: entry.slots }),
      meta: clone(entry.meta),
    }
  }).filter(Boolean)
}

export function buildBattleLogDraft({
  gameId = null,
  sessionId = null,
  gameName = null,
  result = 'unknown',
  reason = null,
  logs = [],
  historyEntries = [],
  timelineEvents = [],
  participants = [],
  realtimePresence = null,
  dropInSnapshot = null,
  winCount = 0,
  endTurn = null,
  endedAt = Date.now(),
}) {
  const participantsSummary = buildParticipantSummaries(participants, {
    realtimePresence,
    dropInSnapshot,
  })

  const turnEntries = buildTurnEntries({ logs, participants })
  const historySummary = buildHistoryEntries(historyEntries)
  const sanitizedTimeline = sanitizeTimelineEvents(timelineEvents)

  const dropInMeta = dropInSnapshot
    ? {
        turn: coerceNumber(dropInSnapshot.turn),
        roles: Array.isArray(dropInSnapshot.roles)
          ? dropInSnapshot.roles.map((role) => ({
              role: role.role || null,
              totalArrivals: coerceNumber(role.totalArrivals) || 0,
              replacements: coerceNumber(role.replacements) || 0,
              lastArrivalTurn: coerceNumber(role.lastArrivalTurn),
              lastDepartureTurn: coerceNumber(role.lastDepartureTurn),
              lastDepartureCause: role.lastDepartureCause || null,
              activeOwnerId: role.activeOwnerId ? String(role.activeOwnerId).trim() : null,
            }))
          : [],
      }
    : null

  return {
    meta: {
      gameId,
      sessionId,
      gameName,
      result,
      reason,
      endTurn: coerceNumber(endTurn),
      winCount: coerceNumber(winCount) || 0,
      generatedAt: new Date(endedAt).toISOString(),
      dropIn: dropInMeta,
      timelineEventCount: sanitizedTimeline.length,
      turnCount: turnEntries.length,
    },
    participants: participantsSummary,
    turns: turnEntries,
    history: historySummary,
    timeline: sanitizedTimeline,
  }
}

export default buildBattleLogDraft
