import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'
import { addSupabaseDebugEvent } from '@/lib/debugCollector'
import { isRealtimeEnabled, normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'
import {
  HERO_ID_KEY,
  HERO_OWNER_KEY,
  clearHeroSelection,
  persistHeroOwner,
  persistHeroSelection,
  readHeroSelection,
} from '@/lib/heroes/selectedHeroStorage'
import {
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchSnapshot,
  setGameMatchSlotTemplate,
  setGameMatchSessionMeta,
} from '@/modules/rank/matchDataStore'
import {
  AUTH_ACCESS_EXPIRES_AT_KEY,
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_USER_ID_KEY,
  createEmptyRankAuthSnapshot,
  persistRankAuthSession,
  persistRankAuthUser,
  readRankAuthSnapshot,
  RANK_AUTH_STORAGE_EVENT,
} from '@/lib/rank/rankAuthStorage'
import { MATCH_MODE_KEYS } from '@/lib/rank/matchModes'
import {
  createEmptyRankKeyringSnapshot,
  hasActiveKeyInSnapshot,
  RANK_KEYRING_STORAGE_EVENT,
  RANK_KEYRING_STORAGE_KEY,
  readRankKeyringSnapshot,
} from '@/lib/rank/keyringStorage'
import { createPlaceholderCandidate } from '@/lib/rank/asyncStandinUtils'

const ROOM_EXIT_DELAY_MS = 5000
const HOST_CLEANUP_DELAY_MS = ROOM_EXIT_DELAY_MS
const ROOM_AUTO_REFRESH_INTERVAL_MS = 5000
const LAST_CREATED_ROOM_KEY = 'rooms:lastCreatedHostFeedback'

const CASUAL_MODE_TOKENS = ['casual', '캐주얼', 'normal']
const MATCH_READY_DEFAULT_MODE = MATCH_MODE_KEYS.RANK_SHARED

const hostCleanupState = {
  timerId: null,
  roomId: null,
}

const participantCleanupState = {
  timerId: null,
  roomId: null,
  ownerId: null,
  slotId: null,
}

async function performParticipantCleanup({ slotId, ownerId }) {
  if (!slotId || !ownerId) return
  try {
    const leaveResult = await withTable(supabase, 'rank_room_slots', (table) =>
      supabase
        .from(table)
        .update({
          occupant_owner_id: null,
          occupant_hero_id: null,
          occupant_ready: false,
          joined_at: null,
        })
        .eq('id', slotId)
        .eq('occupant_owner_id', ownerId),
    )

    if (leaveResult.error && leaveResult.error.code !== 'PGRST116') {
      throw leaveResult.error
    }
  } catch (cleanupError) {
    console.error('[RoomDetail] Failed to auto-leave room:', cleanupError)
  }
}

function normalizeRoomMode(value) {
  if (typeof value !== 'string') return 'rank'
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'rank'
  return CASUAL_MODE_TOKENS.some((token) => normalized.includes(token)) ? 'casual' : 'rank'
}

function resolveMatchReadyMode(value) {
  if (typeof value !== 'string') return MATCH_READY_DEFAULT_MODE

  const trimmed = value.trim()
  if (!trimmed) return MATCH_READY_DEFAULT_MODE

  const lowered = trimmed.toLowerCase()

  if (['casual_private', 'private'].includes(lowered)) {
    return MATCH_MODE_KEYS.CASUAL_PRIVATE
  }

  if (['casual_match', 'casual', 'normal'].includes(lowered)) {
    return MATCH_MODE_KEYS.CASUAL_MATCH
  }

  if (['rank_duo', 'duo'].includes(lowered)) {
    return MATCH_MODE_KEYS.RANK_DUO
  }

  if (['rank_solo', 'solo'].includes(lowered)) {
    return MATCH_MODE_KEYS.RANK_SOLO
  }

  if (
    [
      MATCH_MODE_KEYS.RANK_SHARED,
      MATCH_MODE_KEYS.RANK_SOLO,
      MATCH_MODE_KEYS.RANK_DUO,
      'rank',
    ].includes(lowered)
  ) {
    return MATCH_MODE_KEYS.RANK_SHARED
  }

  return trimmed
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function toNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function createMatchInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch (error) {
      // ignore and fall back
    }
  }
  const suffix = Math.random().toString(36).slice(2, 10)
  return `match_${Date.now()}_${suffix}`
}

function buildRosterFromSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return []
  return slots.map((slot) => {
    const standin = slot?.standin === true
    const matchSource =
      toStringOrNull(slot?.matchSource) || (standin ? 'participant_pool' : null)
    const score = toNumberOrNull(
      slot?.standinScore ?? slot?.score ?? slot?.expectedScore ?? null,
    )
    const rating = toNumberOrNull(
      slot?.standinRating ?? slot?.rating ?? slot?.expectedRating ?? null,
    )
    const battles = toNumberOrNull(slot?.standinBattles ?? slot?.battles ?? null)
    const winRateRaw =
      slot?.standinWinRate ?? slot?.winRate ?? slot?.expectedWinRate ?? null
    const winRate =
      winRateRaw !== null && winRateRaw !== undefined && Number.isFinite(Number(winRateRaw))
        ? Number(winRateRaw)
        : null
    const statusRaw =
      typeof slot?.standinStatus === 'string'
        ? slot.standinStatus.trim()
        : typeof slot?.status === 'string'
        ? slot.status.trim()
        : ''

    return {
      slotId: slot?.id || null,
      slotIndex: Number.isFinite(Number(slot?.slotIndex)) ? Number(slot.slotIndex) : 0,
      role:
        typeof slot?.role === 'string' && slot.role.trim() ? slot.role.trim() : '역할 미지정',
      ownerId: toStringOrNull(slot?.occupantOwnerId),
      heroId: toStringOrNull(slot?.occupantHeroId),
      heroName: typeof slot?.occupantHeroName === 'string' ? slot.occupantHeroName : '',
      ready: !!slot?.occupantReady,
      joinedAt: slot?.joinedAt || null,
      standin,
      matchSource,
      score,
      rating,
      battles,
      winRate,
      status: statusRaw || (standin ? 'standin' : null),
    }
  })
}

function buildHeroMapFromRoster(roster) {
  return roster.reduce((acc, entry) => {
    if (!entry?.heroId) return acc
    const key = entry.heroId
    if (!acc[key]) {
      acc[key] = {
        id: entry.heroId,
        name: entry.heroName || `캐릭터 #${entry.heroId}`,
        ownerId: entry.ownerId,
      }
    }
    return acc
  }, {})
}

function buildRolesFromRoster(roster) {
  const map = new Map()
  roster.forEach((entry) => {
    if (!entry) return
    const roleName =
      typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : '역할 미지정'
    map.set(roleName, (map.get(roleName) || 0) + 1)
  })
  return Array.from(map.entries()).map(([name, count]) => ({
    name,
    slot_count: count,
  }))
}

function buildAssignmentsFromRoster(roster) {
  const grouped = new Map()
  roster.forEach((entry) => {
    if (!entry) return
    const roleName =
      typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : '역할 미지정'
    if (!grouped.has(roleName)) {
      grouped.set(roleName, [])
    }
    grouped.get(roleName).push(entry)
  })

  return Array.from(grouped.entries()).map(([roleName, entries]) => {
    const sorted = entries
      .map((entry) => ({ ...entry }))
      .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0))

    const members = sorted
      .filter((entry) => entry.ownerId && entry.heroId)
      .map((entry) => ({
        ownerId: entry.ownerId,
        heroId: entry.heroId,
        heroName: entry.heroName || '',
        ready: !!entry.ready,
        slotIndex: entry.slotIndex || 0,
        joinedAt: entry.joinedAt || null,
      }))

    const roleSlots = sorted.map((entry, localIndex) => ({
      slotId: entry.slotId,
      role: roleName,
      slotIndex: entry.slotIndex || 0,
      localIndex,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName || '',
      ready: !!entry.ready,
      joinedAt: entry.joinedAt || null,
      members:
        entry.ownerId && entry.heroId
          ? [
              {
                ownerId: entry.ownerId,
                heroId: entry.heroId,
                heroName: entry.heroName || '',
                ready: !!entry.ready,
                joinedAt: entry.joinedAt || null,
              },
            ]
          : [],
    }))

    return {
      role: roleName,
      slots: roleSlots.length,
      members,
      roleSlots,
    }
  })
}

function buildSlotLayoutFromRoster(roster) {
  return roster
    .map((entry) => ({ ...entry }))
    .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0))
    .map((entry) => ({
      slotId: entry.slotId,
      slotIndex: entry.slotIndex || 0,
      role: entry.role,
      ownerId: entry.ownerId,
      heroId: entry.heroId,
      heroName: entry.heroName || '',
      ready: !!entry.ready,
      joinedAt: entry.joinedAt || null,
    }))
}

function safeJsonParse(text) {
  if (typeof text !== 'string' || !text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

function sanitizeStandinCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  const ownerId = toStringOrNull(candidate.ownerId ?? candidate.owner_id)
  if (!ownerId) return null
  const heroId = toStringOrNull(candidate.heroId ?? candidate.hero_id)
  const heroNameRaw = candidate.heroName ?? candidate.hero_name
  const heroName =
    typeof heroNameRaw === 'string' && heroNameRaw.trim()
      ? heroNameRaw.trim()
      : '비실시간 대역'
  const roleRaw = candidate.role ?? candidate.roleName
  const role =
    typeof roleRaw === 'string' && roleRaw.trim() ? roleRaw.trim() : '역할 미지정'
  const score = toNumberOrNull(candidate.score ?? candidate.ratingScore ?? null)
  const rating = toNumberOrNull(candidate.rating ?? candidate.mmr ?? null)
  const battles = toNumberOrNull(candidate.battles ?? null)
  const winRateSource =
    candidate.winRate ?? candidate.win_rate ?? candidate.matchWinRate ?? null
  const winRate =
    winRateSource !== null && winRateSource !== undefined && Number.isFinite(Number(winRateSource))
      ? Number(winRateSource)
      : null
  const matchSource =
    toStringOrNull(candidate.matchSource ?? candidate.match_source) || null
  const statusRaw = candidate.status ?? candidate.participantStatus
  const status =
    typeof statusRaw === 'string' && statusRaw.trim()
      ? statusRaw.trim()
      : 'standin'

  return {
    ownerId,
    heroId,
    heroName,
    role,
    score,
    rating,
    battles,
    winRate,
    matchSource,
    status,
  }
}

function buildStandinSeatRequests(slots = []) {
  const seatMap = new Map()
  const seatRequests = []

  slots.forEach((slot) => {
    if (!slot || typeof slot !== 'object') return
    const slotIndex = Number.isFinite(Number(slot.slotIndex))
      ? Number(slot.slotIndex)
      : null
    if (slotIndex === null || slotIndex < 0) return
    const role =
      typeof slot.role === 'string' && slot.role.trim() ? slot.role.trim() : '역할 미지정'
    if (toStringOrNull(slot.occupantOwnerId)) {
      return
    }

    const score = toNumberOrNull(slot.score ?? slot.expectedScore ?? null)
    const rating = toNumberOrNull(slot.rating ?? slot.expectedRating ?? null)

    const request = {
      slotIndex,
      role,
      score,
      rating,
    }

    seatMap.set(slotIndex, request)
    seatRequests.push(request)
  })

  return { seatMap, seatRequests }
}

function injectStandinsIntoSlots(slots = [], assignments = [], seatMap = new Map()) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { slots: slots.map((slot) => ({ ...slot })), applied: false, assigned: [] }
  }

  const assignmentMap = new Map()
  const assigned = []

  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object') return
    const rawIndex = assignment.slotIndex ?? assignment.slot_index
    const slotIndex = Number.isFinite(Number(rawIndex)) ? Number(rawIndex) : null
    if (slotIndex === null || slotIndex < 0) return
    const candidate = sanitizeStandinCandidate(assignment.candidate ?? assignment)
    if (!candidate) return
    assignmentMap.set(slotIndex, { candidate, seat: seatMap.get(slotIndex) || null })
    assigned.push({ slotIndex, candidate })
  })

  if (!assignmentMap.size) {
    return { slots: slots.map((slot) => ({ ...slot })), applied: false, assigned: [] }
  }

  const assignedAt = new Date().toISOString()
  const merged = slots.map((slot) => {
    const base = slot && typeof slot === 'object' ? { ...slot } : {}
    const slotIndex = Number.isFinite(Number(base.slotIndex)) ? Number(base.slotIndex) : null
    if (slotIndex === null) {
      return base
    }

    if (toStringOrNull(base.occupantOwnerId)) {
      return base
    }

    const bundle = assignmentMap.get(slotIndex)
    if (!bundle) {
      return base
    }

    const role =
      bundle.seat?.role || base.role || bundle.candidate.role || '역할 미지정'

    return {
      ...base,
      role,
      occupantOwnerId: bundle.candidate.ownerId,
      occupantHeroId: bundle.candidate.heroId || null,
      occupantHeroName:
        bundle.candidate.heroName || base.occupantHeroName || '비실시간 대역',
      occupantReady: true,
      joinedAt: base.joinedAt || assignedAt,
      standin: true,
      matchSource: bundle.candidate.matchSource || 'async_standin',
      standinScore: bundle.candidate.score,
      standinRating: bundle.candidate.rating,
      standinBattles: bundle.candidate.battles,
      standinWinRate: bundle.candidate.winRate,
      standinStatus: bundle.candidate.status || 'standin',
      standinPlaceholder: bundle.candidate.placeholder === true,
    }
  })

  assignmentMap.forEach((bundle, slotIndex) => {
    const hasSlot = merged.some(
      (slot) => Number.isFinite(Number(slot.slotIndex)) && Number(slot.slotIndex) === slotIndex,
    )
    if (hasSlot) return
    const role =
      bundle.seat?.role || bundle.candidate.role || '역할 미지정'
    merged.push({
      id: null,
      slotIndex,
      role,
      occupantOwnerId: bundle.candidate.ownerId,
      occupantHeroId: bundle.candidate.heroId || null,
      occupantHeroName: bundle.candidate.heroName || '비실시간 대역',
      occupantReady: true,
      joinedAt: assignedAt,
      standin: true,
      matchSource: bundle.candidate.matchSource || 'async_standin',
      standinScore: bundle.candidate.score,
      standinRating: bundle.candidate.rating,
      standinBattles: bundle.candidate.battles,
      standinWinRate: bundle.candidate.winRate,
      standinStatus: bundle.candidate.status || 'standin',
    })
  })

  merged.sort((left, right) => {
    const leftIndex = Number.isFinite(Number(left.slotIndex)) ? Number(left.slotIndex) : 0
    const rightIndex = Number.isFinite(Number(right.slotIndex)) ? Number(right.slotIndex) : 0
    return leftIndex - rightIndex
  })

  const unresolved = []
  seatMap.forEach((_, slotIndex) => {
    const resolved = merged.some((slot) => {
      if (!Number.isFinite(Number(slot.slotIndex))) return false
      if (Number(slot.slotIndex) !== Number(slotIndex)) return false
      return Boolean(toStringOrNull(slot.occupantOwnerId))
    })
    if (!resolved) {
      unresolved.push(slotIndex)
    }
  })

  if (unresolved.length) {
    return { slots: slots.map((slot) => ({ ...slot })), applied: false, assigned: [] }
  }

  return { slots: merged, applied: true, assigned }
}

function buildPlaceholderStandinAssignments(seatMap, assignments = []) {
  if (!(seatMap instanceof Map)) {
    return []
  }

  const reservedSlots = new Set()
  assignments.forEach((assignment) => {
    const rawIndex = assignment?.slotIndex ?? assignment?.slot_index
    const slotIndex = Number.isFinite(Number(rawIndex)) ? Number(rawIndex) : null
    if (slotIndex !== null) {
      reservedSlots.add(slotIndex)
    }
  })

  const placeholders = []
  seatMap.forEach((seat, slotIndex) => {
    if (reservedSlots.has(slotIndex)) {
      return
    }

    const candidate = createPlaceholderCandidate(seat, slotIndex)
    if (!candidate || !candidate.ownerId) {
      return
    }

    placeholders.push({ slotIndex, candidate })
  })

  return placeholders
}

async function fulfillAsyncStandinsForSlots({ room, slots, token }) {
  const { seatMap, seatRequests } = buildStandinSeatRequests(slots)
  if (!seatRequests.length) {
    return { slots: slots.map((slot) => ({ ...slot })), applied: false, assignments: [] }
  }

  const excludeOwnerIds = slots
    .map((slot) => toStringOrNull(slot?.occupantOwnerId))
    .filter(Boolean)

  const response = await fetch('/api/rank/async-standins', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      game_id: room?.gameId || room?.game_id || null,
      room_id: room?.id || null,
      seat_requests: seatRequests,
      exclude_owner_ids: excludeOwnerIds,
    }),
  })

  const text = await response.text()
  const payload = safeJsonParse(text) || {}

  if (!response.ok) {
    const message = payload?.error || 'async_standin_failed'
    const error = new Error(message)
    error.payload = payload
    throw error
  }

  let assignments = Array.isArray(payload?.assignments) ? payload.assignments : []
  let injection = injectStandinsIntoSlots(slots, assignments, seatMap)
  let placeholderAssignments = []

  if (!injection.applied) {
    placeholderAssignments = buildPlaceholderStandinAssignments(seatMap, assignments)
    if (placeholderAssignments.length) {
      assignments = [...assignments, ...placeholderAssignments]
      injection = injectStandinsIntoSlots(slots, assignments, seatMap)
    }
  }

  if (!injection.applied) {
    const error = new Error('async_standin_unavailable')
    error.payload = payload
    throw error
  }

  let diagnostics = null
  if (payload?.diagnostics && typeof payload.diagnostics === 'object') {
    diagnostics = { ...payload.diagnostics }
  }

  if (placeholderAssignments.length) {
    diagnostics = {
      ...(diagnostics || {}),
      placeholders: placeholderAssignments.length,
      placeholderSlotIndexes: placeholderAssignments.map((entry) => entry.slotIndex),
    }
  }

  if (diagnostics && typeof console !== 'undefined' && console.info) {
    console.info('[RoomDetail] async stand-in diagnostics:', diagnostics)
  } else if (payload?.diagnostics && typeof console !== 'undefined' && console.info) {
    console.info('[RoomDetail] async stand-in diagnostics:', payload.diagnostics)
  }

  return {
    slots: injection.slots,
    applied: true,
    assignments,
    diagnostics,
  }
}

function buildMatchTransferPayload(room, slots) {
  if (!room || !Array.isArray(slots) || !slots.length) return null
  const roster = buildRosterFromSlots(slots)
  if (!roster.length) return null
  const heroMap = buildHeroMapFromRoster(roster)
  const roles = buildRolesFromRoster(roster)
  const assignments = buildAssignmentsFromRoster(roster)
  const slotLayout = buildSlotLayoutFromRoster(roster)
  const maxWindow = toNumberOrNull(room?.scoreWindow)
  const timestamp = Date.now()
  const instanceId = createMatchInstanceId()

  const match = {
    instanceId,
    matchInstanceId: instanceId,
    match_instance_id: instanceId,
    assignments,
    maxWindow,
    heroMap,
    matchCode: room?.code || '',
    matchType: 'standard',
    blindMode: !!room?.blindMode,
    brawlVacancies: [],
    roleStatus: {
      slotLayout,
      roles,
      version: timestamp,
      updatedAt: timestamp,
      source: 'room-stage',
    },
    sampleMeta: null,
    dropInTarget: null,
    turnTimer: null,
    rooms: [
      {
        id: room?.id || '',
        code: room?.code || '',
        ownerId: room?.ownerId || null,
        status: room?.status || '',
        mode: room?.mode || '',
        scoreWindow: maxWindow,
        realtimeMode: room?.realtimeMode || '',
        brawlRule: room?.brawlRule || '',
        hostRoleLimit: room?.hostRoleLimit ?? null,
        updatedAt: room?.updatedAt || null,
        blindMode: !!room?.blindMode,
      },
    ],
    roles,
    slotLayout,
    source: 'room-fill',
  }

  const slotTemplate = {
    slots: slotLayout,
    roles,
    version: timestamp,
    updatedAt: timestamp,
    source: 'room-stage',
  }

  return {
    roster,
    heroMap,
    roles,
    assignments,
    slotLayout,
    match,
    matchInstanceId: instanceId,
    slotTemplate,
  }
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    padding: '32px 16px 96px',
    boxSizing: 'border-box',
  },
  shell: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    display: 'grid',
    gap: 16,
    background: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 24,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '24px 26px',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  titleBlock: {
    display: 'grid',
    gap: 6,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
  },
  backLink: {
    textDecoration: 'none',
    color: '#38bdf8',
    fontWeight: 700,
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(15, 23, 42, 0.6)',
    alignSelf: 'flex-start',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: '#cbd5f5',
  },
  creationFeedback: {
    marginTop: -4,
    marginBottom: 4,
    padding: '12px 16px',
    background: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 14,
    border: '1px solid rgba(34, 197, 94, 0.35)',
    color: '#bbf7d0',
    fontSize: 13,
    lineHeight: '20px',
  },
  creationFeedbackStrong: {
    color: '#4ade80',
    fontWeight: 700,
  },
  heroSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: '#94a3b8',
  },
  keyRequirement: {
    marginTop: -6,
    marginBottom: 6,
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid rgba(96, 165, 250, 0.45)',
    background: 'rgba(30, 64, 175, 0.35)',
    color: '#bfdbfe',
    fontSize: 13,
    lineHeight: '20px',
  },
  blindNotice: {
    marginTop: -4,
    marginBottom: 6,
    padding: '12px 16px',
    borderRadius: 14,
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'rgba(37, 99, 235, 0.18)',
    color: '#c7d2fe',
    fontSize: 13,
    lineHeight: '20px',
  },
  statusHint: {
    marginTop: -4,
    marginBottom: 6,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(16, 185, 129, 0.35)',
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#bbf7d0',
    fontSize: 13,
    lineHeight: '20px',
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: -4,
    padding: '0 2px',
  },
  tabButton: (active) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(148, 163, 184, 0.25)',
    background: active ? 'rgba(30, 64, 175, 0.45)' : 'rgba(15, 23, 42, 0.6)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }),
  tabButtonLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  tabBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.28)',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 600,
  },
  primaryButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: disabled ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.75)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  secondaryButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(30, 41, 59, 0.45)' : 'rgba(30, 41, 59, 0.8)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  dangerButton: (disabled) => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(248, 113, 113, 0.45)',
    background: disabled ? 'rgba(127, 29, 29, 0.45)' : 'rgba(239, 68, 68, 0.75)',
    color: disabled ? '#fecaca' : '#fee2e2',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  infoText: {
    margin: 0,
    fontSize: 13,
    color: '#fca5a5',
  },
  asyncStartHint: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#bae6fd',
  },
  loadingState: {
    textAlign: 'center',
    padding: '80px 20px',
    fontSize: 15,
    color: '#94a3b8',
  },
  errorCard: {
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    borderRadius: 18,
    padding: '22px 24px',
    display: 'grid',
    gap: 12,
    color: '#fecaca',
  },
  errorTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
  },
  retryButton: {
    justifySelf: 'flex-start',
    padding: '9px 16px',
    borderRadius: 12,
    border: '1px solid rgba(248, 113, 113, 0.55)',
    background: 'rgba(127, 29, 29, 0.65)',
    color: '#fee2e2',
    fontWeight: 600,
    cursor: 'pointer',
  },
  slotSection: {
    background: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '24px 26px',
    display: 'grid',
    gap: 18,
  },
  overviewSection: {
    background: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    padding: '24px 26px',
    display: 'grid',
    gap: 18,
  },
  overviewGrid: {
    display: 'grid',
    gap: 14,
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  overviewCard: {
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(15, 23, 42, 0.55)',
    padding: '16px 18px',
    display: 'grid',
    gap: 8,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  overviewValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  overviewSubtle: {
    fontSize: 12,
    color: '#a5b4fc',
  },
  roleList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: 10,
  },
  roleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '12px 14px',
    borderRadius: 14,
    background: 'rgba(30, 41, 59, 0.55)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
  },
  roleName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  roleCount: {
    fontSize: 13,
    color: '#94a3b8',
  },
  overviewEmpty: {
    textAlign: 'center',
    padding: '36px 20px',
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  subSectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    color: '#94a3b8',
  },
  slotGrid: {
    display: 'grid',
    gap: 14,
  },
  slotCard: (highlighted) => ({
    borderRadius: 18,
    border: highlighted
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(148, 163, 184, 0.25)',
    background: highlighted ? 'rgba(30, 64, 175, 0.35)' : 'rgba(15, 23, 42, 0.6)',
    padding: '16px 18px',
    display: 'grid',
    gap: 10,
  }),
  slotHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 14,
    fontWeight: 700,
  },
  slotRole: {
    margin: 0,
  },
  slotIndex: {
    fontSize: 12,
    color: '#94a3b8',
  },
  slotBody: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  slotTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 11,
  },
  slotTag: {
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.22)',
    color: '#bfdbfe',
    fontWeight: 600,
  },
}

const ROOM_DETAIL_TABS = [
  { id: 'overview', label: '방 개요' },
  { id: 'participants', label: '인원' },
]

const FLEXIBLE_ROLE_KEYS = new Set([
  '',
  '역할 미지정',
  '미정',
  '자유',
  '자유 선택',
  'any',
  'all',
  'flex',
  'flexible',
])

function normalizeRole(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isFlexibleRole(role) {
  const normalized = normalizeRole(role)
  return FLEXIBLE_ROLE_KEYS.has(normalized)
}

function parseBrawlRule(raw) {
  if (!raw) return 'banish-on-loss'
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return 'banish-on-loss'
    return trimmed
  }
  if (typeof raw === 'object' && typeof raw.brawl_rule === 'string') {
    const trimmed = raw.brawl_rule.trim()
    return trimmed || 'banish-on-loss'
  }
  return 'banish-on-loss'
}

function isDropInEnabled({ realtimeMode, brawlRule }) {
  return isRealtimeEnabled(realtimeMode) && parseBrawlRule(brawlRule) === 'allow-brawl'
}

function formatRelativeTime(value) {
  if (!value) return '시간 정보 없음'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 정보 없음'
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff)) return '시간 정보 없음'
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '방금 전'
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  const hh = `${date.getHours()}`.padStart(2, '0')
  const mm = `${date.getMinutes()}`.padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

function resolveErrorMessage(error) {
  if (!error) return '알 수 없는 오류가 발생했습니다.'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message.trim()) return error.message
  if (typeof error.details === 'string' && error.details.trim()) return error.details
  if (typeof error.hint === 'string' && error.hint.trim()) return error.hint
  return '알 수 없는 오류가 발생했습니다.'
}

export default function RoomDetailPage() {
  const router = useRouter()
  const roomParam = router.query.id
  const heroParamRaw = router.query.hero

  const roomId = useMemo(() => {
    if (Array.isArray(roomParam)) return roomParam[0] || ''
    return roomParam || ''
  }, [roomParam])

  const heroParam = useMemo(() => {
    if (Array.isArray(heroParamRaw)) return heroParamRaw[0] || ''
    return heroParamRaw || ''
  }, [heroParamRaw])

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [room, setRoom] = useState(null)
  const [slots, setSlots] = useState([])
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [joinPending, setJoinPending] = useState(false)
  const [leavePending, setLeavePending] = useState(false)
  const [manualStagePending, setManualStagePending] = useState(false)
  const [creationFeedback, setCreationFeedback] = useState(null)
  const [deletePending, setDeletePending] = useState(false)
  const [activeTab, setActiveTab] = useState('participants')
  const [storedAuthSnapshot, setStoredAuthSnapshot] = useState(() => createEmptyRankAuthSnapshot())

  const [keyringSnapshot, setKeyringSnapshot] = useState(() => createEmptyRankKeyringSnapshot())
  const [viewer, setViewer] = useState({
    heroId: '',
    heroName: '',
    ownerId: null,
    userId: null,
    rating: null,
    role: '',
  })
  const [viewerLoading, setViewerLoading] = useState(true)
  const [activeSlotId, setActiveSlotId] = useState(null)
  const latestPresenceRef = useRef({
    activeSlotId: null,
    ownerId: null,
    isHost: false,
    roomId: null,
  })
  const slotRefreshTimeoutRef = useRef(null)
  const autoRedirectRef = useRef(false)

  const occupancy = useMemo(() => {
    const total = slots.length
    const filled = slots.filter((slot) => !!slot.occupantOwnerId).length
    return { total, filled }
  }, [slots])

  const readyCount = useMemo(() => {
    return slots.filter((slot) => slot.occupantOwnerId && slot.occupantReady).length
  }, [slots])

  const roleSummaries = useMemo(() => {
    if (!slots.length) return []
    const summaries = []
    const indexMap = new Map()
    slots.forEach((slot) => {
      const roleLabel = slot.role || '역할 미지정'
      if (!indexMap.has(roleLabel)) {
        indexMap.set(roleLabel, summaries.length)
        summaries.push({ role: roleLabel, filled: 0, total: 0 })
      }
      const entry = summaries[indexMap.get(roleLabel)]
      entry.total += 1
      if (slot.occupantOwnerId) {
        entry.filled += 1
      }
    })
    return summaries
  }, [slots])

  const hostSlot = useMemo(() => {
    if (!room?.ownerId) return null
    return (
      slots.find((slot) => slot.occupantOwnerId && slot.occupantOwnerId === room.ownerId) || null
    )
  }, [room?.ownerId, slots])

  const hostDisplayName = useMemo(() => {
    if (!hostSlot || !hostSlot.occupantOwnerId) return '자리 비어 있음'
    const hideIdentity =
      room?.blindMode && hostSlot.occupantOwnerId && hostSlot.occupantOwnerId !== viewer.ownerId
    if (hideIdentity) return '비공개 참가자'
    return hostSlot.occupantHeroName || '이름 없는 영웅'
  }, [hostSlot, room?.blindMode, viewer.ownerId])

  const hostReadyLabel = useMemo(() => {
    if (!hostSlot || !hostSlot.occupantOwnerId) return '방장이 아직 착석하지 않았습니다.'
    return hostSlot.occupantReady ? '준비 완료' : '준비 대기'
  }, [hostSlot])

  const scoreWindowLabel = useMemo(() => {
    if (!room) return '정보 없음'
    if (!Number.isFinite(room.scoreWindow)) return '제한 없음'
    return `±${room.scoreWindow}`
  }, [room])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!roomId) return undefined
    const rawFeedback = window.sessionStorage.getItem(LAST_CREATED_ROOM_KEY)
    if (!rawFeedback) return undefined
    try {
      const parsed = JSON.parse(rawFeedback)
      if (parsed && parsed.roomId && `${parsed.roomId}` === `${roomId}`) {
        setCreationFeedback({
          hostSeated: !!parsed.hostSeated,
          hostRating: Number.isFinite(Number(parsed.hostRating))
            ? Number(parsed.hostRating)
            : null,
        })
        window.sessionStorage.removeItem(LAST_CREATED_ROOM_KEY)
      }
    } catch (feedbackError) {
      console.warn('[RoomDetail] Failed to read creation feedback:', feedbackError)
      window.sessionStorage.removeItem(LAST_CREATED_ROOM_KEY)
    }
    return undefined
  }, [roomId])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncStoredAuth = () => {
      setStoredAuthSnapshot(readRankAuthSnapshot())
    }

    const handleStorage = (event) => {
      if (
        event?.key &&
        event.key !== AUTH_ACCESS_TOKEN_KEY &&
        event.key !== AUTH_REFRESH_TOKEN_KEY &&
        event.key !== AUTH_ACCESS_EXPIRES_AT_KEY &&
        event.key !== AUTH_USER_ID_KEY
      ) {
        return
      }
      syncStoredAuth()
    }

    syncStoredAuth()

    window.addEventListener('storage', handleStorage)
    window.addEventListener(RANK_AUTH_STORAGE_EVENT, syncStoredAuth)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(RANK_AUTH_STORAGE_EVENT, syncStoredAuth)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncKeyring = () => {
      setKeyringSnapshot(readRankKeyringSnapshot())
    }

    const handleStorage = (event) => {
      if (event?.key && event.key !== RANK_KEYRING_STORAGE_KEY) {
        return
      }
      syncKeyring()
    }

    syncKeyring()

    window.addEventListener('storage', handleStorage)
    window.addEventListener(RANK_KEYRING_STORAGE_EVENT, syncKeyring)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(RANK_KEYRING_STORAGE_EVENT, syncKeyring)
    }
  }, [])

  useEffect(() => {
    if (!storedAuthSnapshot?.userId) return
    setViewer((prev) => {
      if (prev?.userId) return prev
      return { ...prev, userId: storedAuthSnapshot.userId }
    })
  }, [storedAuthSnapshot?.userId])

  const ratingDelta = useMemo(() => {
    if (!Number.isFinite(room?.hostRating) || !Number.isFinite(viewer.rating)) return null
    return viewer.rating - room.hostRating
  }, [room?.hostRating, viewer.rating])

  const absoluteDelta = useMemo(() => {
    if (ratingDelta === null) return null
    return Math.abs(ratingDelta)
  }, [ratingDelta])

  const hasActiveApiKey = useMemo(
    () => hasActiveKeyInSnapshot(keyringSnapshot, viewer.userId),
    [keyringSnapshot, viewer.userId],
  )

  const roomOwnerId = useMemo(() => {
    if (!room?.ownerId) return ''
    return String(room.ownerId).trim()
  }, [room?.ownerId])

  const viewerOwnerId = useMemo(() => {
    if (!viewer.ownerId) return ''
    return String(viewer.ownerId).trim()
  }, [viewer.ownerId])

  const viewerUserId = useMemo(() => {
    if (!viewer.userId) return ''
    return String(viewer.userId).trim()
  }, [viewer.userId])

  const isHost = useMemo(() => {
    if (!roomOwnerId) return false
    return roomOwnerId === viewerOwnerId || roomOwnerId === viewerUserId
  }, [roomOwnerId, viewerOwnerId, viewerUserId])

  const canSyncRoomCounters = useMemo(() => {
    if (!roomOwnerId || !viewerUserId) return false
    return roomOwnerId === viewerUserId
  }, [roomOwnerId, viewerUserId])

  const resolveAccessToken = useCallback(async () => {
    const storedToken = storedAuthSnapshot?.accessToken?.trim?.()
    if (storedToken) {
      return storedToken
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }

    return sessionData?.session?.access_token || ''
  }, [storedAuthSnapshot?.accessToken, supabase])
  const loadViewerHero = useCallback(
    async (explicitHeroId) => {
      setViewerLoading(true)
      try {
        const selection = readHeroSelection()
        let storedHeroId = selection?.heroId || ''
        let storedOwnerId = selection?.ownerId || ''

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        const session = sessionData?.session || null
        if (session) {
          persistRankAuthSession(session)
          if (session.user?.id) {
            persistRankAuthUser(session.user)
          }
        }

        let user = session?.user || null
        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser()
          if (userError) throw userError
          user = userData?.user || null
          if (user?.id) {
            persistRankAuthUser(user)
          }
        }

        if (!user && storedAuthSnapshot?.userId) {
          user = { id: storedAuthSnapshot.userId }
        }

        const viewerOwnerKey = user?.id ? String(user.id) : ''
        if (viewerOwnerKey) {
          persistHeroOwner(viewerOwnerKey)
          persistRankAuthUser(viewerOwnerKey)
        }

        if (viewerOwnerKey && storedOwnerId && storedOwnerId !== viewerOwnerKey) {
          clearHeroSelection()
          storedHeroId = ''
          storedOwnerId = ''
        }

        const heroCandidate = explicitHeroId || storedHeroId || null
        let profile = null
        if (user) {
          profile = await resolveViewerProfile(user, heroCandidate)
        }

        let resolvedHeroId = ''
        if (profile?.hero_id) {
          resolvedHeroId = profile.hero_id
        } else if (heroCandidate) {
          resolvedHeroId = heroCandidate
        }

        let resolvedHeroName = ''
        if (resolvedHeroId) {
          resolvedHeroName = profile?.name || '이름 없는 영웅'
          if (!profile?.name) {
            const heroResult = await withTable(supabase, 'heroes', (table) =>
              supabase.from(table).select('id, name').eq('id', resolvedHeroId).maybeSingle(),
            )
            if (!heroResult.error && heroResult.data?.name) {
              resolvedHeroName = heroResult.data.name.trim() || '이름 없는 영웅'
            }
          }
        }

        let resolvedOwnerId =
          profile?.owner_id || profile?.user_id || storedOwnerId || viewerOwnerKey || null

        if (viewerOwnerKey && resolvedOwnerId && resolvedOwnerId !== viewerOwnerKey) {
          clearHeroSelection()
          resolvedHeroId = ''
          resolvedHeroName = ''
          resolvedOwnerId = viewerOwnerKey
        }

        if (resolvedHeroId && resolvedOwnerId) {
          persistHeroSelection({ id: resolvedHeroId }, resolvedOwnerId)
        } else if (viewerOwnerKey) {
          persistHeroOwner(viewerOwnerKey)
        }

        if (mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            heroId: resolvedHeroId,
            heroName: resolvedHeroId ? resolvedHeroName || '이름 없는 영웅' : '',
            ownerId: resolvedOwnerId || viewerOwnerKey || null,
            userId: viewerOwnerKey || storedAuthSnapshot?.userId || null,
            role: resolvedHeroId && resolvedHeroId === prev.heroId ? prev.role : '',
          }))
        }
      } catch (viewerError) {
        console.error('[RoomDetail] Failed to resolve viewer hero:', viewerError)
        if (mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            heroId: '',
            heroName: '',
            ownerId: prev.ownerId || storedAuthSnapshot?.userId || null,
            userId: prev.userId || storedAuthSnapshot?.userId || null,
            role: '',
          }))
        }
      } finally {
        if (mountedRef.current) {
          setViewerLoading(false)
        }
      }
    },
    [storedAuthSnapshot?.userId],
  )

  useEffect(() => {
    loadViewerHero(heroParam)
  }, [heroParam, loadViewerHero])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleStorage = (event) => {
      if (event.key && event.key !== HERO_ID_KEY && event.key !== HERO_OWNER_KEY) {
        return
      }
      loadViewerHero(heroParam)
    }
    const handleOverlayRefresh = () => loadViewerHero(heroParam)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('hero-overlay:refresh', handleOverlayRefresh)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('hero-overlay:refresh', handleOverlayRefresh)
    }
  }, [heroParam, loadViewerHero])
  const loadRoom = useCallback(
    async (mode = 'initial') => {
      if (!roomId) return
      if (mode === 'refresh') {
        setRefreshing(true)
      } else if (mode === 'initial') {
        setLoading(true)
      }
      setError('')
      setActionError('')
      try {
        const roomResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase
            .from(table)
            .select(
              [
                'id',
                'game_id',
                'owner_id',
                'code',
                'mode',
                'status',
                'realtime_mode',
                'score_window',
                'host_role_limit',
                'brawl_rule',
                'blind_mode',
                'created_at',
                'updated_at',
              ].join(','),
            )
            .eq('id', roomId)
            .maybeSingle(),
        )

        if (roomResult.error && roomResult.error.code !== 'PGRST116') {
          throw roomResult.error
        }

        const roomRow = roomResult.data
        if (!roomRow) {
          throw new Error('방 정보를 찾을 수 없습니다.')
        }

        const realtimeMode = normalizeRealtimeMode(roomRow.realtime_mode)
        const hostRoleLimit =
          realtimeMode === 'pulse' && Number.isFinite(Number(roomRow.host_role_limit))
            ? Math.max(1, Math.floor(Number(roomRow.host_role_limit)))
            : null
        const brawlRule = parseBrawlRule(roomRow.brawl_rule)
        const dropInEnabled = isDropInEnabled({ realtimeMode, brawlRule })

        const baseRoom = {
          id: roomRow.id,
          gameId: roomRow.game_id || '',
          ownerId: roomRow.owner_id || null,
          code: roomRow.code || '미지정',
          mode: roomRow.mode || '모드 미지정',
          status: roomRow.status || '상태 미지정',
          scoreWindow: Number.isFinite(Number(roomRow.score_window))
            ? Number(roomRow.score_window)
            : null,
          realtimeMode,
          hostRoleLimit,
          brawlRule,
          dropInEnabled,
          blindMode: roomRow.blind_mode === true,
          updatedAt: roomRow.updated_at || roomRow.created_at || null,
        }

        let gameName = '알 수 없는 게임'
        if (baseRoom.gameId) {
          const gameResult = await withTable(supabase, 'rank_games', (table) =>
            supabase.from(table).select('id, name').eq('id', baseRoom.gameId).maybeSingle(),
          )
          if (gameResult.error && gameResult.error.code !== 'PGRST116') {
            throw gameResult.error
          }
          if (gameResult.data?.name) {
            gameName = gameResult.data.name.trim() || gameName
          }
        }

        const slotResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .select('id, slot_index, role, occupant_owner_id, occupant_hero_id, occupant_ready, joined_at')
            .eq('room_id', roomId)
            .order('slot_index', { ascending: true }),
        )

        let slotRows = []
        if (slotResult.error && slotResult.error.code !== 'PGRST116') {
          console.warn('[RoomDetail] Failed to load slots:', slotResult.error)
        } else {
          slotRows = Array.isArray(slotResult.data) ? slotResult.data : []
        }

        let activeIndexes = null
        if (baseRoom.gameId) {
          const templateResult = await withTable(supabase, 'rank_game_slots', (table) =>
            supabase
              .from(table)
              .select('slot_index, active')
              .eq('game_id', baseRoom.gameId)
              .order('slot_index', { ascending: true }),
          )

          const templates =
            templateResult.error && templateResult.error.code !== 'PGRST116'
              ? []
              : Array.isArray(templateResult.data)
              ? templateResult.data
              : []

          if (templateResult.error && templateResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load game slot template:', templateResult.error)
          }
          activeIndexes = new Set(
            templates
              .filter((template) => template?.active ?? true)
              .map((template) => template.slot_index),
          )
        }

        const filteredSlots =
          activeIndexes && activeIndexes.size
            ? slotRows.filter((row) => activeIndexes.has(row.slot_index))
            : slotRows

        const heroIds = filteredSlots
          .map((row) => row?.occupant_hero_id)
          .filter(
            (value, index, self) =>
              typeof value === 'string' && value && self.indexOf(value) === index,
          )

        let heroMap = new Map()
        if (heroIds.length) {
          const heroResult = await withTable(supabase, 'heroes', (table) =>
            supabase.from(table).select('id, name').in('id', heroIds),
          )
          if (heroResult.error && heroResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load hero names:', heroResult.error)
          } else {
            const heroRows = Array.isArray(heroResult.data) ? heroResult.data : []
            heroMap = new Map(heroRows.map((row) => [row.id, row]))
          }
        }

        let hostRating = null
        if (baseRoom.ownerId && baseRoom.gameId) {
          const hostResult = await withTable(supabase, 'rank_participants', (table) =>
            supabase
              .from(table)
              .select('rating')
              .eq('game_id', baseRoom.gameId)
              .eq('owner_id', baseRoom.ownerId)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          )
          if (hostResult.error && hostResult.error.code !== 'PGRST116') {
            console.warn('[RoomDetail] Failed to load host rating:', hostResult.error)
          } else {
            const ratingValue = Number(hostResult.data?.rating)
            if (Number.isFinite(ratingValue)) {
              hostRating = ratingValue
            }
          }
        }

        const normalizedSlots = filteredSlots
          .map((row) => {
            const roleName = row?.role?.trim?.() || '역할 미지정'
            const occupantHeroId = row?.occupant_hero_id || null
            const heroRow = occupantHeroId ? heroMap.get(occupantHeroId) : null
            return {
              id: row.id,
              slotIndex: Number(row.slot_index) || 0,
              role: roleName,
              occupantOwnerId: row?.occupant_owner_id || null,
              occupantHeroId,
              occupantHeroName:
                heroRow?.name?.trim?.() || (occupantHeroId ? '이름 없는 영웅' : '비어 있음'),
              occupantReady: !!row?.occupant_ready,
              joinedAt: row?.joined_at || null,
            }
          })
          .sort((a, b) => a.slotIndex - b.slotIndex)

        if (!mountedRef.current) return

        const slotCount = normalizedSlots.length
        const filledCount = normalizedSlots.filter((slot) => !!slot.occupantOwnerId).length
        const readyCount = normalizedSlots.filter((slot) => !!slot.occupantReady).length
        const allFilled = slotCount && filledCount >= slotCount
        const anyOccupied = filledCount > 0
        const nextStatus = (() => {
          if (baseRoom.dropInEnabled) {
            if (allFilled || anyOccupied) {
              return 'brawl'
            }
            return 'open'
          }
          if (allFilled) {
            return 'in_progress'
          }
          return 'open'
        })()

        const normalizedHostLimit = baseRoom.realtimeMode === 'pulse' ? baseRoom.hostRoleLimit : null
        const numericHostLimit = Number.isFinite(Number(normalizedHostLimit))
          ? Math.max(1, Math.floor(Number(normalizedHostLimit)))
          : null

        const needsUpdate =
          Number(roomRow.slot_count) !== slotCount ||
          Number(roomRow.filled_count) !== filledCount ||
          Number(roomRow.ready_count) !== readyCount ||
          (roomRow.status || '') !== nextStatus ||
          (baseRoom.realtimeMode === 'pulse'
            ? Number(roomRow.host_role_limit) !== numericHostLimit
            : roomRow.host_role_limit !== null)

        if (needsUpdate && canSyncRoomCounters) {
          try {
            const token = await resolveAccessToken()
            if (!token) {
              throw new Error('missing_access_token')
            }

            const response = await fetch('/api/rank/sync-room-counters', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                room_id: roomId,
                slot_count: slotCount,
                filled_count: filledCount,
                ready_count: readyCount,
                status: nextStatus,
                host_role_limit: baseRoom.realtimeMode === 'pulse' ? numericHostLimit : null,
              }),
            })

            if (!response.ok) {
              let detail = null
              try {
                detail = await response.json()
              } catch (parseError) {
                detail = null
              }

              const supabaseError = detail?.supabaseError || detail || null
              const messageCandidates = [
                detail?.error,
                detail?.message,
                supabaseError?.code,
                supabaseError?.message,
                supabaseError?.hint,
                supabaseError?.details,
              ].filter(Boolean)
              const normalizedMessage = messageCandidates.join(' | ') || 'room_counter_sync_failed'

              addSupabaseDebugEvent({
                source: 'room-counter-sync',
                operation: 'update_rank_room_counters',
                status: response.status,
                error: supabaseError,
                message: normalizedMessage,
                payload: {
                  roomId,
                  slotCount,
                  filledCount,
                  readyCount,
                  status: nextStatus,
                  hostRoleLimit: baseRoom.realtimeMode === 'pulse' ? numericHostLimit : null,
                },
              })

              const error = new Error(normalizedMessage)
              error.payload = detail
              if (supabaseError) {
                error.supabaseError = supabaseError
                if (!error.code && supabaseError.code) {
                  error.code = supabaseError.code
                }
              }
              throw error
            }
          } catch (updateError) {
            console.warn('[RoomDetail] Failed to sync room counters:', updateError)
          }
        } else if (needsUpdate && !canSyncRoomCounters) {
          console.debug('[RoomDetail] Skipping counter sync for viewer without host session access')
        }

        const resolvedRoom = {
          ...baseRoom,
          status: nextStatus,
          gameName,
          hostRating,
        }

        const rosterSnapshot = buildRosterFromSlots(normalizedSlots)
        const templateTimestampSource = (() => {
          if (typeof roomRow?.updated_at === 'string') {
            const parsed = new Date(roomRow.updated_at)
            if (!Number.isNaN(parsed.getTime())) {
              return parsed.getTime()
            }
          }
          if (typeof roomRow?.created_at === 'string') {
            const parsed = new Date(roomRow.created_at)
            if (!Number.isNaN(parsed.getTime())) {
              return parsed.getTime()
            }
          }
          return Date.now()
        })()

        const slotTemplateSnapshot = {
          slots: rosterSnapshot.length ? buildSlotLayoutFromRoster(rosterSnapshot) : [],
          roles: rosterSnapshot.length ? buildRolesFromRoster(rosterSnapshot) : [],
          version: templateTimestampSource,
          updatedAt: templateTimestampSource,
          source: 'room-load',
        }

        setRoom(resolvedRoom)
        setSlots(normalizedSlots)
        if (baseRoom.gameId) {
          setGameMatchSlotTemplate(baseRoom.gameId, slotTemplateSnapshot)
        }
        setLastLoadedAt(new Date())
      } catch (loadError) {
        console.error('[RoomDetail] Failed to load room:', loadError)
        if (mountedRef.current) {
          setError(resolveErrorMessage(loadError))
        }
      } finally {
        if (!mountedRef.current) return
        if (mode === 'initial') {
          setLoading(false)
          setRefreshing(false)
        } else if (mode === 'refresh') {
          setRefreshing(false)
        }
      }
    },
    [roomId, canSyncRoomCounters, isHost, resolveAccessToken],
  )

  useEffect(() => {
    if (!roomId) return
    loadRoom('initial')
  }, [roomId, loadRoom])

  useEffect(() => {
    if (!roomId || typeof window === 'undefined') return undefined
    const intervalId = window.setInterval(() => {
      loadRoom('passive')
    }, ROOM_AUTO_REFRESH_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
    }
  }, [roomId, loadRoom])

  useEffect(() => {
    if (!roomId) return undefined

    const channel = supabase
      .channel(`room-slots:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rank_room_slots',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload
          const prevOwner = oldRow?.occupant_owner_id || null
          const nextOwner = newRow?.occupant_owner_id || null
          const prevHero = oldRow?.occupant_hero_id || null
          const nextHero = newRow?.occupant_hero_id || null
          const occupantChanged =
            eventType === 'DELETE' ||
            eventType === 'INSERT' ||
            prevOwner !== nextOwner ||
            prevHero !== nextHero

          if (!occupantChanged) {
            return
          }

          if (slotRefreshTimeoutRef.current) {
            clearTimeout(slotRefreshTimeoutRef.current)
          }

          slotRefreshTimeoutRef.current = setTimeout(() => {
            loadRoom('passive')
            slotRefreshTimeoutRef.current = null
          }, 120)
        },
      )
      .subscribe()

    return () => {
      if (slotRefreshTimeoutRef.current) {
        clearTimeout(slotRefreshTimeoutRef.current)
        slotRefreshTimeoutRef.current = null
      }
      if (typeof channel.unsubscribe === 'function') {
        channel.unsubscribe()
      }
      if (typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(channel)
      }
    }
  }, [roomId, loadRoom])

  useEffect(() => {
    const nextActive = viewer.ownerId
      ? slots.find((slot) => slot.occupantOwnerId === viewer.ownerId)?.id || null
      : null
    setActiveSlotId((prev) => (prev === nextActive ? prev : nextActive))
  }, [slots, viewer.ownerId])

  useEffect(() => {
    if (!room?.gameId || !viewer.ownerId) {
      setViewer((prev) => ({ ...prev, rating: null, role: '' }))
      return
    }

    let cancelled = false

    const loadRating = async () => {
      try {
        const ratingResult = await withTable(supabase, 'rank_participants', (table) =>
          supabase
            .from(table)
            .select('rating, role')
            .eq('game_id', room.gameId)
            .eq('owner_id', viewer.ownerId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        )
        if (ratingResult.error && ratingResult.error.code !== 'PGRST116') {
          throw ratingResult.error
        }
        const ratingValue = Number(ratingResult.data?.rating)
        const roleValue =
          typeof ratingResult.data?.role === 'string' ? ratingResult.data.role.trim() : ''
        if (!cancelled && mountedRef.current) {
          setViewer((prev) => ({
            ...prev,
            rating: Number.isFinite(ratingValue) ? ratingValue : null,
            role: roleValue,
          }))
        }
      } catch (ratingError) {
        console.error('[RoomDetail] Failed to load viewer rating:', ratingError)
        if (!cancelled && mountedRef.current) {
          setViewer((prev) => ({ ...prev, rating: null, role: '' }))
        }
      }
    }

    loadRating()

    return () => {
      cancelled = true
    }
  }, [room?.gameId, viewer.ownerId])
  const leaveRoom = useCallback(
    async ({ silent = false, skipReload = false } = {}) => {
      if (!viewer.ownerId || !activeSlotId) return
      if (!silent) {
        setLeavePending(true)
        setActionError('')
      }
      try {
        const leaveResult = await withTable(supabase, 'rank_room_slots', (table) =>
          supabase
            .from(table)
            .update({
              occupant_owner_id: null,
              occupant_hero_id: null,
              occupant_ready: false,
              joined_at: null,
            })
            .eq('id', activeSlotId)
            .eq('occupant_owner_id', viewer.ownerId),
        )
        if (leaveResult.error && leaveResult.error.code !== 'PGRST116') {
          throw leaveResult.error
        }
        if (!skipReload) {
          await loadRoom('refresh')
        }
        if (mountedRef.current) {
          setActiveSlotId((prev) => (prev === activeSlotId ? null : prev))
        }
      } catch (leaveError) {
        if (!silent) {
          console.error('[RoomDetail] Failed to leave room:', leaveError)
          if (mountedRef.current) {
            setActionError(resolveErrorMessage(leaveError))
          }
        }
      } finally {
        if (!silent && mountedRef.current) {
          setLeavePending(false)
        }
      }
    },
    [activeSlotId, loadRoom, viewer.ownerId],
  )

  const leaveRoomRef = useRef(leaveRoom)
  useEffect(() => {
    leaveRoomRef.current = leaveRoom
  }, [leaveRoom])

  const cancelParticipantCleanup = useCallback(() => {
    if (participantCleanupState.timerId) {
      clearTimeout(participantCleanupState.timerId)
    }
    participantCleanupState.timerId = null
    participantCleanupState.roomId = null
    participantCleanupState.ownerId = null
    participantCleanupState.slotId = null
  }, [])

  const requestParticipantCleanup = useCallback(
    (snapshot) => {
      const presence = snapshot || latestPresenceRef.current
      const slotId = presence?.activeSlotId || null
      const ownerId = presence?.ownerId || null
      const roomId = presence?.roomId || null
      if (!slotId || !ownerId) return

      if (typeof window === 'undefined') {
        performParticipantCleanup({ slotId, ownerId })
        return
      }

      cancelParticipantCleanup()
      participantCleanupState.roomId = roomId
      participantCleanupState.ownerId = ownerId
      participantCleanupState.slotId = slotId
      participantCleanupState.timerId = window.setTimeout(async () => {
        cancelParticipantCleanup()
        await performParticipantCleanup({ slotId, ownerId })
      }, ROOM_EXIT_DELAY_MS)
    },
    [cancelParticipantCleanup],
  )

  const requestParticipantCleanupRef = useRef(requestParticipantCleanup)
  useEffect(() => {
    requestParticipantCleanupRef.current = requestParticipantCleanup
  }, [requestParticipantCleanup])

  const cancelHostCleanup = useCallback(() => {
    if (hostCleanupState.timerId) {
      clearTimeout(hostCleanupState.timerId)
      hostCleanupState.timerId = null
      hostCleanupState.roomId = null
    }
  }, [])

  const deleteRoom = useCallback(
    async ({ silent = false, skipNavigate = false } = {}) => {
      if (!room?.id || !isHost) return
      cancelHostCleanup()
      if (!silent) {
        setDeletePending(true)
        setActionError('')
      }
      try {
        const deleteResult = await withTable(supabase, 'rank_rooms', (table) =>
          supabase.from(table).delete().eq('id', room.id),
        )
        if (deleteResult.error && deleteResult.error.code !== 'PGRST116') {
          throw deleteResult.error
        }
        if (!skipNavigate) {
          router.replace('/rooms')
        }
      } catch (deleteError) {
        if (!silent) {
          console.error('[RoomDetail] Failed to delete room:', deleteError)
          if (mountedRef.current) {
            setActionError(resolveErrorMessage(deleteError))
          }
        }
      } finally {
        if (!silent && mountedRef.current) {
          setDeletePending(false)
        }
      }
    },
    [cancelHostCleanup, isHost, room?.id, router],
  )

  const requestHostCleanup = useCallback(() => {
    if (!isHost || !room?.id) return
    if (typeof window === 'undefined') {
      deleteRoom({ silent: true, skipNavigate: true })
      return
    }
    cancelHostCleanup()
    hostCleanupState.roomId = room.id
    hostCleanupState.timerId = window.setTimeout(() => {
      cancelHostCleanup()
      deleteRoom({ silent: true, skipNavigate: true })
    }, HOST_CLEANUP_DELAY_MS)
  }, [cancelHostCleanup, deleteRoom, isHost, room?.id])

  const requestHostCleanupRef = useRef(requestHostCleanup)
  useEffect(() => {
    requestHostCleanupRef.current = requestHostCleanup
  }, [requestHostCleanup])

  useEffect(() => {
    latestPresenceRef.current = {
      activeSlotId,
      ownerId: viewer.ownerId,
      isHost,
      roomId: room?.id ?? null,
    }
  }, [activeSlotId, isHost, room?.id, viewer.ownerId])

  useEffect(() => {
    cancelParticipantCleanup()
  }, [cancelParticipantCleanup])

  useEffect(() => {
    if (activeSlotId && viewer.ownerId && room?.id) {
      cancelParticipantCleanup()
    }
  }, [activeSlotId, cancelParticipantCleanup, room?.id, viewer.ownerId])

  const handleJoin = useCallback(async () => {
    if (!hasActiveApiKey) {
      setActionError('AI API 키를 사용 설정해야 방에 참여할 수 있습니다.')
      return
    }
    if (!roomId) return
    if (!viewer.ownerId) {
      setActionError('로그인이 필요합니다.')
      return
    }
    if (!viewer.heroId) {
      setActionError('참여할 캐릭터를 먼저 선택해 주세요.')
      return
    }
    const dropInEnabled = room?.dropInEnabled
    const normalizedStatus = typeof room?.status === 'string' ? room.status.trim() : ''
    const inProgress = normalizedStatus === 'in_progress' || normalizedStatus === 'battle'
    if (inProgress && !dropInEnabled) {
      setActionError('이미 진행 중인 전투에는 참여할 수 없습니다.')
      return
    }
    const normalizedViewerRole = normalizeRole(viewer.role)
    if (!normalizedViewerRole) {
      setActionError('이 캐릭터의 역할 정보를 불러오지 못했습니다. 다시 시도해 주세요.')
      return
    }
    if (room?.realtimeMode === 'pulse' && Number.isFinite(Number(room?.hostRoleLimit))) {
      const hostSlot = slots.find((slot) => slot.occupantOwnerId && room?.ownerId && slot.occupantOwnerId === room.ownerId)
      const hostRole = normalizeRole(hostSlot?.role)
      const numericLimit = Math.max(1, Math.floor(Number(room.hostRoleLimit)))
      if (hostRole && normalizedViewerRole === hostRole) {
        const sameRoleFilled = slots.filter((slot) => {
          if (!slot?.occupantOwnerId) return false
          return normalizeRole(slot.role) === hostRole
        }).length
        if (sameRoleFilled >= numericLimit) {
          setActionError(`방장과 같은 역할군은 최대 ${numericLimit}명까지만 참여할 수 있습니다.`)
          return
        }
      }
    }
    const availableSlots = slots.filter((slot) => !slot.occupantOwnerId)
    if (!availableSlots.length) {
      setActionError('비어 있는 슬롯이 없습니다.')
      return
    }
    const exactMatch = availableSlots.find(
      (slot) => normalizeRole(slot.role) === normalizedViewerRole,
    )
    const flexibleMatch = availableSlots.find((slot) => isFlexibleRole(slot.role))
    const targetSlot = exactMatch || flexibleMatch
    if (!targetSlot) {
      setActionError('이 역할에 맞는 빈 슬롯이 없습니다.')
      return
    }
    setJoinPending(true)
    setActionError('')
    try {
      const joinResult = await withTable(supabase, 'rank_room_slots', (table) =>
        supabase
          .from(table)
          .update({
            occupant_owner_id: viewer.ownerId,
            occupant_hero_id: viewer.heroId,
            occupant_ready: false,
            joined_at: new Date().toISOString(),
          })
          .eq('id', targetSlot.id)
          .is('occupant_owner_id', null)
          .select('id')
          .maybeSingle(),
      )
      if (joinResult.error && joinResult.error.code !== 'PGRST116') {
        throw joinResult.error
      }
      await loadRoom('refresh')
    } catch (joinError) {
      console.error('[RoomDetail] Failed to join room:', joinError)
      if (mountedRef.current) {
        setActionError(resolveErrorMessage(joinError))
      }
    } finally {
      if (mountedRef.current) {
        setJoinPending(false)
      }
    }
  }, [
    hasActiveApiKey,
    loadRoom,
    roomId,
    slots,
    viewer.heroId,
    viewer.ownerId,
    viewer.role,
  ])

  const handleRefresh = useCallback(() => {
    loadRoom('refresh')
  }, [loadRoom])

  useEffect(() => {
    return () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        requestParticipantCleanupRef.current({
          activeSlotId: latestSlotId,
          ownerId,
          roomId,
        })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
  }, [])

  useEffect(() => {
    const handleRouteChange = () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        requestParticipantCleanupRef.current({
          activeSlotId: latestSlotId,
          ownerId,
          roomId,
        })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
    router.events.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router.events])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleBeforeUnload = () => {
      const { activeSlotId: latestSlotId, ownerId, isHost: latestIsHost, roomId } =
        latestPresenceRef.current
      if (latestSlotId && ownerId) {
        requestParticipantCleanupRef.current({
          activeSlotId: latestSlotId,
          ownerId,
          roomId,
        })
      }
      if (latestIsHost && roomId) {
        requestHostCleanupRef.current()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (isHost && room?.id) {
      cancelHostCleanup()
    }
  }, [cancelHostCleanup, isHost, room?.id])

  const joined = !!activeSlotId
  const matchReadyMode = useMemo(() => resolveMatchReadyMode(room?.mode), [room?.mode])
  const hostRatingText = Number.isFinite(room?.hostRating)
    ? `${room.hostRating}점`
    : '정보 없음'
  const realtimeLabel = useMemo(() => {
    if (!room) return '알 수 없음'
    if (!isRealtimeEnabled(room.realtimeMode)) return '비실시간'
    if (room.realtimeMode === 'pulse') return 'Pulse 실시간'
    return '실시간'
  }, [room])
  const statusLabel = useMemo(() => {
    const normalized = typeof room?.status === 'string' ? room.status.trim() : ''
    if (normalized === 'brawl') return '난전'
    if (normalized === 'in_progress' || normalized === 'battle') return '게임중'
    if (normalized === 'open') return '대기'
    return normalized || '알 수 없음'
  }, [room?.status])
  const hostLimitLabel = useMemo(() => {
    if (!room || room.realtimeMode !== 'pulse') return ''
    if (!Number.isFinite(Number(room.hostRoleLimit))) return ''
    const numeric = Math.max(1, Math.floor(Number(room.hostRoleLimit)))
    return `같은 역할 최대 ${numeric}명`
  }, [room])
  const dropInMessage = useMemo(() => {
    if (!room?.dropInEnabled) return ''
    if (room?.status === 'brawl') return '난전 진행 중: 탈락한 역할군에 새 참가자가 합류할 수 있습니다.'
    if (room?.status === 'open') return '난전 규칙이 활성화된 방입니다. 전투 중에도 빈 슬롯에 합류할 수 있습니다.'
    return '난전 규칙이 활성화되어 있어 빈 슬롯에 재충원이 가능합니다.'
  }, [room?.dropInEnabled, room?.status])

  const overviewPanel = (
    <section style={styles.overviewSection}>
      <h2 style={styles.sectionTitle}>방 개요</h2>
      <div style={styles.overviewGrid}>
        <div style={styles.overviewCard}>
          <span style={styles.overviewLabel}>참여 인원</span>
          <span style={styles.overviewValue}>
            {occupancy.filled}/{occupancy.total}
          </span>
          <span style={styles.overviewSubtle}>준비 완료 {readyCount}명</span>
        </div>
        <div style={styles.overviewCard}>
          <span style={styles.overviewLabel}>방장</span>
          <span style={styles.overviewValue}>{hostDisplayName}</span>
          <span style={styles.overviewSubtle}>{hostReadyLabel}</span>
        </div>
        <div style={styles.overviewCard}>
          <span style={styles.overviewLabel}>점수 범위</span>
          <span style={styles.overviewValue}>{scoreWindowLabel}</span>
          {hostLimitLabel ? <span style={styles.overviewSubtle}>{hostLimitLabel}</span> : null}
        </div>
        <div style={styles.overviewCard}>
          <span style={styles.overviewLabel}>난입 규칙</span>
          <span style={styles.overviewValue}>{room?.dropInEnabled ? '허용' : '불가'}</span>
          <span style={styles.overviewSubtle}>
            {room?.dropInEnabled
              ? '전투 중 탈락한 역할군에는 대기 참가자가 난입할 수 있습니다.'
              : '게임 중에는 새로운 참가자가 합류할 수 없습니다.'}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <h3 style={styles.subSectionTitle}>역할별 배치</h3>
        {roleSummaries.length > 0 ? (
          <ul style={styles.roleList}>
            {roleSummaries.map((summary) => (
              <li key={summary.role} style={styles.roleItem}>
                <span style={styles.roleName}>{summary.role}</span>
                <span style={styles.roleCount}>
                  {summary.filled}/{summary.total}명
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div style={styles.overviewEmpty}>활성화된 슬롯이 없습니다.</div>
        )}
      </div>
    </section>
  )

  const participantsPanel = (
    <section style={styles.slotSection}>
      <h2 style={styles.sectionTitle}>슬롯 현황</h2>
      {slots.length === 0 ? (
        <div style={styles.emptyState}>활성화된 슬롯이 없습니다.</div>
      ) : (
        <div style={styles.slotGrid}>
          {slots.map((slot) => {
            const isViewerSlot = viewer.ownerId && slot.occupantOwnerId === viewer.ownerId
            const isHostSlot = room?.ownerId && slot.occupantOwnerId === room.ownerId
            const hideIdentity =
              room?.blindMode &&
              slot.occupantOwnerId &&
              slot.occupantOwnerId !== viewer.ownerId
            const occupantLabel = hideIdentity ? '비공개 참가자' : slot.occupantHeroName
            return (
              <div key={slot.id || `${slot.slotIndex}`} style={styles.slotCard(isViewerSlot)}>
                <div style={styles.slotHeader}>
                  <span style={styles.slotRole}>{slot.role}</span>
                  <span style={styles.slotIndex}>#{slot.slotIndex + 1}</span>
                </div>
                <p style={styles.slotBody}>
                  {slot.occupantOwnerId ? (
                    <>
                      <strong>{occupantLabel}</strong>
                      <br />
                      {slot.occupantReady ? '준비 완료' : '준비 대기'}
                    </>
                  ) : (
                    <>비어 있는 자리</>
                  )}
                </p>
                <div style={styles.slotTags}>
                  {isViewerSlot ? <span style={styles.slotTag}>내 자리</span> : null}
                  {isHostSlot ? <span style={styles.slotTag}>방장</span> : null}
                  {slot.occupantOwnerId && !slot.occupantReady ? (
                    <span style={styles.slotTag}>준비 중</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  let panelContent
  if (loading) {
    panelContent = <div style={styles.loadingState}>방 정보를 불러오는 중입니다...</div>
  } else if (error) {
    panelContent = (
      <section style={styles.errorCard}>
        <h2 style={styles.errorTitle}>방 정보를 불러오지 못했습니다.</h2>
        <p style={styles.errorText}>{error}</p>
        <button type="button" onClick={handleRefresh} style={styles.retryButton}>
          다시 시도
        </button>
      </section>
    )
  } else if (activeTab === 'overview') {
    panelContent = overviewPanel
  } else {
    panelContent = participantsPanel
  }

  const joinDisabled =
    joinPending ||
    !viewer.heroId ||
    !viewer.ownerId ||
    !normalizeRole(viewer.role) ||
    !hasActiveApiKey ||
    (((room?.status === 'in_progress' || room?.status === 'battle') && !room?.dropInEnabled))

  const stageMatch = useCallback(
    async ({ allowPartialStart = false } = {}) => {
      if (typeof window === 'undefined') {
        throw new Error('stage_unavailable')
      }
      if (!room?.gameId) {
        throw new Error('missing_game_id')
      }
      if (!matchReadyMode) {
        throw new Error('missing_match_mode')
      }
      if (!Array.isArray(slots) || !slots.length) {
        throw new Error('missing_slots')
      }
      if (!allowPartialStart) {
        if (!occupancy.total || occupancy.filled !== occupancy.total) {
          throw new Error('slots_incomplete')
        }
      }
      if (!joined) {
        throw new Error('not_joined')
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw sessionError
      }

      let token = sessionData?.session?.access_token || ''
      if (!token) {
        token = await resolveAccessToken()
      }
      if (!token) {
        throw new Error('세션 토큰을 확인할 수 없습니다.')
      }

      let stageSlots = slots.map((slot) => ({ ...slot }))
      let standinAssignments = []
      let standinDiagnostics = null

      if (allowPartialStart && occupancy.total && occupancy.filled < occupancy.total) {
        const standinResult = await fulfillAsyncStandinsForSlots({
          room,
          slots: stageSlots,
          token,
        })
        if (standinResult?.applied) {
          stageSlots = standinResult.slots
          standinAssignments = Array.isArray(standinResult.assignments)
            ? standinResult.assignments
            : []
          standinDiagnostics = standinResult.diagnostics || null
        }
      }

      const payload = buildMatchTransferPayload(room, stageSlots)
      if (!payload) {
        throw new Error('stage_payload_unavailable')
      }

      if (standinAssignments.length || standinDiagnostics) {
        const asyncFillMeta = {
          ...(payload.match?.asyncFillMeta || {}),
        }
        if (standinAssignments.length) {
          asyncFillMeta.assignedStandins = standinAssignments
        }
        if (standinDiagnostics) {
          asyncFillMeta.diagnostics = standinDiagnostics
        }
        payload.match = { ...payload.match, asyncFillMeta }
      }

      const stageResponse = await fetch('/api/rank/stage-room-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          match_instance_id: payload.matchInstanceId,
          room_id: room.id,
          game_id: room.gameId,
          roster: payload.roster,
          hero_map: payload.heroMap,
          slot_template: payload.slotTemplate,
        }),
      })

      if (!stageResponse.ok) {
        let detail = null
        try {
          detail = await stageResponse.json()
        } catch (parseError) {
          detail = null
        }
        const message = detail?.error || 'match_roster_stage_failed'
        throw new Error(message)
      }

      const viewerOwnerKey = viewer.ownerId != null ? String(viewer.ownerId) : ''
      const viewerUserKey = viewer.userId != null ? String(viewer.userId) : viewerOwnerKey
      const heroOptions = Array.from(
        new Set(payload.roster.map((entry) => entry.heroId).filter(Boolean)),
      )

      setGameMatchParticipation(room.gameId, {
        roster: payload.roster,
        heroOptions,
        participantPool: payload.roster,
        heroMap: payload.heroMap,
        realtimeMode: room.realtimeMode,
        hostOwnerId: room.ownerId,
        hostRoleLimit: room.hostRoleLimit,
      })

      setGameMatchHeroSelection(room.gameId, {
        heroId: viewer.heroId || '',
        viewerId: viewerUserKey,
        ownerId: viewerOwnerKey || viewerUserKey,
        role: viewer.role || '',
        heroMeta: viewer.heroId
          ? {
              id: viewer.heroId,
              name: viewer.heroName || '',
              role: viewer.role || '',
              ownerId: viewerOwnerKey || viewerUserKey || null,
            }
          : null,
      })

      const createdAt = payload.match?.roleStatus?.updatedAt || Date.now()

      setGameMatchSnapshot(room.gameId, {
        match: payload.match,
        pendingMatch: null,
        viewerId: viewerUserKey,
        heroId: viewer.heroId || '',
        role: viewer.role || '',
        mode: matchReadyMode || normalizeRoomMode(room.mode),
        createdAt,
      })

      setGameMatchSlotTemplate(room.gameId, {
        ...(payload.slotTemplate || {}),
        slots: payload.slotTemplate?.slots || payload.slotLayout,
        roles: payload.slotTemplate?.roles || payload.roles,
        updatedAt:
          payload.slotTemplate?.updatedAt ||
          payload.match?.roleStatus?.updatedAt ||
          createdAt,
        version:
          payload.slotTemplate?.version ||
          payload.match?.roleStatus?.version ||
          payload.match?.roleStatus?.updatedAt ||
          payload.match?.roleStatus?.timestamp ||
          createdAt,
        source: payload.slotTemplate?.source || 'room-stage',
      })

      setGameMatchSessionMeta(room.gameId, {
        turnTimer: payload.match?.turnTimer ?? null,
        dropIn: payload.match?.dropInMeta ?? null,
        asyncFill: payload.match?.asyncFillMeta ?? null,
        source: 'room-stage',
      })

      const nextRoute = {
        pathname: `/rank/${room.gameId}/match-ready`,
        query: { mode: matchReadyMode },
      }

      await router.replace(nextRoute)
    },
    [
      joined,
      matchReadyMode,
      occupancy.filled,
      occupancy.total,
      room,
      router,
      slots,
      supabase,
      resolveAccessToken,
      viewer.heroId,
      viewer.heroName,
      viewer.ownerId,
      viewer.role,
      viewer.userId,
    ],
  )

  useEffect(() => {
    if (autoRedirectRef.current) return
    if (typeof window === 'undefined') return
    if (!room?.gameId) return
    if (!matchReadyMode) return
    if (!Array.isArray(slots) || !slots.length) return
    if (!occupancy.total || occupancy.filled !== occupancy.total) return
    if (!joined) return

    autoRedirectRef.current = true

    ;(async () => {
      try {
        await stageMatch({ allowPartialStart: false })
      } catch (stageError) {
        console.error('[RoomDetail] Failed to stage match data before redirect:', stageError)
        autoRedirectRef.current = false
        if (mountedRef.current) {
          setActionError(resolveErrorMessage(stageError))
        }
      }
    })()
  }, [
    joined,
    matchReadyMode,
    occupancy.filled,
    occupancy.total,
    room?.gameId,
    slots,
    stageMatch,
  ])

  const handleAsyncStart = useCallback(async () => {
    if (manualStagePending) return
    if (!room?.gameId) return
    if (
      !isHost ||
      isRealtimeEnabled(room?.realtimeMode) ||
      !joined ||
      !occupancy.total ||
      occupancy.filled >= occupancy.total
    ) {
      return
    }
    autoRedirectRef.current = true
    setActionError('')
    setManualStagePending(true)
    try {
      await stageMatch({ allowPartialStart: true })
    } catch (startError) {
      console.error('[RoomDetail] Failed to start match with async fill:', startError)
      autoRedirectRef.current = false
      if (mountedRef.current) {
        setActionError(resolveErrorMessage(startError))
      }
    } finally {
      if (mountedRef.current) {
        setManualStagePending(false)
      }
    }
  }, [
    joined,
    manualStagePending,
    occupancy.filled,
    occupancy.total,
    room?.gameId,
    room?.realtimeMode,
    stageMatch,
    isHost,
  ])

  const allowAsyncStart =
    isHost &&
    !isRealtimeEnabled(room?.realtimeMode) &&
    joined &&
    occupancy.total > 0 &&
    occupancy.filled < occupancy.total

  const asyncStartDisabled = !allowAsyncStart || manualStagePending

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.titleBlock}>
              <h1 style={styles.title}>{room?.gameName || '방 세부 정보'}</h1>
              <p style={styles.subtitle}>
                {room
                  ? `${room.mode} · 코드 ${room.code} · ${formatRelativeTime(room.updatedAt)} 업데이트`
                  : '방 정보를 불러오는 중입니다.'}
              </p>
            </div>
            <Link href="/rooms" style={styles.backLink} prefetch>
              방 목록으로
            </Link>
          </div>
          <div style={styles.metaRow}>
            <span>상태: {statusLabel}</span>
            <span>실시간: {realtimeLabel}</span>
            <span>방장 점수: {hostRatingText}</span>
            <span>허용 범위: {scoreWindowLabel}</span>
            <span>
              인원: {occupancy.filled}/{occupancy.total}
            </span>
            {Number.isFinite(viewer.rating) ? <span>내 점수: {viewer.rating}점</span> : null}
            {absoluteDelta !== null ? (
              <span>
                방장과 차이: {ratingDelta >= 0 ? '+' : '-'}
                {absoluteDelta}
              </span>
            ) : null}
            {hostLimitLabel ? <span>{hostLimitLabel}</span> : null}
            {room?.dropInEnabled ? <span>난전 허용</span> : null}
            {lastLoadedAt ? <span>새로고침: {formatRelativeTime(lastLoadedAt)}</span> : null}
          </div>
          {room?.blindMode ? (
            <div style={styles.blindNotice}>
              블라인드 모드가 활성화된 방입니다. 게임이 시작되기 전까지는 다른 참가자의 캐릭터와 이름이
              공개되지 않습니다.
            </div>
          ) : null}
          {dropInMessage ? <div style={styles.statusHint}>{dropInMessage}</div> : null}
          {creationFeedback ? (
            <div style={styles.creationFeedback}>
              <span style={styles.creationFeedbackStrong}>새로 만든 방이 준비되었습니다.</span>{' '}
              {creationFeedback.hostSeated
                ? '방장이 자동으로 자리에 착석했고 현재 준비 상태는 대기입니다. '
                : '방장 자리가 아직 비어 있습니다. '}
              {Number.isFinite(creationFeedback.hostRating)
                ? (
                    <>
                      내 현재 점수는{' '}
                      <span style={styles.creationFeedbackStrong}>
                        {creationFeedback.hostRating}점
                      </span>
                      입니다.
                    </>
                  )
                : null}
              {' '}필요하면 바로 준비 완료를 눌러 다른 참가자에게 상태를 알릴 수 있어요.
            </div>
          ) : null}
          <div style={styles.heroSummary}>
            {viewerLoading ? (
              <span>캐릭터 정보를 불러오는 중...</span>
            ) : viewer.heroId ? (
              <span>
                선택 캐릭터: <strong>{viewer.heroName || '이름 없는 영웅'}</strong>
                {normalizeRole(viewer.role) ? (
                  <>
                    {' '}
                    <em style={{ color: '#facc15' }}>({viewer.role})</em>
                  </>
                ) : null}
              </span>
            ) : (
              <span>선택된 캐릭터가 없습니다. 캐릭터를 선택하면 참여할 수 있습니다.</span>
            )}
            {room?.gameName ? <span>게임: {room.gameName}</span> : null}
          </div>
          {!hasActiveApiKey ? (
            <div style={styles.keyRequirement}>
              AI API 키를 사용 설정해야 이 방에 참여할 수 있습니다. 방 찾기 상단의 AI API 키 관리에서 키를 등록하고 활성화해 주세요.
            </div>
          ) : null}
          <div style={styles.actionsRow}>
            <button
              type="button"
              onClick={handleRefresh}
              style={styles.secondaryButton(refreshing)}
              disabled={refreshing}
            >
              {refreshing ? '새로고침 중...' : '정보 새로고침'}
            </button>
            {joined ? (
              <button
                type="button"
                onClick={() => leaveRoom()}
                style={styles.secondaryButton(leavePending)}
                disabled={leavePending}
              >
                {leavePending ? '나가는 중...' : '방 나가기'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                style={styles.primaryButton(joinDisabled)}
                disabled={joinDisabled}
              >
                {joinPending ? '참여 중...' : '빈 슬롯 참여'}
              </button>
            )}
            {allowAsyncStart ? (
              <button
                type="button"
                onClick={handleAsyncStart}
                style={styles.primaryButton(asyncStartDisabled)}
                disabled={asyncStartDisabled}
              >
                {manualStagePending ? '매치 준비 중...' : '자동 충원으로 시작'}
              </button>
            ) : null}
            {isHost ? (
              <button
                type="button"
                onClick={() => deleteRoom()}
                style={styles.dangerButton(deletePending)}
                disabled={deletePending}
              >
                {deletePending ? '방 삭제 중...' : '방 닫기'}
              </button>
            ) : null}
          </div>
          {actionError ? <p style={styles.infoText}>{actionError}</p> : null}
          {allowAsyncStart ? (
            <p style={styles.asyncStartHint}>
              부족한 인원은 자동 충원 대기열에서 채워지며 본게임에서만 세부 정보가 공개됩니다.
            </p>
          ) : null}
        </header>

        <nav style={styles.tabBar}>
          {ROOM_DETAIL_TABS.map((tab) => {
            const active = activeTab === tab.id
            const handleClick = () => {
              if (!active) {
                setActiveTab(tab.id)
              }
            }
            const badge =
              tab.id === 'participants' ? (
                <span style={styles.tabBadge}>
                  {occupancy.filled}/{occupancy.total}
                </span>
              ) : null
            return (
              <button
                key={tab.id}
                type="button"
                onClick={handleClick}
                style={styles.tabButton(active)}
              >
                <span style={styles.tabButtonLabel}>
                  {tab.label}
                  {badge}
                </span>
              </button>
            )
          })}
        </nav>

        {panelContent}
      </div>
    </div>
  )
}
