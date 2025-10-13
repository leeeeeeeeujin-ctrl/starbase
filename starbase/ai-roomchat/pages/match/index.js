import Head from 'next/head'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import SharedChatDock, { SharedChatDockProvider } from '@/components/common/SharedChatDock'
import { supabase } from '@/lib/supabase'
import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { fetchHeroParticipationBundle } from '@/modules/character/participation'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { subscribeToQueue } from '@/modules/arena/realtimeChannels'
import { persistTicket, readTicket } from '@/modules/arena/ticketStorage'
import {
  persistRankAuthSession,
  persistRankAuthUser,
  readRankAuthSnapshot,
  RANK_AUTH_STORAGE_EVENT,
} from '@/lib/rank/rankAuthStorage'
import { persistRankKeyringSnapshot, readRankKeyringSnapshot } from '@/lib/rank/keyringStorage'
import { normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'

const MATCH_READY_CLIENT_LOADING = {
  padding: '40px 20px',
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: 16,
}

const MatchReadyClient = dynamic(() => import('@/components/rank/MatchReadyClient'), {
  ssr: false,
  loading: () => <div style={MATCH_READY_CLIENT_LOADING}>메인 게임 클라이언트를 불러오는 중…</div>,
})

const KEY_PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  unknown: '기타 모델',
}

const TIME_LIMIT_OPTIONS = [30, 45, 60, 80, 120]
const QUEUE_ID = 'rank-default'
const MATCH_READY_DURATION_MS = 15_000
const MATCH_READY_MESSAGE_SWAP_MS = 5_000
const PENALTY_DURATION_MS = 30_000
const PENALTY_STORAGE_KEY = 'rank-match:penalty-until'
const GAME_SELECTION_STORAGE_KEY = 'rank-match:selected-game'
const KEYRING_LIMIT_FALLBACK = 5

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    padding: '36px 16px 120px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 1040,
    margin: '0 auto',
    display: 'grid',
    gap: 28,
  },
  header: {
    display: 'grid',
    gap: 6,
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 15,
  },
  layout: {
    display: 'grid',
    gap: 28,
  },
  section: {
    display: 'grid',
    gap: 18,
    padding: '24px 26px',
    borderRadius: 24,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.78)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  sectionHint: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderRadius: 18,
    border: '1px solid rgba(56, 189, 248, 0.35)',
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#bae6fd',
    fontWeight: 700,
  },
  gameGrid: {
    display: 'grid',
    gap: 14,
  },
  gameCard: (selected) => ({
    borderRadius: 18,
    border: selected
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(148, 163, 184, 0.28)',
    background: selected ? 'rgba(37, 99, 235, 0.22)' : 'rgba(15, 23, 42, 0.68)',
    padding: '18px 20px',
    display: 'grid',
    gap: 10,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  }),
  gameName: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  gameDescription: {
    margin: 0,
    color: '#cbd5f5',
    fontSize: 14,
    lineHeight: 1.5,
  },
  gameMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  keyringList: {
    display: 'grid',
    gap: 12,
  },
  keyringRow: (active) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(56, 189, 248, 0.5)'
      : '1px solid rgba(148, 163, 184, 0.24)',
    background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.6)',
    fontSize: 13,
  }),
  keyringActions: {
    display: 'flex',
    gap: 8,
  },
  smallButton: (loading) => ({
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: loading ? 'rgba(30, 41, 59, 0.45)' : 'rgba(15, 23, 42, 0.55)',
    color: loading ? '#64748b' : '#e2e8f0',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  primaryButton: (disabled) => ({
    padding: '14px 24px',
    borderRadius: 999,
    border: 'none',
    background: disabled ? 'rgba(30, 41, 59, 0.45)' : 'rgba(59, 130, 246, 0.82)',
    color: disabled ? '#64748b' : '#f8fafc',
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  statusCard: {
    display: 'grid',
    gap: 12,
    padding: '20px 22px',
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  statusHeader: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  statusHint: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.55)',
    color: '#cbd5f5',
    fontWeight: 600,
    fontSize: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    margin: 0,
  },
  infoText: {
    color: '#f8fafc',
    fontSize: 14,
    margin: 0,
  },
  timeLimitOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeLimitButton: (active) => ({
    padding: '12px 18px',
    borderRadius: 16,
    border: active ? '1px solid rgba(56, 189, 248, 0.55)' : '1px solid rgba(148, 163, 184, 0.28)',
    background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.6)',
    color: active ? '#bae6fd' : '#cbd5f5',
    fontWeight: 700,
    cursor: 'pointer',
  }),
  chatDock: {
    borderRadius: 26,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.28)',
  },
  gameCard: (selected) => ({
    borderRadius: 18,
    border: selected
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(148, 163, 184, 0.28)',
    background: selected ? 'rgba(37, 99, 235, 0.22)' : 'rgba(15, 23, 42, 0.68)',
    padding: '18px 20px',
    display: 'grid',
    gap: 10,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  }),
  gameName: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  gameDescription: {
    margin: 0,
    color: '#cbd5f5',
    fontSize: 14,
    lineHeight: 1.5,
  },
  gameMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  keyringList: {
    display: 'grid',
    gap: 12,
  },
  keyringRow: (active) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: 16,
    border: active
      ? '1px solid rgba(56, 189, 248, 0.5)'
      : '1px solid rgba(148, 163, 184, 0.24)',
    background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.6)',
    fontSize: 13,
  }),
  keyringActions: {
    display: 'flex',
    gap: 8,
  },
  smallButton: (loading) => ({
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: loading ? 'rgba(30, 41, 59, 0.45)' : 'rgba(15, 23, 42, 0.55)',
    color: loading ? '#64748b' : '#e2e8f0',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  primaryButton: (disabled) => ({
    padding: '14px 24px',
    borderRadius: 999,
    border: 'none',
    background: disabled ? 'rgba(30, 41, 59, 0.45)' : 'rgba(59, 130, 246, 0.82)',
    color: disabled ? '#64748b' : '#f8fafc',
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  statusCard: {
    display: 'grid',
    gap: 12,
    padding: '20px 22px',
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  statusHeader: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  statusHint: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    margin: 0,
  },
  infoText: {
    color: '#f8fafc',
    fontSize: 14,
    margin: 0,
  },
  timeLimitOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeLimitButton: (active) => ({
    padding: '12px 18px',
    borderRadius: 16,
    border: active ? '1px solid rgba(56, 189, 248, 0.55)' : '1px solid rgba(148, 163, 184, 0.28)',
    background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.6)',
    color: active ? '#bae6fd' : '#cbd5f5',
    fontWeight: 700,
    cursor: 'pointer',
  }),
  chatDock: {
    borderRadius: 26,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.28)',
  },
}

function normalizeUserHeaderValue(value) {
  if (value === undefined || value === null) return ''
  const trimmed = typeof value === 'string' ? value.trim() : String(value).trim()
  return trimmed
}

async function requestUserApiKeyring(method, payload, context = {}) {
  const options = { method, headers: {}, credentials: 'include' }
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(payload ?? {})
  }

  const snapshot = readRankAuthSnapshot()
  const headerUserId = normalizeUserHeaderValue(context?.userId || snapshot?.userId)
  const headerAccessToken = normalizeUserHeaderValue(context?.accessToken || snapshot?.accessToken)

  if (headerAccessToken) {
    options.headers.Authorization = `Bearer ${headerAccessToken}`
  }
  if (headerUserId) {
    options.headers['x-rank-user-id'] = headerUserId
    options.headers['x-user-id'] = headerUserId
  }

  const response = await fetch('/api/rank/user-api-keyring', options)
  let data = null
  try {
    data = await response.json()
  } catch (error) {
    if (!response.ok) {
      throw new Error('user-api-keyring 응답을 해석하지 못했습니다.')
    }
  }

  if (!response.ok) {
    const message = data?.detail || data?.error || 'API 키 작업이 실패했습니다.'
    const err = new Error(message)
    err.payload = data
    throw err
  }

  return data || {}
}

function toTimestamp(value) {
  if (!value) return 0
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  return 0
}

function normalizeKeyringEntry(row) {
  if (!row) return null
  return {
    id: row.id || '',
    provider: row.provider || 'unknown',
    modelLabel: row.modelLabel || row.model_label || null,
    apiVersion: row.apiVersion || row.api_version || null,
    geminiMode: row.geminiMode || row.gemini_mode || null,
    geminiModel: row.geminiModel || row.gemini_model || null,
    keySample: row.keySample || row.key_sample || '',
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    isActive: row.isActive === true || row.is_active === true,
  }
}

function mergeKeyringEntries(existing = [], entry, activated) {
  if (!entry) return existing.slice()
  const base = existing.filter((item) => item?.id && item.id !== entry.id)
  const sanitized = activated ? { ...entry, isActive: true } : { ...entry }
  const next = activated ? base.map((item) => ({ ...item, isActive: false })) : base
  next.push(sanitized)
  next.sort((a, b) => toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt))
  return next
}

function sanitizeKeyringStorageEntry(entry) {
  if (!entry) {
    return {
      id: '',
      isActive: false,
      provider: 'unknown',
      modelLabel: null,
      apiVersion: null,
      geminiMode: null,
      geminiModel: null,
      keySample: '',
      createdAt: null,
      updatedAt: null,
    }
  }
  return {
    id: entry.id || '',
    isActive: !!entry.isActive,
    provider: entry.provider || 'unknown',
    modelLabel: entry.modelLabel || null,
    apiVersion: entry.apiVersion || null,
    geminiMode: entry.geminiMode || null,
    geminiModel: entry.geminiModel || null,
    keySample: entry.keySample || '',
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function normalizeSeatEntry(entry) {
  if (!entry) return null
  const slotIndex = Number.isFinite(Number(entry.slot_index))
    ? Number(entry.slot_index)
    : Number.isFinite(Number(entry.slotIndex))
    ? Number(entry.slotIndex)
    : null
  return {
    slotIndex,
    role: entry.role || '',
    ownerId: entry.owner_id || entry.ownerId || null,
    heroId: entry.hero_id || entry.heroId || null,
    heroName: entry.hero_name || entry.heroName || null,
    ready: entry.occupant_ready === true || entry.ready === true,
    updatedAt: entry.updated_at || entry.updatedAt || null,
  }
}

function normalizeRosterEntry(entry) {
  if (!entry) return null
  const slotIndex = Number.isFinite(Number(entry.slot_index))
    ? Number(entry.slot_index)
    : Number.isFinite(Number(entry.slotIndex))
    ? Number(entry.slotIndex)
    : null
  return {
    slotIndex,
    role: entry.role || '',
    ownerId: entry.owner_id || entry.ownerId || null,
    heroId: entry.hero_id || entry.heroId || null,
    heroName: entry.hero_name || entry.heroName || null,
    ready: entry.ready === true,
    standin: entry.standin === true,
    matchSource: entry.match_source || entry.matchSource || null,
    score: Number.isFinite(entry.score) ? Number(entry.score) : null,
    rating: Number.isFinite(entry.rating) ? Number(entry.rating) : null,
  }
}
function normalizeQueueTicket(row) {
  if (!row) return null
  const seatMap = Array.isArray(row.seat_map)
    ? row.seat_map.map(normalizeSeatEntry).filter(Boolean)
    : Array.isArray(row.seatMap)
    ? row.seatMap.map(normalizeSeatEntry).filter(Boolean)
    : []
  return {
    id: row.id || null,
    queueId: row.queue_id || row.queueId || null,
    status: (row.status || '').toLowerCase() || 'queued',
    mode: row.mode || null,
    ownerId: row.owner_id || null,
    gameId: row.game_id || null,
    roomId: row.room_id || null,
    readyExpiresAt: row.ready_expires_at || row.readyExpiresAt || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    readyVote: isObject(row.ready_vote) ? row.ready_vote : null,
    asyncFillMeta: isObject(row.async_fill_meta) ? row.async_fill_meta : null,
    payload: isObject(row.payload) ? row.payload : {},
    seatMap,
  }
}

function normalizeSession(row) {
  if (!row) return null
  const roster = Array.isArray(row.roster)
    ? row.roster.map(normalizeRosterEntry).filter(Boolean)
    : []
  const extras = isObject(row.extras) ? row.extras : null
  const rawMatchInstanceId =
    row.match_instance_id ||
    row.matchInstanceId ||
    (extras && (extras.matchInstanceId || extras.match_instance_id)) ||
    null
  return {
    id: row.id || null,
    gameId: row.game_id || null,
    roomId: row.room_id || null,
    ownerId: row.owner_id || null,
    status: (row.status || '').toLowerCase() || 'pending',
    mode: row.mode || null,
    turn: Number.isFinite(row.turn) ? Number(row.turn) : null,
    ratingHint: row.rating_hint || row.ratingHint || null,
    voteSnapshot: row.vote_snapshot || row.voteSnapshot || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    realtimeMode: row.realtime_mode || row.realtimeMode || null,
    turnState: row.turn_state || row.turnState || null,
    asyncFillSnapshot: row.async_fill_snapshot || row.asyncFillSnapshot || null,
    extras,
    turnLimit: Number.isFinite(row.turn_limit) ? Number(row.turn_limit) : null,
    selectedTimeLimitSeconds: Number.isFinite(row.selected_time_limit_seconds)
      ? Number(row.selected_time_limit_seconds)
      : null,
    dropInBonusSeconds: Number.isFinite(row.drop_in_bonus_seconds)
      ? Number(row.drop_in_bonus_seconds)
      : null,
    matchInstanceId: rawMatchInstanceId,
    roster,
  }
}

function normalizeLobbySnapshot(raw = {}) {
  const queue = Array.isArray(raw.queue)
    ? raw.queue.map(normalizeQueueTicket).filter(Boolean)
    : []
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(normalizeSession).filter(Boolean)
    : []
  return { queue, sessions }
}

function extractActiveHeroIds(turnState) {
  const ids = new Set()
  if (!turnState || typeof turnState !== 'object') {
    return ids
  }

  const addCandidate = (value) => {
    if (!value) return
    if (typeof value === 'string' || typeof value === 'number') {
      ids.add(String(value))
      return
    }
    if (typeof value === 'object') {
      const candidate =
        value.heroId ?? value.hero_id ?? value.id ?? value.hero ?? value
      if (candidate) {
        ids.add(String(candidate))
      }
    }
  }

  const directCandidates = [
    turnState.heroId,
    turnState.hero_id,
    turnState.activeHeroId,
    turnState.activeHero?.heroId,
    turnState.activeHero?.hero_id,
    turnState.activeHero?.id,
    turnState.currentHeroId,
    turnState.currentHero?.heroId,
    turnState.currentHero?.id,
    turnState.current?.heroId,
    turnState.current?.hero_id,
    turnState.current?.id,
    turnState.turn?.heroId,
    turnState.turn?.hero_id,
    turnState.turn?.id,
  ]

  directCandidates.forEach(addCandidate)

  const arrayCandidates = [
    turnState.activeHeroes,
    turnState.activeSlots,
    turnState.turnHeroes,
    turnState.turn?.heroes,
    turnState.participants,
  ]

  for (const list of arrayCandidates) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      addCandidate(entry)
    }
  }

  return ids
}

function deriveMatchChatContext(session, viewerHeroId) {
  const normalizedHeroId = viewerHeroId ? String(viewerHeroId) : null
  const context = {
    matchInstanceId: session?.matchInstanceId || null,
    viewerRole: null,
    allowMainInput: true,
  }

  if (!session) {
    return context
  }

  const roster = Array.isArray(session.roster) ? session.roster : []
  if (normalizedHeroId) {
    const rosterEntry = roster.find((slot) => {
      if (!slot) return false
      const slotHeroId = slot.heroId || slot.hero_id || null
      return slotHeroId && String(slotHeroId) === normalizedHeroId
    })
    if (rosterEntry?.role) {
      context.viewerRole = rosterEntry.role
    }
  }

  if (!context.matchInstanceId) {
    const rosterMatch = roster.find((slot) => slot?.matchInstanceId || slot?.match_instance_id)
    if (rosterMatch) {
      context.matchInstanceId = rosterMatch.matchInstanceId || rosterMatch.match_instance_id || null
    }
  }

  const activeIds = extractActiveHeroIds(session.turnState)
  if (activeIds.size > 0) {
    context.allowMainInput = normalizedHeroId ? activeIds.has(normalizedHeroId) : false
  }

  return context
}

function normalizeGameSlot(row) {
  if (!row) return null
  const slotIndex = Number.isFinite(Number(row.slot_index))
    ? Number(row.slot_index)
    : Number.isFinite(Number(row.slotIndex))
    ? Number(row.slotIndex)
    : null
  return {
    slotIndex,
    role: row.role || '',
    active: row.active !== false,
  }
}

function normalizeRoleCatalogEntry(row) {
  if (!row) return null
  return {
    name: row.name || '',
    slotCount: Number.isFinite(row.slot_count) ? Number(row.slot_count) : null,
    active: row.active !== false,
    scoreDeltaMin: Number.isFinite(row.score_delta_min) ? Number(row.score_delta_min) : null,
    scoreDeltaMax: Number.isFinite(row.score_delta_max) ? Number(row.score_delta_max) : null,
  }
}

function normalizeGameRow(row) {
  if (!row) return null
  const slots = Array.isArray(row.slots) ? row.slots.map(normalizeGameSlot).filter(Boolean) : []
  const roleCatalog = Array.isArray(row.role_catalog)
    ? row.role_catalog.map(normalizeRoleCatalogEntry).filter(Boolean)
    : []
  return {
    id: row.id || null,
    name: row.name || '이름 없는 게임',
    description: row.description || '',
    imageUrl: row.image_url || row.imageUrl || null,
    realtimeMode: row.realtime_mode || row.realtimeMode || REALTIME_MODES.OFF,
    dropInEnabled: row.drop_in_enabled === true || row.dropInEnabled === true,
    slots,
    slotCount: Number.isFinite(row.slot_count) ? Number(row.slot_count) : slots.length,
    heroRole: row.hero_role || row.heroRole || null,
    heroSlotNo: Number.isFinite(row.hero_slot_no) ? Number(row.hero_slot_no) : null,
    heroRating: Number.isFinite(row.hero_rating) ? Number(row.hero_rating) : null,
    heroScore: Number.isFinite(row.hero_score) ? Number(row.hero_score) : null,
    heroScoreRange:
      row.hero_score_min !== null || row.hero_score_max !== null
        ? {
            min: Number.isFinite(row.hero_score_min) ? Number(row.hero_score_min) : null,
            max: Number.isFinite(row.hero_score_max) ? Number(row.hero_score_max) : null,
          }
        : null,
    heroRoleDeltaMin: Number.isFinite(row.hero_role_delta_min) ? Number(row.hero_role_delta_min) : null,
    heroRoleDeltaMax: Number.isFinite(row.hero_role_delta_max) ? Number(row.hero_role_delta_max) : null,
    promptSet: isObject(row.prompt_set)
      ? {
          id: row.prompt_set.id || null,
          name: row.prompt_set.name || '',
          description: row.prompt_set.description || '',
        }
      : null,
    roleCatalog,
  }
}

function normalizeGameCatalog(raw = {}) {
  const rows = Array.isArray(raw.games) ? raw.games : []
  return rows.map(normalizeGameRow).filter(Boolean)
}

function computeHeroStats(participations = []) {
  if (!Array.isArray(participations) || participations.length === 0) {
    return {
      totalSessions: 0,
      favouriteMode: null,
      lastPlayedAt: null,
      games: [],
    }
  }
  let totalSessions = 0
  let lastPlayedAt = null
  const modeFrequency = new Map()
  const games = []
  participations.forEach((entry) => {
    const sessions = Number(entry?.sessionCount) || 0
    totalSessions += sessions
    const mode = entry?.primaryMode || null
    if (mode) {
      const key = mode.toLowerCase()
      modeFrequency.set(key, (modeFrequency.get(key) || 0) + sessions || 1)
    }
    const latest = entry?.latestSessionAt ? Date.parse(entry.latestSessionAt) : null
    if (Number.isFinite(latest)) {
      if (!Number.isFinite(lastPlayedAt) || latest > lastPlayedAt) {
        lastPlayedAt = latest
      }
    }
    if (entry?.game?.id) {
      games.push({
        id: entry.game.id,
        name: entry.game.name || '이름 없는 게임',
        sessions,
        mode: entry.primaryMode || null,
        role: entry.role || null,
        rating: Number.isFinite(entry?.rating) ? entry.rating : null,
        score: Number.isFinite(entry?.score) ? entry.score : null,
      })
    }
  })
  games.sort((a, b) => (b.sessions || 0) - (a.sessions || 0))
  let favouriteMode = null
  if (modeFrequency.size) {
    favouriteMode = Array.from(modeFrequency.entries()).sort((a, b) => b[1] - a[1])[0][0]
  }
  return {
    totalSessions,
    favouriteMode,
    lastPlayedAt,
    games,
  }
}

function buildQueuePayload(hero, selectedGame, heroStats) {
  const heroRole = selectedGame?.heroRole || 'flex'
  const payload = {
    hero_id: hero?.hero_id || null,
    hero_name: hero?.name || null,
    owner_id: hero?.owner_id || hero?.user_id || null,
    role: heroRole,
    mode: 'rank',
    queue_mode: 'rank',
    ready_vote: {
      ready: true,
      hero_id: hero?.hero_id || null,
      owner_id: hero?.owner_id || hero?.user_id || null,
    },
    async_fill_meta: {
      preferred_role: heroRole,
      requested_at: new Date().toISOString(),
    },
  }

  if (selectedGame?.id) {
    payload.game_id = selectedGame.id
  }

  const properties = {}
  if (Number.isFinite(heroStats?.totalSessions)) {
    properties.sessions_played = heroStats.totalSessions
  }
  if (heroStats?.favouriteMode) {
    properties.favourite_mode = heroStats.favouriteMode
  }
  if (Number.isFinite(heroStats?.lastPlayedAt)) {
    properties.last_played_at = heroStats.lastPlayedAt
  }
  if (selectedGame?.id) {
    properties.selected_game_id = selectedGame.id
    properties.selected_game_name = selectedGame.name || '미정'
    properties.selected_game_realtime_mode = normalizeRealtimeMode(selectedGame.realtimeMode)
    properties.selected_game_drop_in = !!selectedGame.dropInEnabled
    if (selectedGame.promptSet?.id) {
      properties.selected_prompt_set_id = selectedGame.promptSet.id
    }
    if (Number.isFinite(selectedGame.slotCount)) {
      properties.selected_game_slots = selectedGame.slotCount
    }
  }
  if (selectedGame?.heroRole) {
    properties.hero_role = selectedGame.heroRole
  }
  if (Number.isFinite(selectedGame?.heroSlotNo)) {
    properties.hero_slot_no = selectedGame.heroSlotNo
  }
  if (Number.isFinite(selectedGame?.heroRating)) {
    properties.hero_rating = selectedGame.heroRating
  }
  if (Number.isFinite(selectedGame?.heroScore)) {
    properties.hero_score = selectedGame.heroScore
  }
  if (selectedGame?.heroScoreRange) {
    if (Number.isFinite(selectedGame.heroScoreRange.min)) {
      properties.hero_score_min = selectedGame.heroScoreRange.min
    }
    if (Number.isFinite(selectedGame.heroScoreRange.max)) {
      properties.hero_score_max = selectedGame.heroScoreRange.max
    }
  }
  if (Number.isFinite(selectedGame?.heroRoleDeltaMin)) {
    properties.hero_role_delta_min = selectedGame.heroRoleDeltaMin
  }
  if (Number.isFinite(selectedGame?.heroRoleDeltaMax)) {
    properties.hero_role_delta_max = selectedGame.heroRoleDeltaMax
  }

  if (Object.keys(properties).length) {
    payload.properties = properties
  }

  if (selectedGame) {
    payload.game_preferences = {
      realtime_mode: normalizeRealtimeMode(selectedGame.realtimeMode),
      drop_in_enabled: !!selectedGame.dropInEnabled,
      prompt_set_id: selectedGame.promptSet?.id || null,
      prompt_slot_count: Array.isArray(selectedGame.promptSlots)
        ? selectedGame.promptSlots.length
        : 0,
      slot_roles: Array.isArray(selectedGame.slots)
        ? selectedGame.slots.map((slot) => ({
            slot_index: Number.isFinite(slot?.slotIndex) ? slot.slotIndex : null,
            role: slot?.role || '',
            active: slot?.active !== false,
          }))
        : [],
    }
  }

  return payload
}

function shortId(value) {
  if (!value) return '—'
  const str = String(value)
  if (str.length <= 8) return str
  return `${str.slice(0, 4)}…${str.slice(-4)}`
}

function readStoredGameId() {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(GAME_SELECTION_STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed?.gameId === 'string' ? parsed.gameId : ''
  } catch (error) {
    console.warn('[Match] Failed to read stored game id', error)
    return ''
  }
}

function persistSelectedGameId(gameId) {
  if (typeof window === 'undefined') return
  try {
    if (!gameId) {
      window.localStorage.removeItem(GAME_SELECTION_STORAGE_KEY)
    } else {
      window.localStorage.setItem(GAME_SELECTION_STORAGE_KEY, JSON.stringify({ gameId }))
    }
  } catch (error) {
    console.warn('[Match] Failed to persist game id', error)
  }
}

function readPenaltyUntil() {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(PENALTY_STORAGE_KEY)
    if (!raw) return 0
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? numeric : 0
  } catch (error) {
    console.warn('[Match] Failed to read penalty timestamp', error)
    return 0
  }
}

function persistPenaltyUntil(timestamp) {
  if (typeof window === 'undefined') return
  try {
    if (!timestamp) {
      window.localStorage.removeItem(PENALTY_STORAGE_KEY)
    } else {
      window.localStorage.setItem(PENALTY_STORAGE_KEY, String(timestamp))
    }
  } catch (error) {
    console.warn('[Match] Failed to persist penalty timestamp', error)
  }
}

function formatProviderLabel(provider) {
  if (!provider) return KEY_PROVIDER_LABELS.unknown
  const key = String(provider).toLowerCase()
  return KEY_PROVIDER_LABELS[key] || KEY_PROVIDER_LABELS.unknown
}

function formatGameMeta(game) {
  const realtime = normalizeRealtimeMode(game?.realtimeMode)
  const realtimeLabel = realtime === REALTIME_MODES.OFF ? '턴 기반' : '실시간'
  const dropInLabel = game?.dropInEnabled ? '난입 허용' : '난입 제한'
  return `${realtimeLabel} · ${dropInLabel}`
}

function formatRoleHint(game) {
  if (!game?.heroRole) return '할당된 역할 정보 없음'
  const scoreRange = game?.heroScoreRange
  if (scoreRange && (Number.isFinite(scoreRange.min) || Number.isFinite(scoreRange.max))) {
    if (Number.isFinite(scoreRange.min) && Number.isFinite(scoreRange.max)) {
      return `${game.heroRole} · 점수 ${scoreRange.min}~${scoreRange.max}`
    }
    if (Number.isFinite(scoreRange.min)) {
      return `${game.heroRole} · 점수 ${scoreRange.min}+`
    }
    if (Number.isFinite(scoreRange.max)) {
      return `${game.heroRole} · 점수 ≤${scoreRange.max}`
    }
  }
  return `${game.heroRole} 역할`
}
export default function MatchPage() {
  const router = useRouter()
  const mountedRef = useRef(false)
  const refreshTimerRef = useRef(null)
  const matchReadyTimerRef = useRef(null)
  const messageSwapRef = useRef(null)

  const initialSelectionRef = useRef(readStoredGameId())
  const penaltySeedRef = useRef(readPenaltyUntil())

  const initialAuth = readRankAuthSnapshot()
  const [viewerUserId, setViewerUserId] = useState(initialAuth?.userId || '')
  const [viewerHero, setViewerHero] = useState(null)
  const [heroStats, setHeroStats] = useState({ totalSessions: 0, favouriteMode: null, lastPlayedAt: null, games: [] })
  const [games, setGames] = useState([])
  const [selectedGameId, setSelectedGameId] = useState(initialSelectionRef.current)

  const [keyringEntries, setKeyringEntries] = useState(() => {
    const snapshot = readRankKeyringSnapshot()
    return Array.isArray(snapshot?.entries)
      ? snapshot.entries.map(sanitizeKeyringStorageEntry)
      : []
  })
  const [keyringLimit, setKeyringLimit] = useState(KEYRING_LIMIT_FALLBACK)
  const [keyringLoading, setKeyringLoading] = useState(false)
  const [keyringSubmitting, setKeyringSubmitting] = useState(false)
  const [keyringError, setKeyringError] = useState(null)
  const [keyringMessage, setKeyringMessage] = useState('')
  const [newApiKey, setNewApiKey] = useState('')

  const [snapshot, setSnapshot] = useState({ queue: [], sessions: [] })
  const [snapshotError, setSnapshotError] = useState(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(false)

  const [ticket, setTicket] = useState(() => {
    const stored = readTicket()
    return stored ? normalizeQueueTicket(stored) : null
  })
  const [session, setSession] = useState(null)
  const [queueError, setQueueError] = useState(null)
  const [joinBusy, setJoinBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(false)

  const [matchReadyState, setMatchReadyState] = useState({
    active: false,
    deadline: 0,
    messageIndex: 0,
  })
  const [timeSelectionBusy, setTimeSelectionBusy] = useState(false)
  const [timeSelectionError, setTimeSelectionError] = useState(null)
  const [penaltyUntil, setPenaltyUntil] = useState(penaltySeedRef.current)

  const hasActiveKey = useMemo(() => keyringEntries.some((entry) => entry?.isActive), [keyringEntries])
  const selectedGame = useMemo(() => games.find((game) => game.id === selectedGameId) || null, [games, selectedGameId])

  useEffect(() => {
    mountedRef.current = true
    const handleAuthRefresh = () => {
      const snapshot = readRankAuthSnapshot()
      setViewerUserId(snapshot?.userId || '')
    }
    window.addEventListener(RANK_AUTH_STORAGE_EVENT, handleAuthRefresh)
    return () => {
      mountedRef.current = false
      window.removeEventListener(RANK_AUTH_STORAGE_EVENT, handleAuthRefresh)
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      if (matchReadyTimerRef.current) {
        clearTimeout(matchReadyTimerRef.current)
      }
      if (messageSwapRef.current) {
        clearInterval(messageSwapRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadViewer = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const sessionInfo = sessionData?.session || null
        if (sessionInfo) {
          persistRankAuthSession(sessionInfo)
          if (sessionInfo.user?.id) {
            persistRankAuthUser(sessionInfo.user)
          }
        }
        let user = sessionInfo?.user || null
        if (!user) {
          const { data: userData, error: userError } = await supabase.auth.getUser()
          if (userError) throw userError
          user = userData?.user || null
          if (user?.id) {
            persistRankAuthUser(user)
          }
        }
        const nextSnapshot = readRankAuthSnapshot()
        if (cancelled || !mountedRef.current) return
        const resolvedUserId = user?.id || nextSnapshot?.userId || null
        setViewerUserId(resolvedUserId)
        if (!user) {
          setViewerHero(null)
          setHeroStats({ totalSessions: 0, favouriteMode: null, lastPlayedAt: null, games: [] })
          return
        }
        const profile = await resolveViewerProfile(user, null)
        if (cancelled || !mountedRef.current) return
        setViewerHero(profile)
        if (profile?.hero_id) {
          try {
            const bundle = await fetchHeroParticipationBundle(profile.hero_id, {
              heroSeed: {
                id: profile.hero_id,
                name: profile.name,
                owner_id: profile.owner_id || profile.user_id || user.id,
              },
            })
            if (!cancelled && mountedRef.current) {
              const participations = Array.isArray(bundle?.participations) ? bundle.participations : []
              setHeroStats(computeHeroStats(participations))
            }
          } catch (error) {
            console.warn('[Match] failed to fetch hero participation', error)
            if (!cancelled && mountedRef.current) {
              setHeroStats({ totalSessions: 0, favouriteMode: null, lastPlayedAt: null, games: [] })
            }
          }
        }
      } catch (error) {
        console.error('[Match] failed to resolve viewer', error)
        if (!cancelled && mountedRef.current) {
          setViewerHero(null)
          setHeroStats({ totalSessions: 0, favouriteMode: null, lastPlayedAt: null, games: [] })
        }
      }
    }

    loadViewer()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!viewerHero?.hero_id) {
      setGames([])
      return
    }
    let cancelled = false
    const loadGames = async () => {
      try {
        const raw = await ensureRpc('fetch_rank_lobby_games', {
          p_hero_id: viewerHero.hero_id,
          p_limit: 24,
        })
        if (cancelled || !mountedRef.current) return
        const normalized = normalizeGameCatalog(raw)
        setGames(normalized)
        if (!normalized.some((game) => game.id === selectedGameId)) {
          const fallback = normalized[0]?.id || ''
          setSelectedGameId(fallback)
          persistSelectedGameId(fallback)
        }
      } catch (error) {
        console.error('[Match] failed to load game catalog', error)
        if (!cancelled && mountedRef.current) {
          setGames([])
        }
      }
    }

    loadGames()
    return () => {
      cancelled = true
    }
  }, [viewerHero?.hero_id])

  useEffect(() => {
    setKeyringLoading(true)
    setKeyringError(null)
    let cancelled = false
    const snapshot = readRankAuthSnapshot()
    const userId = snapshot?.userId || viewerUserId || null
    const loadKeyring = async () => {
      try {
        const payload = await requestUserApiKeyring('GET', null, {
          userId,
          accessToken: snapshot?.accessToken,
        })
        if (cancelled || !mountedRef.current) return
        const entries = Array.isArray(payload?.entries)
          ? payload.entries.map(normalizeKeyringEntry).filter(Boolean)
          : []
        setKeyringEntries(entries)
        setKeyringLimit(Number.isFinite(payload?.limit) ? Number(payload.limit) : KEYRING_LIMIT_FALLBACK)
        persistRankKeyringSnapshot({
          userId: userId || '',
          entries: entries.map(sanitizeKeyringStorageEntry),
        })
        setKeyringMessage(entries.length ? '' : '먼저 사용할 AI API 키를 등록해 주세요.')
      } catch (error) {
        console.error('[Match] failed to load keyring', error)
        if (!cancelled && mountedRef.current) {
          setKeyringError(error)
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setKeyringLoading(false)
        }
      }
    }
    if (userId) {
      loadKeyring()
    } else {
      setKeyringLoading(false)
      setKeyringEntries([])
    }
    return () => {
      cancelled = true
    }
  }, [viewerUserId])

  const fetchSnapshot = useCallback(
    async (reason = 'manual') => {
      if (!QUEUE_ID) return
      if (reason === 'initial') {
        setLoadingSnapshot(true)
      }
      setSnapshotError(null)
      try {
        const raw = await ensureRpc('fetch_rank_lobby_snapshot', {
          p_queue_id: QUEUE_ID,
          p_limit: 24,
        })
        if (!mountedRef.current) return
        const normalized = normalizeLobbySnapshot(raw)
        setSnapshot(normalized)
        if (ticket?.id) {
          const updatedTicket = normalized.queue.find((entry) => entry.id === ticket.id)
          if (updatedTicket) {
            setTicket(updatedTicket)
            persistTicket(updatedTicket)
          }
        }
        if (session?.id) {
          const updatedSession = normalized.sessions.find((entry) => entry.id === session.id)
          if (updatedSession) {
            setSession(updatedSession)
          }
        }
      } catch (error) {
        console.error('[Match] snapshot fetch failed', error)
        if (mountedRef.current) {
          setSnapshotError(error)
        }
      } finally {
        if (mountedRef.current) {
          setLoadingSnapshot(false)
          setRefreshRequested(false)
        }
      }
    },
    [ticket?.id, session?.id],
  )

  useEffect(() => {
    fetchSnapshot('initial')
  }, [fetchSnapshot])

  useEffect(() => {
    if (!refreshRequested) return
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = setTimeout(() => {
      fetchSnapshot('realtime')
    }, 220)
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [refreshRequested, fetchSnapshot])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchSnapshot('interval')
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchSnapshot])

  useEffect(() => {
    const unsubscribeQueue = subscribeToQueue(QUEUE_ID, () => {
      setRefreshRequested(true)
    })
    return () => {
      unsubscribeQueue?.()
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!penaltyUntil) return
      if (Date.now() >= penaltyUntil) {
        setPenaltyUntil(0)
        persistPenaltyUntil(0)
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [penaltyUntil])

  const applyMatchReadyState = useCallback((deadlineMs) => {
    setMatchReadyState({ active: true, deadline: deadlineMs, messageIndex: 0 })
    if (matchReadyTimerRef.current) {
      clearTimeout(matchReadyTimerRef.current)
    }
    matchReadyTimerRef.current = setTimeout(() => {
      setMatchReadyState({ active: false, deadline: 0, messageIndex: 0 })
      matchReadyTimerRef.current = null
    }, Math.max(0, deadlineMs - Date.now()))
    if (messageSwapRef.current) {
      clearInterval(messageSwapRef.current)
    }
    messageSwapRef.current = setInterval(() => {
      setMatchReadyState((prev) => ({
        active: prev.active,
        deadline: prev.deadline,
        messageIndex: prev.messageIndex === 0 ? 1 : 0,
      }))
    }, MATCH_READY_MESSAGE_SWAP_MS)
  }, [])

  const clearMatchReadyState = useCallback(() => {
    setMatchReadyState({ active: false, deadline: 0, messageIndex: 0 })
    if (matchReadyTimerRef.current) {
      clearTimeout(matchReadyTimerRef.current)
      matchReadyTimerRef.current = null
    }
    if (messageSwapRef.current) {
      clearInterval(messageSwapRef.current)
      messageSwapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ticket?.status) return
    if (ticket.status === 'staging') {
      const deadline = ticket.readyExpiresAt ? Date.parse(ticket.readyExpiresAt) : Date.now() + MATCH_READY_DURATION_MS
      applyMatchReadyState(deadline)
    } else {
      clearMatchReadyState()
    }
  }, [ticket?.status, ticket?.readyExpiresAt, applyMatchReadyState, clearMatchReadyState])

  const handleStartMatch = useCallback(async () => {
    if (!selectedGame?.id) {
      setQueueError(new Error('먼저 참여할 게임을 선택해 주세요.'))
      return
    }
    if (!selectedGame?.heroRole) {
      setQueueError(new Error('이 게임에서 사용할 수 있는 역할이 확인되지 않았습니다.'))
      return
    }
    if (!hasActiveKey) {
      setQueueError(new Error('AI API 키를 최소 하나 이상 사용 상태로 전환해 주세요.'))
      return
    }
    if (penaltyUntil && Date.now() < penaltyUntil) {
      setQueueError(new Error('최근 취소로 잠시 매칭을 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.'))
      return
    }
    setQueueError(null)
    setJoinBusy(true)
    try {
      const payload = buildQueuePayload(viewerHero, selectedGame, heroStats)
      const data = await ensureRpc('join_rank_queue', {
        queue_id: QUEUE_ID,
        payload,
      })
      const normalized = normalizeQueueTicket(data)
      if (normalized) {
        setTicket(normalized)
        persistTicket(normalized)
        setAutoRetryEnabled(true)
      }
      fetchSnapshot('manual')
    } catch (error) {
      console.error('[Match] join queue failed', error)
      setQueueError(error)
    } finally {
      setJoinBusy(false)
    }
  }, [selectedGame, hasActiveKey, penaltyUntil, viewerHero, heroStats, fetchSnapshot])

  const handleCancelMatch = useCallback(async () => {
    if (!ticket?.id) {
      setTicket(null)
      persistTicket(null)
      setAutoRetryEnabled(false)
      return
    }
    setCancelBusy(true)
    setQueueError(null)
    try {
      await ensureRpc('cancel_rank_queue_ticket', {
        queue_ticket_id: ticket.id,
      })
      setTicket(null)
      persistTicket(null)
      setAutoRetryEnabled(false)
      fetchSnapshot('manual')
    } catch (error) {
      console.error('[Match] cancel queue failed', error)
      setQueueError(error)
    } finally {
      setCancelBusy(false)
    }
  }, [ticket, fetchSnapshot])

  const handlePenalty = useCallback(() => {
    const until = Date.now() + PENALTY_DURATION_MS
    setPenaltyUntil(until)
    persistPenaltyUntil(until)
    setAutoRetryEnabled(false)
    setTicket(null)
    persistTicket(null)
    clearMatchReadyState()
    router.push('/character')
  }, [clearMatchReadyState, router])

  useEffect(() => {
    if (!matchReadyState.active) return
    if (!matchReadyState.deadline) return
    const timeout = matchReadyState.deadline - Date.now()
    if (timeout <= 0) {
      handlePenalty()
      return
    }
    const timer = setTimeout(() => {
      handlePenalty()
    }, timeout)
    return () => clearTimeout(timer)
  }, [matchReadyState, handlePenalty])

  const handleTimeLimitSelect = useCallback(
    async (seconds) => {
      if (!ticket?.id || !session?.id) return
      setTimeSelectionBusy(true)
      setTimeSelectionError(null)
      try {
        const response = await fetch('/api/rank/session-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: session.id,
            meta: { selected_time_limit_seconds: seconds },
            options: { skipRealtimeSync: false },
          }),
        })
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(detail?.error || detail?.message || '턴 제한을 저장하지 못했습니다.')
        }
        clearMatchReadyState()
        setTimeSelectionBusy(false)
        setTimeSelectionError(null)
      } catch (error) {
        console.error('[Match] failed to submit time limit', error)
        setTimeSelectionError(error)
        setTimeSelectionBusy(false)
      }
    },
    [ticket?.id, session?.id, clearMatchReadyState],
  )

  useEffect(() => {
    if (!ticket?.id) return
    const snapshotSession = snapshot.sessions.find((entry) => entry.roomId && entry.roomId === ticket.roomId)
    if (snapshotSession) {
      setSession(snapshotSession)
    }
  }, [snapshot.sessions, ticket?.id, ticket?.roomId])

  useEffect(() => {
    if (!autoRetryEnabled) return
    if (ticket) return
    if (penaltyUntil && Date.now() < penaltyUntil) return
    if (!selectedGame?.id) return
    handleStartMatch()
  }, [autoRetryEnabled, ticket, penaltyUntil, selectedGame?.id, handleStartMatch])

  const activeMatchSummary = useMemo(() => {
    if (!ticket) return null
    const seatReady = ticket.seatMap?.length
      ? `${ticket.seatMap.filter((seat) => seat.ready).length}/${ticket.seatMap.length}`
      : null
    return {
      ticketId: ticket.id,
      status: ticket.status,
      ready: seatReady,
      expiresAt: ticket.readyExpiresAt || null,
    }
  }, [ticket])

  const matchMessages = [
    '매칭이 성사되었습니다. 턴 제한시간을 선택해주세요.',
    '제한시간 내에 선택하지 않으면 매칭이 취소됩니다. 반복된 매칭 취소는 불이익을 받을 수 있습니다.',
  ]
  const viewerHeroId = viewerHero?.hero_id || null
  const matchChatContext = useMemo(
    () => deriveMatchChatContext(session, viewerHeroId),
    [session, viewerHeroId],
  )
  const renderKeyringSection = () => (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>API 키 관리</h2>
        <p style={styles.sectionHint}>AI 모델 키를 등록하고 활성화해야 매칭을 시작할 수 있습니다.</p>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={newApiKey}
          onChange={(event) => setNewApiKey(event.target.value)}
          placeholder="API 키를 입력해 주세요"
          style={{
            flex: '1 1 280px',
            minWidth: 220,
            padding: '12px 14px',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#e2e8f0',
            fontSize: 14,
          }}
        />
        <button
          type="button"
          style={styles.primaryButton(keyringSubmitting || !newApiKey.trim())}
          onClick={async () => {
            if (!newApiKey.trim()) return
            setKeyringSubmitting(true)
            setKeyringError(null)
            try {
              const snapshot = readRankAuthSnapshot()
              const payload = await requestUserApiKeyring(
                'POST',
                { apiKey: newApiKey.trim() },
                { userId: viewerUserId, accessToken: snapshot?.accessToken },
              )
              const entry = normalizeKeyringEntry(payload?.entry)
              const entries = mergeKeyringEntries(keyringEntries, entry, payload?.activated !== false)
              setKeyringEntries(entries)
              persistRankKeyringSnapshot({
                userId: viewerUserId || '',
                entries: entries.map(sanitizeKeyringStorageEntry),
              })
              setKeyringLimit(Number.isFinite(payload?.limit) ? Number(payload.limit) : keyringLimit)
              setNewApiKey('')
              setKeyringMessage('API 키가 저장되었습니다.')
            } catch (error) {
              console.error('[Match] failed to store api key', error)
              setKeyringError(error)
            } finally {
              setKeyringSubmitting(false)
            }
          }}
          disabled={keyringSubmitting || !newApiKey.trim()}
        >
          {keyringSubmitting ? '저장 중…' : 'API 키 저장'}
        </button>
      </div>
      {keyringError ? <p style={styles.errorText}>{keyringError.message || 'API 키 작업 중 오류가 발생했습니다.'}</p> : null}
      {keyringMessage ? <p style={styles.infoText}>{keyringMessage}</p> : null}
      {keyringLoading ? <p style={styles.sectionHint}>키 목록을 불러오는 중…</p> : null}
      <div style={styles.keyringList}>
        {keyringEntries.map((entry) => (
          <div key={entry.id || entry.keySample} style={styles.keyringRow(entry.isActive)}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatProviderLabel(entry.provider)}</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{entry.keySample || '샘플 없음'}</div>
            </div>
            <div style={styles.keyringActions}>
              <button
                type="button"
                style={styles.smallButton(keyringSubmitting)}
                onClick={async () => {
                  if (!entry?.id || keyringSubmitting) return
                  setKeyringSubmitting(true)
                  setKeyringError(null)
                  try {
                    const snapshot = readRankAuthSnapshot()
                    const payload = await requestUserApiKeyring(
                      entry.isActive ? 'PATCH' : 'PUT',
                      entry.isActive
                        ? { id: entry.id, isActive: false }
                        : { id: entry.id, isActive: true },
                      { userId: viewerUserId, accessToken: snapshot?.accessToken },
                    )
                    const normalized = normalizeKeyringEntry(payload?.entry)
                    const entries = mergeKeyringEntries(keyringEntries, normalized, payload?.activated !== false)
                    setKeyringEntries(entries)
                    persistRankKeyringSnapshot({
                      userId: viewerUserId || '',
                      entries: entries.map(sanitizeKeyringStorageEntry),
                    })
                  } catch (error) {
                    console.error('[Match] failed to toggle api key', error)
                    setKeyringError(error)
                  } finally {
                    setKeyringSubmitting(false)
                  }
                }}
              >
                {entry.isActive ? '비활성화' : '사용하기'}
              </button>
              <button
                type="button"
                style={styles.smallButton(keyringSubmitting)}
                onClick={async () => {
                  if (!entry?.id || keyringSubmitting) return
                  setKeyringSubmitting(true)
                  setKeyringError(null)
                  try {
                    const snapshot = readRankAuthSnapshot()
                    await requestUserApiKeyring('DELETE', { id: entry.id }, {
                      userId: viewerUserId,
                      accessToken: snapshot?.accessToken,
                    })
                    const entries = keyringEntries.filter((item) => item.id !== entry.id)
                    setKeyringEntries(entries)
                    persistRankKeyringSnapshot({
                      userId: viewerUserId || '',
                      entries: entries.map(sanitizeKeyringStorageEntry),
                    })
                  } catch (error) {
                    console.error('[Match] failed to delete api key', error)
                    setKeyringError(error)
                  } finally {
                    setKeyringSubmitting(false)
                  }
                }}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
        {keyringEntries.length === 0 && !keyringLoading ? (
          <p style={styles.sectionHint}>등록된 API 키가 없습니다. 위 입력창에 키를 붙여넣고 저장해 주세요.</p>
        ) : null}
      </div>
    </section>
  )

  const renderGameSection = () => (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>게임 선택</h2>
        <p style={styles.sectionHint}>접속 중인 캐릭터가 참여 중인 게임만 선택할 수 있습니다.</p>
      </div>
      {viewerHero ? (
        <div style={styles.heroBadge}>
          {viewerHero.name || '이름 없는 영웅'} · {viewerHero.hero_id ? shortId(viewerHero.hero_id) : 'Hero'}
        </div>
      ) : (
        <p style={styles.sectionHint}>영웅 정보를 불러오는 중입니다…</p>
      )}
      <div style={styles.gameGrid}>
        {games.map((game) => (
          <button
            type="button"
            key={game.id}
            style={{ ...styles.gameCard(selectedGameId === game.id), textAlign: 'left' }}
            onClick={() => {
              setSelectedGameId(game.id)
              persistSelectedGameId(game.id)
            }}
          >
            <h3 style={styles.gameName}>{game.name}</h3>
            <p style={styles.gameDescription}>{game.description || '설명이 제공되지 않은 게임입니다.'}</p>
            <div style={styles.gameMeta}>
              <span>{formatGameMeta(game)}</span>
              <span>{formatRoleHint(game)}</span>
            </div>
          </button>
        ))}
        {games.length === 0 ? <p style={styles.sectionHint}>참여 가능한 게임이 없습니다.</p> : null}
      </div>
    </section>
  )

  const renderMatchSection = () => (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>매칭 제어</h2>
        <p style={styles.sectionHint}>API 키와 게임을 선택하면 매칭을 시작할 수 있습니다.</p>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={styles.primaryButton(joinBusy || !selectedGame || !hasActiveKey || (penaltyUntil && Date.now() < penaltyUntil))}
          onClick={handleStartMatch}
          disabled={joinBusy || !selectedGame || !hasActiveKey || (penaltyUntil && Date.now() < penaltyUntil)}
        >
          {joinBusy ? '매칭 시작 중…' : '매칭 시작'}
        </button>
        <button
          type="button"
          style={styles.smallButton(cancelBusy)}
          onClick={handleCancelMatch}
        >
          {cancelBusy ? '취소 중…' : '매칭 취소'}
        </button>
      </div>
      {penaltyUntil && Date.now() < penaltyUntil ? (
        <p style={styles.errorText}>
          최근 취소로 인해 {Math.ceil((penaltyUntil - Date.now()) / 1000)}초 후 다시 참여할 수 있습니다.
        </p>
      ) : null}
      {queueError ? <p style={styles.errorText}>{queueError.message || '매칭 작업 중 오류가 발생했습니다.'}</p> : null}
      <div style={styles.statusCard}>
        <h3 style={styles.statusHeader}>현재 상태</h3>
        {activeMatchSummary ? (
          <>
            <p style={styles.statusHint}>
              티켓 {shortId(activeMatchSummary.ticketId)} · {activeMatchSummary.status.toUpperCase()}{' '}
              {activeMatchSummary.ready ? `· 준비 ${activeMatchSummary.ready}` : null}
            </p>
            {matchReadyState.active ? (
              <div>
                <p style={styles.infoText}>{matchMessages[matchReadyState.messageIndex]}</p>
                <div style={styles.timeLimitOptions}>
                  {TIME_LIMIT_OPTIONS.map((seconds) => (
                    <button
                      type="button"
                      key={seconds}
                      style={styles.timeLimitButton(seconds === session?.selectedTimeLimitSeconds)}
                      onClick={() => handleTimeLimitSelect(seconds)}
                      disabled={timeSelectionBusy}
                    >
                      {seconds}초
                    </button>
                  ))}
                </div>
                <p style={styles.sectionHint}>
                  남은 시간 {Math.max(0, Math.ceil((matchReadyState.deadline - Date.now()) / 1000))}초
                </p>
                {timeSelectionError ? (
                  <p style={styles.errorText}>{timeSelectionError.message || '턴 제한 적용에 실패했습니다.'}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p style={styles.sectionHint}>대기 중인 매칭이 없습니다.</p>
        )}
        {loadingSnapshot ? <p style={styles.sectionHint}>상태를 불러오는 중…</p> : null}
        {snapshotError ? (
          <p style={styles.errorText}>{snapshotError.message || '로비 스냅샷을 불러오지 못했습니다.'}</p>
        ) : null}
      </div>
    </section>
  )

  return (
    <SharedChatDockProvider>
      <Head>
        <title>매칭 센터 · Starbase</title>
      </Head>
      <main style={styles.page}>
        <div style={styles.container}>
          <header style={styles.header}>
            <h1 style={styles.title}>매칭 센터</h1>
            <p style={styles.subtitle}>
              API 키를 활성화하고 게임을 선택한 뒤 매칭 버튼만 누르면 자동으로 큐·방·메인 게임까지 연결됩니다.
            </p>
          </header>
          <div style={styles.layout}>
            {renderKeyringSection()}
            {renderGameSection()}
            {renderMatchSection()}
            {session?.id ? (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>메인 게임</h2>
                <div style={{ borderRadius: 26, border: '1px solid rgba(148, 163, 184, 0.32)', overflow: 'hidden' }}>
                  <MatchReadyClient sessionId={session.id} ticketId={ticket?.id || null} />
                </div>
              </section>
            ) : null}
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>공유 채팅</h2>
              <div style={styles.chatDock}>
                <SharedChatDock
                  sessionId={session?.id || null}
                  matchInstanceId={matchChatContext.matchInstanceId || session?.matchInstanceId || null}
                  gameId={session?.gameId || null}
                  roomId={session?.roomId || null}
                  roster={session?.roster || []}
                  viewerRole={matchChatContext.viewerRole}
                  allowMainInput={matchChatContext.allowMainInput}
                  heroId={viewerHeroId}
                  viewerHero={viewerHero}
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    </SharedChatDockProvider>
  )
}
