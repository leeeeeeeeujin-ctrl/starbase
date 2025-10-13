import Head from 'next/head'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { resolveViewerProfile } from '@/lib/heroes/resolveViewerProfile'
import { fetchHeroParticipationBundle } from '@/modules/character/participation'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { subscribeToQueue } from '@/modules/arena/realtimeChannels'
import { persistTicket, readTicket } from '@/modules/arena/ticketStorage'
import { persistRankAuthSession, persistRankAuthUser } from '@/lib/rank/rankAuthStorage'
import { isRealtimeEnabled, normalizeRealtimeMode, REALTIME_MODES } from '@/lib/rank/realtimeModes'
import { persistRankKeyringSnapshot, readRankKeyringSnapshot } from '@/lib/rank/keyringStorage'

const MATCH_MODE_OPTIONS = [
  { key: 'rank', label: '랭크' },
  { key: 'casual', label: '캐주얼' },
  { key: 'event', label: '이벤트' },
]

const GAME_SELECTION_STORAGE_KEY = 'rankLobbyGameSelection'
const GAME_REALTIME_FILTERS = ['all', 'realtime', 'async']
const GAME_DROP_IN_FILTERS = ['all', 'allow', 'deny']

const KEY_PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  unknown: '기타 모델',
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    padding: '40px 16px 120px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 1160,
    margin: '0 auto',
    display: 'grid',
    gap: 28,
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 18,
  },
  headerTitle: {
    display: 'grid',
    gap: 8,
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
    lineHeight: 1.7,
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  refreshButton: (loading) => ({
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: loading ? 'rgba(30, 41, 59, 0.6)' : 'rgba(59, 130, 246, 0.8)',
    color: loading ? '#94a3b8' : '#f8fafc',
    fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  layout: {
    display: 'grid',
    gap: 24,
  },
  columns: {
    display: 'grid',
    gap: 24,
  },
  cardsColumn: {
    display: 'grid',
    gap: 24,
  },
  card: {
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.32)',
    borderRadius: 26,
    padding: '24px 26px',
    display: 'grid',
    gap: 18,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  cardHint: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
  },
  heroBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 18,
    border: '1px solid rgba(56, 189, 248, 0.35)',
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#bae6fd',
    fontWeight: 700,
  },
  heroGrid: {
    display: 'grid',
    gap: 16,
  },
  heroStatsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: '#cbd5f5',
  },
  heroStatBadge: {
    padding: '6px 10px',
    borderRadius: 12,
    background: 'rgba(148, 163, 184, 0.16)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    fontWeight: 600,
  },
  heroGamesList: {
    display: 'grid',
    gap: 10,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  heroGameItem: {
    padding: '10px 14px',
    borderRadius: 16,
    background: 'rgba(15, 23, 42, 0.68)',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    display: 'grid',
    gap: 4,
  },
  heroGameMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  gameControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  searchInput: {
    flex: '1 1 220px',
    minWidth: 180,
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  smallSelect: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
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
    fontSize: 12,
    fontWeight: 600,
  },
  gameList: {
    display: 'grid',
    gap: 14,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  gameItem: (selected) => ({
    borderRadius: 18,
    border: selected
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(148, 163, 184, 0.28)',
    background: selected ? 'rgba(37, 99, 235, 0.18)' : 'rgba(15, 23, 42, 0.62)',
    padding: '16px 18px',
    display: 'grid',
    gap: 12,
  }),
  gameHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  gameHeaderMain: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    flex: 1,
  },
  gameThumbnail: {
    width: 88,
    height: 88,
    borderRadius: 18,
    objectFit: 'cover',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  gameThumbnailFallback: {
    width: 88,
    height: 88,
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontWeight: 700,
    fontSize: 18,
    textTransform: 'uppercase',
  },
  gameTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: '#f8fafc',
  },
  gameDescription: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  gameHeroMeta: {
    marginTop: 8,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#bfdbfe',
  },
  gameActionButton: (selected, busy) => ({
    padding: '10px 14px',
    borderRadius: 14,
    border: `1px solid ${selected ? 'rgba(59, 130, 246, 0.6)' : 'rgba(148, 163, 184, 0.35)'}`,
    background: busy
      ? 'rgba(30, 41, 59, 0.55)'
      : selected
      ? 'rgba(37, 99, 235, 0.28)'
      : 'rgba(15, 23, 42, 0.55)',
    color: selected ? '#bfdbfe' : '#cbd5f5',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
  }),
  slotChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: (active) => ({
    padding: '6px 10px',
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(34, 197, 94, 0.5)' : 'rgba(148, 163, 184, 0.3)'}`,
    background: active ? 'rgba(34, 197, 94, 0.18)' : 'rgba(15, 23, 42, 0.55)',
    color: active ? '#bbf7d0' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
  }),
  participantList: {
    display: 'grid',
    gap: 8,
  },
  participantItem: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    fontSize: 12,
    color: '#cbd5f5',
  },
  promptSlotRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  selectionSummary: {
    display: 'grid',
    gap: 6,
    padding: '12px 14px',
    borderRadius: 16,
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'rgba(30, 64, 175, 0.28)',
  },
  selectionSummaryContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  selectionSummaryImage: {
    width: 72,
    height: 72,
    borderRadius: 18,
    objectFit: 'cover',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.65)',
  },
  selectionSummaryImageFallback: {
    width: 72,
    height: 72,
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontWeight: 700,
    fontSize: 18,
    textTransform: 'uppercase',
  },
  selectionSummaryTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#dbeafe',
  },
  selectionSummaryMeta: {
    margin: 0,
    fontSize: 12,
    color: '#bfdbfe',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  selectionSummaryHeroMeta: {
    margin: 0,
    fontSize: 12,
    color: '#e0f2fe',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroRolePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 12,
    border: '1px solid rgba(59, 130, 246, 0.45)',
    background: 'rgba(37, 99, 235, 0.22)',
    color: '#dbeafe',
    fontWeight: 600,
  },
  heroScorePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 12,
    border: '1px solid rgba(14, 165, 233, 0.45)',
    background: 'rgba(14, 116, 233, 0.18)',
    color: '#bae6fd',
    fontWeight: 600,
  },
  roleWarning: {
    fontSize: 12,
    color: '#fbbf24',
    margin: '4px 0 0',
  },
  subtleText: {
    fontSize: 12,
    color: '#94a3b8',
    margin: 0,
  },
  infoText: {
    fontSize: 13,
    color: '#a5b4fc',
    margin: 0,
  },
  warningText: {
    fontSize: 13,
    color: '#fcd34d',
    margin: 0,
  },
  keyList: {
    display: 'grid',
    gap: 12,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  keyItem: {
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '14px 16px',
    display: 'grid',
    gap: 10,
  },
  keyHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  keyTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#f8fafc',
  },
  keyMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  keyActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyActionButton: (variant, busy) => {
    const palette = {
      primary: ['rgba(59, 130, 246, 0.8)', '#f8fafc'],
      neutral: ['rgba(15, 23, 42, 0.7)', '#cbd5f5'],
      danger: ['rgba(248, 113, 113, 0.2)', '#fecaca'],
    }
    const [background, color] = palette[variant] || palette.neutral
    return {
      padding: '8px 12px',
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.3)',
      background: busy ? 'rgba(30, 41, 59, 0.55)' : background,
      color: busy ? '#94a3b8' : color,
      fontWeight: 600,
      cursor: busy ? 'not-allowed' : 'pointer',
    }
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#cbd5f5',
  },
  formGrid: {
    display: 'grid',
    gap: 14,
  },
  formRow: {
    display: 'grid',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  textarea: {
    padding: '12px 14px',
    borderRadius: 16,
    minHeight: 88,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
    resize: 'vertical',
  },
  select: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  roleDisplay: {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px dashed rgba(59, 130, 246, 0.45)',
    background: 'rgba(30, 64, 175, 0.18)',
    color: '#dbeafe',
    fontSize: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  roleDisplayEmpty: {
    color: '#fbbf24',
    fontWeight: 600,
  },
  formActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  primaryButton: (busy) => ({
    padding: '12px 18px',
    borderRadius: 16,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: busy ? 'rgba(30, 41, 59, 0.55)' : 'rgba(59, 130, 246, 0.85)',
    color: busy ? '#94a3b8' : '#f8fafc',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  dangerButton: (busy) => ({
    padding: '12px 18px',
    borderRadius: 16,
    border: '1px solid rgba(248, 113, 113, 0.35)',
    background: busy ? 'rgba(30, 41, 59, 0.55)' : 'rgba(248, 113, 113, 0.25)',
    color: busy ? '#f87171' : '#fecaca',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  secondaryButton: (busy) => ({
    padding: '11px 16px',
    borderRadius: 14,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: busy ? 'rgba(30, 41, 59, 0.55)' : 'rgba(15, 23, 42, 0.65)',
    color: busy ? '#94a3b8' : '#cbd5f5',
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s ease',
  }),
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    margin: 0,
  },
  statusBadge: (status) => {
    const palette = {
      queued: ['rgba(56, 189, 248, 0.16)', 'rgba(56, 189, 248, 0.45)', '#bae6fd'],
      staging: ['rgba(192, 132, 252, 0.18)', 'rgba(192, 132, 252, 0.45)', '#e9d5ff'],
      ready: ['rgba(34, 197, 94, 0.18)', 'rgba(34, 197, 94, 0.42)', '#bbf7d0'],
      battle: ['rgba(251, 191, 36, 0.18)', 'rgba(251, 191, 36, 0.45)', '#fef08a'],
      evicted: ['rgba(248, 113, 113, 0.18)', 'rgba(248, 113, 113, 0.45)', '#fecaca'],
      default: ['rgba(148, 163, 184, 0.14)', 'rgba(148, 163, 184, 0.35)', '#e2e8f0'],
    }
    const [bg, border, text] = palette[status] || palette.default
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      borderRadius: 999,
      border: `1px solid ${border}`,
      background: bg,
      color: text,
      fontWeight: 700,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }
  },
  list: {
    display: 'grid',
    gap: 12,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  listItem: {
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.62)',
    padding: '14px 16px',
    display: 'grid',
    gap: 8,
  },
  listRow: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  listTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#f8fafc',
  },
  listMeta: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 13,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  linkButton: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#38bdf8',
    fontWeight: 600,
    textDecoration: 'none',
  },
  empty: {
    padding: '20px 10px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 12,
    color: '#cbd5f5',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: 10,
    background: 'rgba(148, 163, 184, 0.18)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    fontWeight: 600,
  },
  timeline: {
    display: 'grid',
    gap: 10,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  timelineItem: {
    borderLeft: '2px solid rgba(56, 189, 248, 0.4)',
    paddingLeft: 12,
    display: 'grid',
    gap: 4,
  },
  timelineTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#bae6fd',
  },
  timelineMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  stageSeats: {
    display: 'grid',
    gap: 8,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  stageSeatItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 12,
    background: 'rgba(15, 23, 42, 0.68)',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    fontSize: 13,
  },
  seatReady: (ready) => ({
    fontWeight: 700,
    color: ready ? '#4ade80' : '#f87171',
  }),
}

function normalizeLobbySnapshot(raw = {}) {
  const queue = Array.isArray(raw.queue)
    ? raw.queue.map(normalizeQueueTicket).filter(Boolean)
    : []
  const rooms = Array.isArray(raw.rooms)
    ? raw.rooms.map(normalizeRoom).filter(Boolean)
    : []
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(normalizeSession).filter(Boolean)
    : []
  return { queue, rooms, sessions }
}

function normalizeQueueTicket(row) {
  if (!row) return null
  const seatMap = Array.isArray(row.seat_map)
    ? row.seat_map.map(normalizeSeatEntry).filter(Boolean)
    : []
  return {
    id: row.id || null,
    queueId: row.queue_id || row.queueId || null,
    status: (row.status || '').toLowerCase() || 'queued',
    mode: row.mode || null,
    ownerId: row.owner_id || null,
    gameId: row.game_id || null,
    roomId: row.room_id || null,
    readyExpiresAt: row.ready_expires_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    readyVote: isObject(row.ready_vote) ? row.ready_vote : null,
    asyncFillMeta: isObject(row.async_fill_meta) ? row.async_fill_meta : null,
    payload: isObject(row.payload) ? row.payload : {},
    seatMap,
    occupiedSlots: Number.isFinite(row.occupied_slots)
      ? Number(row.occupied_slots)
      : seatMap.filter((seat) => seat?.ownerId).length,
    totalSlots: Number.isFinite(row.total_slots)
      ? Number(row.total_slots)
      : seatMap.length || null,
  }
}

function normalizeRoom(row) {
  if (!row) return null
  const slots = Array.isArray(row.slots)
    ? row.slots.map(normalizeSeatEntry).filter(Boolean)
    : []
  return {
    id: row.id || null,
    gameId: row.game_id || null,
    code: row.code || null,
    status: (row.status || '').toLowerCase() || 'open',
    mode: row.mode || null,
    realtimeMode: row.realtime_mode || null,
    slotCount: Number.isFinite(row.slot_count) ? Number(row.slot_count) : null,
    readyCount: Number.isFinite(row.ready_count) ? Number(row.ready_count) : null,
    filledCount: Number.isFinite(row.filled_count) ? Number(row.filled_count) : null,
    hostRoleLimit: Number.isFinite(row.host_role_limit) ? Number(row.host_role_limit) : null,
    hostLastActiveAt: row.host_last_active_at || null,
    updatedAt: row.updated_at || null,
    slots,
  }
}

function normalizeSession(row) {
  if (!row) return null
  return {
    id: row.id || null,
    status: (row.status || '').toLowerCase() || 'active',
    mode: row.mode || null,
    turn: Number.isFinite(row.turn) ? Number(row.turn) : 0,
    ratingHint: Number.isFinite(row.rating_hint) ? Number(row.rating_hint) : null,
    voteSnapshot: isObject(row.vote_snapshot) ? row.vote_snapshot : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeSeatEntry(entry) {
  if (!entry) return null
  const index = Number.isFinite(entry.index)
    ? Number(entry.index)
    : Number.isFinite(entry.slot_index)
    ? Number(entry.slot_index)
    : null
  return {
    index,
    role: entry.role || entry.slot_role || '',
    ownerId: entry.owner_id || entry.occupant_owner_id || null,
    heroName: entry.hero_name || entry.occupant_hero_name || null,
    ready: Boolean(
      entry.ready ?? entry.is_ready ?? entry.occupant_ready ?? false,
    ),
    updatedAt: entry.updated_at || null,
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function shortId(value) {
  if (!value) return '—'
  const str = String(value)
  if (str.length <= 8) return str
  return `${str.slice(0, 4)}…${str.slice(-2)}`
}

function translateStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'queued':
      return '대기중'
    case 'staging':
      return '준비 중'
    case 'ready':
      return '레디 완료'
    case 'battle':
    case 'in_progress':
      return '전투 중'
    case 'evicted':
      return '퇴출'
    case 'complete':
      return '종료'
    default:
      return status || '미정'
  }
}

function translateMode(mode) {
  if (!mode) return '기본'
  const lowered = mode.toLowerCase()
  if (lowered === 'rank') return '랭크'
  if (lowered === 'casual') return '캐주얼'
  if (lowered === 'event') return '이벤트'
  return mode
}

function formatRelativeTime(value) {
  if (!value && value !== 0) return '방금 전'
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return '알 수 없음'
  const diff = Date.now() - timestamp
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '전' : '후'
  if (abs < 45 * 1000) return diff >= 0 ? '방금 전' : '곧'
  if (abs < 90 * 1000) return `1분 ${suffix}`
  const minutes = Math.round(abs / 60000)
  if (minutes < 60) return `${minutes}분 ${suffix}`
  const hours = Math.round(abs / 3600000)
  if (hours < 24) return `${hours}시간 ${suffix}`
  const days = Math.round(abs / 86400000)
  if (days < 7) return `${days}일 ${suffix}`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}주 ${suffix}`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}개월 ${suffix}`
  const years = Math.round(days / 365)
  return `${years}년 ${suffix}`
}

function getInitialGameSelection() {
  if (typeof window === 'undefined') {
    return { gameId: '', realtime: 'all', dropIn: 'all', search: '' }
  }
  try {
    const raw = window.localStorage.getItem(GAME_SELECTION_STORAGE_KEY)
    if (!raw) {
      return { gameId: '', realtime: 'all', dropIn: 'all', search: '' }
    }
    const parsed = JSON.parse(raw)
    return {
      gameId: typeof parsed.gameId === 'string' ? parsed.gameId : '',
      realtime: GAME_REALTIME_FILTERS.includes(parsed.realtime) ? parsed.realtime : 'all',
      dropIn: GAME_DROP_IN_FILTERS.includes(parsed.dropIn) ? parsed.dropIn : 'all',
      search: typeof parsed.search === 'string' ? parsed.search : '',
    }
  } catch (error) {
    console.warn('[RankLobby] Failed to parse stored game selection:', error)
    return { gameId: '', realtime: 'all', dropIn: 'all', search: '' }
  }
}

function persistGameSelection(selection) {
  if (typeof window === 'undefined') return
  try {
    if (!selection) {
      window.localStorage.removeItem(GAME_SELECTION_STORAGE_KEY)
      return
    }
    const payload = {
      gameId: typeof selection.gameId === 'string' ? selection.gameId : '',
      realtime: GAME_REALTIME_FILTERS.includes(selection.realtime) ? selection.realtime : 'all',
      dropIn: GAME_DROP_IN_FILTERS.includes(selection.dropIn) ? selection.dropIn : 'all',
      search: typeof selection.search === 'string' ? selection.search : '',
    }
    window.localStorage.setItem(GAME_SELECTION_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('[RankLobby] Failed to persist game selection:', error)
  }
}

async function requestUserApiKeyring(method, payload) {
  const options = { method, headers: {} }
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(payload ?? {})
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

function normalizeGameSlot(row) {
  if (!row) return null
  const rawIndex =
    Number.isFinite(Number(row.slot_index))
      ? Number(row.slot_index)
      : Number.isFinite(Number(row.slotIndex))
      ? Number(row.slotIndex)
      : null
  return {
    slotIndex: rawIndex,
    role: row.role || '',
    active: row.active !== false,
    heroId: row.hero_id || null,
    heroOwnerId: row.hero_owner_id || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizePromptSlot(row) {
  if (!row) return null
  const slotNo =
    Number.isFinite(Number(row.slot_no))
      ? Number(row.slot_no)
      : Number.isFinite(Number(row.slotNo))
      ? Number(row.slotNo)
      : null
  return {
    slotNo,
    slotType: row.slot_type || row.slotType || 'ai',
    isStart: row.is_start === true || row.isStart === true,
    invisible: row.invisible === true,
  }
}

function normalizeParticipantEntry(row) {
  if (!row) return null
  return {
    ownerId: row.owner_id || row.ownerId || null,
    heroId: row.hero_id || row.heroId || null,
    role: row.role || '',
    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
    score: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
    status: row.status || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function normalizeRoleCatalogEntry(row) {
  if (!row) return null
  return {
    name: row.name || '',
    slotCount: Number.isFinite(Number(row.slot_count)) ? Number(row.slot_count) : null,
    active: row.active !== false,
    scoreDeltaMin: Number.isFinite(Number(row.score_delta_min)) ? Number(row.score_delta_min) : null,
    scoreDeltaMax: Number.isFinite(Number(row.score_delta_max)) ? Number(row.score_delta_max) : null,
  }
}

function normalizeGameRow(row) {
  if (!row) return null
  const slots = Array.isArray(row.slots) ? row.slots.map(normalizeGameSlot).filter(Boolean) : []
  const promptSlots = Array.isArray(row.prompt_slots)
    ? row.prompt_slots.map(normalizePromptSlot).filter(Boolean)
    : []
  const participants = Array.isArray(row.participants)
    ? row.participants.map(normalizeParticipantEntry).filter(Boolean)
    : []
  const roleCatalog = Array.isArray(row.role_catalog)
    ? row.role_catalog.map(normalizeRoleCatalogEntry).filter(Boolean)
    : []
  const promptSet = isObject(row.prompt_set)
    ? {
        id: row.prompt_set.id || null,
        name: row.prompt_set.name || '',
        description: row.prompt_set.description || '',
      }
    : null
  const activeSlotCount = slots.filter((slot) => slot?.active !== false).length
  const slotCount = Number.isFinite(Number(row.slot_count))
    ? Number(row.slot_count)
    : activeSlotCount
  const heroScoreMin = Number.isFinite(Number(row.hero_score_min))
    ? Number(row.hero_score_min)
    : null
  const heroScoreMax = Number.isFinite(Number(row.hero_score_max))
    ? Number(row.hero_score_max)
    : null
  const heroScoreRange = heroScoreMin !== null || heroScoreMax !== null
    ? { min: heroScoreMin, max: heroScoreMax }
    : null

  return {
    id: row.id || null,
    name: row.name || '이름 없는 게임',
    description: row.description || '',
    imageUrl: row.image_url || row.imageUrl || null,
    realtimeMode: row.realtime_mode || row.realtimeMode || REALTIME_MODES.OFF,
    dropInEnabled: row.drop_in_enabled === true || row.dropInEnabled === true,
    promptSet,
    promptSlots,
    slots,
    slotCount,
    playCount: Number.isFinite(Number(row.play_count)) ? Number(row.play_count) : null,
    likesCount: Number.isFinite(Number(row.likes_count)) ? Number(row.likes_count) : null,
    updatedAt: row.updated_at || null,
    participants,
    roleCatalog,
    heroRole: row.hero_role || row.heroRole || null,
    heroSlotNo: Number.isFinite(Number(row.hero_slot_no)) ? Number(row.hero_slot_no) : null,
    heroRating: Number.isFinite(Number(row.hero_rating)) ? Number(row.hero_rating) : null,
    heroScore: Number.isFinite(Number(row.hero_score)) ? Number(row.hero_score) : null,
    heroScoreRange,
    heroRoleDeltaMin: Number.isFinite(Number(row.hero_role_delta_min))
      ? Number(row.hero_role_delta_min)
      : null,
    heroRoleDeltaMax: Number.isFinite(Number(row.hero_role_delta_max))
      ? Number(row.hero_role_delta_max)
      : null,
  }
}

function normalizeGameCatalog(raw = {}) {
  const rows = Array.isArray(raw.games) ? raw.games : []
  return rows.map(normalizeGameRow).filter(Boolean)
}

function formatRealtimeModeLabel(mode) {
  const normalized = normalizeRealtimeMode(mode)
  if (normalized === REALTIME_MODES.PULSE) return 'Pulse 실시간'
  if (normalized === REALTIME_MODES.STANDARD) return '실시간'
  return '턴 기반'
}

function formatDropInLabel(flag) {
  return flag ? '난입 허용' : '난입 제한'
}

function formatScoreRange(range) {
  if (!range) return '—'
  const min = Number.isFinite(range?.min) ? Number(range.min) : null
  const max = Number.isFinite(range?.max) ? Number(range.max) : null
  if (min !== null && max !== null) {
    return `${min}~${max}`
  }
  if (min !== null) {
    return `${min}+`
  }
  if (max !== null) {
    return `≤${max}`
  }
  return '—'
}

function formatProviderLabel(provider) {
  if (!provider) return KEY_PROVIDER_LABELS.unknown
  const key = String(provider).toLowerCase()
  return KEY_PROVIDER_LABELS[key] || KEY_PROVIDER_LABELS.unknown
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

function describeRealtimeEvent(event) {
  if (!event?.payload) return null
  const { payload } = event
  const table = payload.table || 'unknown'
  const eventType = (payload.eventType || payload.event || 'update').toLowerCase()
  const record = payload.new || payload.old || {}
  const id = record.id || record.queue_ticket_id || record.session_id || null
  const status = record.status || record.mode || null
  let summary = ''

  if (table === 'rank_queue_tickets') {
    summary = `큐 티켓 ${shortId(id)} → ${translateStatus(status)}`
  } else if (table === 'rank_rooms') {
    summary = `방 ${record.code ? record.code : shortId(id)} → ${translateStatus(status)}`
  } else if (table === 'rank_sessions') {
    summary = `세션 ${shortId(id)} → ${translateStatus(status)}`
  } else {
    summary = `${table} ${eventType}`
  }

  return {
    id: `${table}:${id || payload.commit_timestamp || Date.now()}`,
    table,
    eventType,
    summary,
    status: status || null,
    createdAt: Date.now(),
  }
}

function buildQueuePayload(hero, joinForm, heroStats, selectedGame) {
  const heroRole = selectedGame?.heroRole || joinForm.role || 'flex'
  const payload = {
    hero_id: hero?.hero_id || null,
    hero_name: hero?.name || null,
    owner_id: hero?.owner_id || hero?.user_id || null,
    role: heroRole,
    mode: joinForm.mode || 'rank',
    queue_mode: joinForm.mode || 'rank',
  }

  if (joinForm.gameId) {
    payload.game_id = joinForm.gameId
  } else if (selectedGame?.id) {
    payload.game_id = selectedGame.id
  }

  if (joinForm.roomId) {
    payload.room_id = joinForm.roomId
  }
  if (joinForm.note) {
    payload.note = joinForm.note
  }

  payload.ready_vote = {
    ready: true,
    hero_id: hero?.hero_id || null,
    owner_id: hero?.owner_id || hero?.user_id || null,
  }

  payload.async_fill_meta = {
    preferred_role: heroRole,
    requested_at: new Date().toISOString(),
  }

  const properties = {}
  if (Number.isFinite(heroStats?.totalSessions)) {
    properties.sessions_played = heroStats.totalSessions
  }
  if (heroStats?.favouriteMode) {
    properties.favourite_mode = heroStats.favouriteMode
  }
  if (heroStats?.lastPlayedAt) {
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
    if (Array.isArray(selectedGame.roleCatalog) && selectedGame.roleCatalog.length) {
      payload.game_preferences.role_catalog = selectedGame.roleCatalog.map((role) => ({
        name: role.name || '',
        slot_count: Number.isFinite(role.slotCount) ? role.slotCount : null,
        active: role.active !== false,
        score_delta_min: Number.isFinite(role.scoreDeltaMin) ? role.scoreDeltaMin : null,
        score_delta_max: Number.isFinite(role.scoreDeltaMax) ? role.scoreDeltaMax : null,
      }))
    }
  }

  return payload
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

function buildSeatSummary(ticket) {
  if (!ticket?.seatMap?.length) {
    return '좌석 정보 없음'
  }
  const readyCount = ticket.seatMap.filter((seat) => seat.ready).length
  return `${readyCount}/${ticket.seatMap.length} 준비 완료`
}
export default function RoomsLobbyPage() {
  const mountedRef = useRef(false)
  const refreshTimerRef = useRef(null)

  const initialSelection = useMemo(() => getInitialGameSelection(), [])
  const [selectedGameId, setSelectedGameId] = useState(initialSelection.gameId)
  const [realtimeFilter, setRealtimeFilter] = useState(initialSelection.realtime)
  const [dropInFilter, setDropInFilter] = useState(initialSelection.dropIn)
  const [gameSearch, setGameSearch] = useState(initialSelection.search)
  const [gameCatalog, setGameCatalog] = useState([])
  const [gameCatalogLoading, setGameCatalogLoading] = useState(false)
  const [gameCatalogRefreshing, setGameCatalogRefreshing] = useState(false)
  const [gameCatalogError, setGameCatalogError] = useState(null)

  const [keyringEntries, setKeyringEntries] = useState(() => {
    const snapshot = readRankKeyringSnapshot()
    return Array.isArray(snapshot.entries) ? snapshot.entries : []
  })
  const [keyringLimit, setKeyringLimit] = useState(5)
  const [keyringLoading, setKeyringLoading] = useState(false)
  const [keyringSubmitting, setKeyringSubmitting] = useState(false)
  const [keyringError, setKeyringError] = useState(null)
  const [keyringMessage, setKeyringMessage] = useState('')
  const [keyMutation, setKeyMutation] = useState({ type: null, id: null })
  const [newApiKey, setNewApiKey] = useState('')
  const [activateOnSave, setActivateOnSave] = useState(true)

  const [queueId, setQueueId] = useState('rank-default')
  const [snapshot, setSnapshot] = useState({ queue: [], rooms: [], sessions: [] })
  const [snapshotError, setSnapshotError] = useState(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(true)
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(false)

  const [viewerHero, setViewerHero] = useState(null)
  const [viewerUserId, setViewerUserId] = useState(null)
  const [participations, setParticipations] = useState([])
  const [heroLoading, setHeroLoading] = useState(false)

  const heroId = viewerHero?.hero_id || null

  const [joinForm, setJoinForm] = useState({
    mode: 'rank',
    role: '',
    roomId: '',
    note: '',
    gameId: initialSelection.gameId || '',
  })
  const [ticket, setTicket] = useState(null)
  const [stageInfo, setStageInfo] = useState(null)

  const [joinBusy, setJoinBusy] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [stageBusy, setStageBusy] = useState(false)
  const [queueError, setQueueError] = useState(null)

  const [eventLog, setEventLog] = useState([])

  const selectedGame = useMemo(
    () => (selectedGameId ? gameCatalog.find((game) => game.id === selectedGameId) || null : null),
    [gameCatalog, selectedGameId],
  )

  const filteredGames = useMemo(() => {
    const search = gameSearch.trim().toLowerCase()
    return gameCatalog.filter((game) => {
      if (!game.heroRole) return false
      if (realtimeFilter === 'realtime' && !isRealtimeEnabled(game.realtimeMode)) return false
      if (realtimeFilter === 'async' && isRealtimeEnabled(game.realtimeMode)) return false
      if (dropInFilter === 'allow' && !game.dropInEnabled) return false
      if (dropInFilter === 'deny' && game.dropInEnabled) return false
      if (search) {
        const haystack = [
          game.name,
          game.description,
          game.promptSet?.name,
          game.heroRole,
          Number.isFinite(game.heroScore) ? `score:${game.heroScore}` : null,
          Number.isFinite(game.heroRating) ? `rating:${game.heroRating}` : null,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [gameCatalog, realtimeFilter, dropInFilter, gameSearch])

  const heroStats = useMemo(() => computeHeroStats(participations), [participations])

  const activeKeyCount = useMemo(
    () => keyringEntries.filter((entry) => entry.isActive).length,
    [keyringEntries],
  )
  const hasActiveKey = activeKeyCount > 0

  const applyKeyringEntries = useCallback(
    (entries) => {
      setKeyringEntries(entries)
      if (viewerUserId) {
        persistRankKeyringSnapshot({
          userId: viewerUserId,
          entries: entries.map(sanitizeKeyringStorageEntry),
        })
      }
    },
    [viewerUserId],
  )

  const loadGames = useCallback(
    async (reason = 'manual') => {
      if (!mountedRef.current) return
      if (reason === 'initial') {
        setGameCatalogLoading(true)
      } else {
        setGameCatalogRefreshing(true)
      }
      setGameCatalogError(null)
      try {
        if (!heroId) {
          setGameCatalog([])
          return
        }
        const raw = await ensureRpc('fetch_rank_lobby_games', { p_hero_id: heroId, p_limit: 48 })
        if (!mountedRef.current) return
        setGameCatalog(normalizeGameCatalog(raw))
      } catch (error) {
        if (mountedRef.current) {
          setGameCatalogError(error)
        }
      } finally {
        if (mountedRef.current) {
          if (reason === 'initial') {
            setGameCatalogLoading(false)
          } else {
            setGameCatalogRefreshing(false)
          }
        }
      }
    },
    [heroId],
  )

  const loadKeyring = useCallback(async () => {
    setKeyringError(null)
    setKeyringLoading(true)
    try {
      const payload = await requestUserApiKeyring('GET')
      if (!mountedRef.current) return
      const entries = Array.isArray(payload.keys)
        ? payload.keys.map(normalizeKeyringEntry).filter(Boolean)
        : []
      applyKeyringEntries(entries)
      if (Number.isFinite(Number(payload.limit))) {
        setKeyringLimit(Number(payload.limit))
      }
    } catch (error) {
      if (mountedRef.current) {
        setKeyringError(error)
      }
    } finally {
      if (mountedRef.current) {
        setKeyringLoading(false)
      }
    }
  }, [applyKeyringEntries])

  const handleAddApiKey = useCallback(async () => {
    const trimmed = newApiKey.trim()
    if (!trimmed) {
      setKeyringError(new Error('API 키를 입력해 주세요.'))
      return
    }
    setKeyringError(null)
    setKeyringMessage('')
    setKeyringSubmitting(true)
    try {
      const payload = await requestUserApiKeyring('POST', { apiKey: trimmed, activate: activateOnSave })
      const entry = normalizeKeyringEntry(payload.entry)
      if (entry) {
        const nextEntries = mergeKeyringEntries(keyringEntries, entry, payload?.activated !== false)
        applyKeyringEntries(nextEntries)
      }
      if (typeof payload.limit === 'number') {
        setKeyringLimit(Number(payload.limit))
      }
      setNewApiKey('')
      if (payload?.detection?.detail) {
        setKeyringMessage(payload.detection.detail)
      } else if (payload?.activated !== false) {
        setKeyringMessage('API 키를 등록하고 사용으로 전환했습니다.')
      } else {
        setKeyringMessage('API 키를 등록했습니다. 필요 시 사용을 켜 주세요.')
      }
    } catch (error) {
      setKeyringError(error)
    } finally {
      setKeyringSubmitting(false)
    }
  }, [newApiKey, activateOnSave, keyringEntries, applyKeyringEntries])

  const handleActivateKey = useCallback(
    async (entry) => {
      if (!entry?.id || entry.isActive) return
      setKeyringError(null)
      setKeyringMessage('')
      setKeyMutation({ type: 'activate', id: entry.id })
      try {
        const payload = await requestUserApiKeyring('PATCH', { id: entry.id })
        const updated = normalizeKeyringEntry(payload.entry)
        const nextEntries = mergeKeyringEntries(keyringEntries, updated, true)
        applyKeyringEntries(nextEntries)
        setKeyringMessage('선택한 API 키를 사용하도록 설정했습니다.')
      } catch (error) {
        setKeyringError(error)
      } finally {
        setKeyMutation({ type: null, id: null })
      }
    },
    [keyringEntries, applyKeyringEntries],
  )

  const handleDeactivateKey = useCallback(
    async (entry) => {
      if (!entry?.id || !entry.isActive) return
      setKeyringError(null)
      setKeyringMessage('')
      setKeyMutation({ type: 'deactivate', id: entry.id })
      try {
        const payload = await requestUserApiKeyring('PATCH', { id: entry.id, action: 'deactivate' })
        const updated = normalizeKeyringEntry(payload.entry)
        const nextEntries = keyringEntries.map((item) =>
          item.id === updated.id
            ? { ...item, isActive: false, updatedAt: updated.updatedAt || item.updatedAt }
            : item,
        )
        applyKeyringEntries(nextEntries)
        setKeyringMessage('API 키 사용을 중지했습니다.')
      } catch (error) {
        setKeyringError(error)
      } finally {
        setKeyMutation({ type: null, id: null })
      }
    },
    [keyringEntries, applyKeyringEntries],
  )

  const handleDeleteKey = useCallback(
    async (entry) => {
      if (!entry?.id) return
      setKeyringError(null)
      setKeyringMessage('')
      setKeyMutation({ type: 'delete', id: entry.id })
      try {
        await requestUserApiKeyring('DELETE', { id: entry.id })
        const nextEntries = keyringEntries.filter((item) => item.id !== entry.id)
        applyKeyringEntries(nextEntries)
        setKeyringMessage('API 키를 삭제했습니다.')
      } catch (error) {
        setKeyringError(error)
      } finally {
        setKeyMutation({ type: null, id: null })
      }
    },
    [keyringEntries, applyKeyringEntries],
  )

  const handleRefreshGames = useCallback(() => {
    loadGames('manual')
  }, [loadGames])

  useEffect(() => {
    persistGameSelection({
      gameId: selectedGameId || '',
      realtime: realtimeFilter,
      dropIn: dropInFilter,
      search: gameSearch,
    })
  }, [selectedGameId, realtimeFilter, dropInFilter, gameSearch])

  useEffect(() => {
    loadGames('initial')
  }, [loadGames])

  useEffect(() => {
    if (heroId) return
    setSelectedGameId('')
  }, [heroId])

  useEffect(() => {
    if (!selectedGameId) return
    if (!gameCatalog.length) return
    const exists = gameCatalog.some((game) => game.id === selectedGameId)
    if (!exists) {
      setSelectedGameId('')
    }
  }, [gameCatalog, selectedGameId])

  useEffect(() => {
    const nextGameId = selectedGame?.id || ''
    const nextRole = selectedGame?.heroRole || ''
    setJoinForm((prev) => {
      const prevGameId = prev.gameId || ''
      const prevRole = prev.role || ''
      if (prevGameId === nextGameId && prevRole === nextRole) return prev
      return { ...prev, gameId: nextGameId, role: nextRole }
    })
  }, [selectedGame])

  useEffect(() => {
    if (selectedGameId) return
    if (!gameCatalog.length) return
    const fallback = gameCatalog[0]
    if (fallback?.id) {
      setSelectedGameId(fallback.id)
    }
  }, [gameCatalog, selectedGameId])

  useEffect(() => {
    if (!viewerUserId) return
    loadKeyring()
  }, [viewerUserId, loadKeyring])

  useEffect(() => {
    if (!viewerUserId) return
    persistRankKeyringSnapshot({
      userId: viewerUserId,
      entries: keyringEntries.map(sanitizeKeyringStorageEntry),
    })
  }, [viewerUserId])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = readTicket()
    if (stored) {
      setTicket(normalizeQueueTicket(stored))
    }
  }, [])

  const fetchSnapshot = useCallback(
    async (reason = 'manual') => {
      if (!queueId) return
      if (reason === 'initial') {
        setLoadingSnapshot(true)
      } else {
        setRefreshingSnapshot(true)
      }
      setSnapshotError(null)
      try {
        const raw = await ensureRpc('fetch_rank_lobby_snapshot', {
          // Parameter names must match the Supabase function signature (p_queue_id, p_limit).
          p_queue_id: queueId,
          p_limit: 24,
        })
        if (!mountedRef.current) return
        const normalized = normalizeLobbySnapshot(raw)
        setSnapshot(normalized)
        setTicket((prev) => {
          if (!prev?.id) return prev
          const updated = normalized.queue.find((entry) => entry.id === prev.id)
          if (updated) {
            persistTicket(updated)
            return updated
          }
          return prev
        })
      } catch (error) {
        console.error('[RankLobby] snapshot fetch failed', error)
        if (mountedRef.current) {
          setSnapshotError(error)
        }
      } finally {
        if (mountedRef.current) {
          setLoadingSnapshot(false)
          setRefreshingSnapshot(false)
          setRefreshRequested(false)
        }
      }
    },
    [queueId],
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
    let cancelled = false

    const loadViewer = async () => {
      try {
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

        if (cancelled || !mountedRef.current) return

        setViewerUserId(user?.id || null)
        if (!user) {
          setViewerHero(null)
          setParticipations([])
          return
        }

        const profile = await resolveViewerProfile(user, null)
        if (cancelled || !mountedRef.current) return

        setViewerHero(profile)
        if (profile?.hero_id) {
          setHeroLoading(true)
          try {
            const bundle = await fetchHeroParticipationBundle(profile.hero_id, {
              heroSeed: {
                id: profile.hero_id,
                name: profile.name,
                owner_id: profile.owner_id || profile.user_id || user.id,
              },
            })
            if (!cancelled && mountedRef.current) {
              setParticipations(Array.isArray(bundle?.participations) ? bundle.participations : [])
            }
          } catch (participationError) {
            console.warn('[RankLobby] failed to load participation bundle', participationError)
            if (!cancelled && mountedRef.current) {
              setParticipations([])
            }
          } finally {
            if (!cancelled && mountedRef.current) {
              setHeroLoading(false)
            }
          }
        } else {
          setParticipations([])
        }
      } catch (error) {
        console.error('[RankLobby] failed to resolve viewer profile', error)
        if (!cancelled && mountedRef.current) {
          setViewerHero(null)
          setParticipations([])
        }
      }
    }

    loadViewer()

    return () => {
      cancelled = true
    }
  }, [])

  const handleRealtimeEvent = useCallback((event) => {
    const entry = describeRealtimeEvent(event)
    if (entry) {
      setEventLog((prev) => [entry, ...prev].slice(0, 25))
    }
    setRefreshRequested(true)
  }, [])

  useEffect(() => {
    const unsubscribeQueue = subscribeToQueue(queueId, handleRealtimeEvent)
    const channel = supabase.channel(`rank-lobby:${queueId}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rank_rooms' },
      (payload) => handleRealtimeEvent({ type: 'room', payload }),
    )
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rank_sessions' },
      (payload) => handleRealtimeEvent({ type: 'session', payload }),
    )
    channel.subscribe()

    return () => {
      unsubscribeQueue?.()
      supabase.removeChannel(channel)
    }
  }, [queueId, handleRealtimeEvent])

  const handleJoinQueue = useCallback(async () => {
    if (!queueId) return
    if (!joinForm.gameId) {
      setQueueError(new Error('큐에 합류하기 전에 게임을 선택해 주세요.'))
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
    setQueueError(null)
    setJoinBusy(true)
    try {
      const payload = buildQueuePayload(viewerHero, joinForm, heroStats, selectedGame)
      const data = await ensureRpc('join_rank_queue', {
        queue_id: queueId,
        payload,
      })
      const normalized = normalizeQueueTicket(data)
      if (normalized) {
        setTicket(normalized)
        persistTicket(normalized)
        setStageInfo(null)
      }
      fetchSnapshot('manual')
    } catch (error) {
      console.error('[RankLobby] join queue failed', error)
      setQueueError(error)
    } finally {
      setJoinBusy(false)
    }
  }, [queueId, joinForm, hasActiveKey, viewerHero, heroStats, selectedGame, fetchSnapshot])

  const handleLeaveQueue = useCallback(async () => {
    if (!ticket?.id) {
      setTicket(null)
      persistTicket(null)
      setStageInfo(null)
      return
    }
    setQueueError(null)
    setLeaveBusy(true)
    try {
      await ensureRpc('cancel_rank_queue_ticket', {
        queue_ticket_id: ticket.id,
      })
      setTicket(null)
      persistTicket(null)
      setStageInfo(null)
      fetchSnapshot('manual')
    } catch (error) {
      console.error('[RankLobby] cancel queue ticket failed', error)
      setQueueError(error)
    } finally {
      setLeaveBusy(false)
    }
  }, [ticket, fetchSnapshot])

  const handleStageMatch = useCallback(async () => {
    if (!ticket?.id) return
    setQueueError(null)
    setStageBusy(true)
    try {
      const data = await ensureRpc('stage_rank_match', {
        queue_ticket_id: ticket.id,
      })
      const seats = Array.isArray(data?.seats)
        ? data.seats.map(normalizeSeatEntry).filter(Boolean)
        : []
      setStageInfo({
        sessionId: data?.session_id || null,
        readyExpiresAt: data?.ready_expires_at || null,
        seats,
      })
      fetchSnapshot('manual')
    } catch (error) {
      console.error('[RankLobby] stage match failed', error)
      setQueueError(error)
    } finally {
      setStageBusy(false)
    }
  }, [ticket, fetchSnapshot])

  const heroGames = useMemo(() => {
    const games = Array.isArray(heroStats.games) ? heroStats.games.slice(0, 4) : []
    return games.map((game) => ({
      ...game,
      rating: Number.isFinite(game?.rating) ? Number(game.rating) : null,
      score: Number.isFinite(game?.score) ? Number(game.score) : null,
    }))
  }, [heroStats.games])

  const queuePreview = useMemo(() => snapshot.queue.slice(0, 6), [snapshot.queue])
  const sessionPreview = useMemo(() => snapshot.sessions.slice(0, 5), [snapshot.sessions])
  const accessibleRooms = useMemo(() => {
    if (!selectedGame?.id || !selectedGame?.heroRole) return []
    const min = Number.isFinite(selectedGame.heroScoreRange?.min)
      ? Number(selectedGame.heroScoreRange.min)
      : null
    const max = Number.isFinite(selectedGame.heroScoreRange?.max)
      ? Number(selectedGame.heroScoreRange.max)
      : null
    return snapshot.rooms.filter((room) => {
      if (room.gameId && selectedGame.id && room.gameId !== selectedGame.id) return false
      const hasRoleVacancy = Array.isArray(room.slots)
        ? room.slots.some((slot) => slot.role === selectedGame.heroRole && !slot.ownerId)
        : false
      if (!hasRoleVacancy) return false
      if (!Number.isFinite(room.hostRoleLimit)) return true
      if (min !== null && room.hostRoleLimit < min) return false
      if (max !== null && room.hostRoleLimit > max) return false
      return true
    })
  }, [snapshot.rooms, selectedGame])
  const roomPreview = useMemo(() => accessibleRooms.slice(0, 5), [accessibleRooms])
  const canJoinQueue = Boolean(
    selectedGame?.id &&
      joinForm.gameId &&
      selectedGame?.heroRole &&
      hasActiveKey,
  )

  useEffect(() => {
    setJoinForm((prev) => {
      if (!prev.roomId) return prev
      const stillValid = accessibleRooms.some((room) => room.id === prev.roomId)
      if (stillValid) return prev
      return { ...prev, roomId: '' }
    })
  }, [accessibleRooms])
  return (
    <>
      <Head>
        <title>랭크 매칭 로비</title>
      </Head>
      <main style={styles.page}>
        <div style={styles.container}>
          <header style={styles.header}>
            <div style={styles.headerTitle}>
              <h1 style={styles.title}>랭크 매칭 로비</h1>
              <p style={styles.subtitle}>
                Open Match 참조 데이터를 Supabase RPC/Realtime 구조로 재해석했습니다. 큐 티켓·방·세션을 한 화면에서 살피고 즉시 액션을 취해보세요.
              </p>
            </div>
            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.refreshButton(loadingSnapshot || refreshingSnapshot)}
                onClick={() => fetchSnapshot('manual')}
                disabled={loadingSnapshot || refreshingSnapshot}
              >
                {loadingSnapshot || refreshingSnapshot ? '새로고침 중…' : '즉시 새로고침'}
              </button>
              <Link href="/arena/queue" style={styles.linkButton}>
                큐 실험실 열기
              </Link>
              <Link href="/arena/staging" style={styles.linkButton}>
                스테이징 대시보드
              </Link>
            </div>
          </header>

          {snapshotError ? (
            <p style={styles.errorText}>
              로비 스냅샷을 불러오는 중 오류가 발생했습니다: {snapshotError.message || '알 수 없는 오류'}
            </p>
          ) : null}

          {queueError ? (
            <p style={styles.errorText}>
              큐 작업 오류: {queueError.message || '알 수 없는 오류'}
            </p>
          ) : null}

          <section style={styles.layout}>
            <div style={styles.columns}>
              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>플레이어 &amp; 영웅</h2>
                  <p style={styles.cardHint}>
                    Tinode Presence에서 가져온 아이디어로 활동량을 큐 속성에 함께 남깁니다.
                  </p>
                </header>
                <div style={styles.heroGrid}>
                  <span style={styles.heroBadge}>
                    {viewerHero?.name || '익명 플레이어'}
                    {viewerHero?.hero_id ? ` · ${shortId(viewerHero.hero_id)}` : ''}
                  </span>
                  <div style={styles.heroStatsRow}>
                    <span style={styles.heroStatBadge}>총 세션 {heroStats.totalSessions || 0}회</span>
                    <span style={styles.heroStatBadge}>
                      선호 모드 {heroStats.favouriteMode ? translateMode(heroStats.favouriteMode) : '데이터 없음'}
                    </span>
                    <span style={styles.heroStatBadge}>
                      최근 플레이 {heroStats.lastPlayedAt ? formatRelativeTime(heroStats.lastPlayedAt) : '기록 없음'}
                    </span>
                    {viewerUserId ? <span style={styles.heroStatBadge}>User {shortId(viewerUserId)}</span> : null}
                  </div>
                  <div>
                    <h3 style={{ ...styles.cardTitle, fontSize: 16 }}>최근 참가 게임</h3>
                    {heroLoading ? (
                      <p style={styles.cardHint}>영웅 활동을 불러오는 중…</p>
                    ) : heroGames.length ? (
                      <ul style={styles.heroGamesList}>
                        {heroGames.map((game) => (
                          <li key={game.id} style={styles.heroGameItem}>
                            <strong>{game.name}</strong>
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>
                              세션 {game.sessions || 0}회 · 모드 {game.mode ? translateMode(game.mode) : '미정'}
                            </span>
                            <div style={styles.heroGameMeta}>
                              {game.role ? <span>역할 {game.role}</span> : null}
                              {Number.isFinite(game.rating) ? <span>레이팅 {game.rating}</span> : null}
                              {Number.isFinite(game.score) ? <span>점수 {game.score}</span> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={styles.cardHint}>참여한 게임 정보가 없습니다.</p>
                    )}
                  </div>
                </div>
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>게임 검색 &amp; 선택</h2>
                  <p style={styles.cardHint}>
                    Supabase RPC가 제공하는 게임·프롬프트·슬롯 구성을 살펴보고 매칭에 사용할 게임을 고르세요.
                  </p>
                </header>
                <div style={styles.gameControls}>
                  <input
                    type="search"
                    value={gameSearch}
                    onChange={(event) => setGameSearch(event.target.value)}
                    placeholder="게임 이름 또는 설명 검색"
                    style={styles.searchInput}
                  />
                  <select
                    value={realtimeFilter}
                    onChange={(event) => setRealtimeFilter(event.target.value)}
                    style={styles.smallSelect}
                  >
                    <option value="all">실시간/턴 기반 전체</option>
                    <option value="realtime">실시간 게임</option>
                    <option value="async">턴 기반 게임</option>
                  </select>
                  <select
                    value={dropInFilter}
                    onChange={(event) => setDropInFilter(event.target.value)}
                    style={styles.smallSelect}
                  >
                    <option value="all">난입 옵션 전체</option>
                    <option value="allow">난입 허용</option>
                    <option value="deny">난입 제한</option>
                  </select>
                  <button
                    type="button"
                    style={styles.secondaryButton(gameCatalogLoading || gameCatalogRefreshing)}
                    onClick={handleRefreshGames}
                    disabled={gameCatalogLoading || gameCatalogRefreshing}
                  >
                    {gameCatalogLoading || gameCatalogRefreshing ? '불러오는 중…' : '목록 새로고침'}
                  </button>
                </div>
                {gameCatalogError ? (
                  <p style={styles.errorText}>
                    게임 목록을 불러오지 못했습니다: {gameCatalogError.message || '알 수 없는 오류'}
                  </p>
                ) : null}
                {selectedGame ? (
                  <div style={styles.selectionSummary}>
                    <div style={styles.selectionSummaryContainer}>
                      {selectedGame.imageUrl ? (
                        <img
                          src={selectedGame.imageUrl}
                          alt={`${selectedGame.name} 이미지`}
                          style={styles.selectionSummaryImage}
                        />
                      ) : (
                        <div style={styles.selectionSummaryImageFallback}>
                          {(selectedGame.name || '게임')[0]}
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: 6 }}>
                        <h3 style={styles.selectionSummaryTitle}>{selectedGame.name}</h3>
                        <p style={styles.selectionSummaryMeta}>
                          <span>{formatRealtimeModeLabel(selectedGame.realtimeMode)}</span>
                          <span>{formatDropInLabel(selectedGame.dropInEnabled)}</span>
                          {selectedGame.promptSet?.name ? (
                            <span>프롬프트 {selectedGame.promptSet.name}</span>
                          ) : null}
                          <span>슬롯 {selectedGame.slotCount ?? 0}개</span>
                        </p>
                        <p style={styles.selectionSummaryHeroMeta}>
                          <span style={styles.heroRolePill}>
                            내 역할 {selectedGame.heroRole || '미등록'}
                          </span>
                          {Number.isFinite(selectedGame.heroSlotNo) ? (
                            <span style={styles.heroScorePill}>
                              슬롯 #{Number(selectedGame.heroSlotNo) + 1}
                            </span>
                          ) : null}
                          {Number.isFinite(selectedGame.heroScore) ? (
                            <span style={styles.heroScorePill}>점수 {selectedGame.heroScore}</span>
                          ) : null}
                          {Number.isFinite(selectedGame.heroRating) ? (
                            <span style={styles.heroScorePill}>레이팅 {selectedGame.heroRating}</span>
                          ) : null}
                          {selectedGame.heroScoreRange ? (
                            <span style={styles.heroScorePill}>
                              허용 점수 {formatScoreRange(selectedGame.heroScoreRange)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {!selectedGame.heroRole ? (
                      <p style={styles.roleWarning}>
                        캐릭터가 이 게임에 등록된 역할이 없어 매칭에 사용할 수 없습니다.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p style={styles.warningText}>큐에 참가하기 전에 사용할 게임을 선택해 주세요.</p>
                )}
                {gameCatalogLoading && !gameCatalogRefreshing ? (
                  <p style={styles.cardHint}>게임 목록을 불러오는 중입니다…</p>
                ) : null}
                <ul style={styles.gameList}>
                  {filteredGames.map((game) => {
                    const isSelected = selectedGameId === game.id
                    return (
                      <li key={game.id} style={styles.gameItem(isSelected)}>
                        <div style={styles.gameHeader}>
                          <div style={styles.gameHeaderMain}>
                            {game.imageUrl ? (
                              <img
                                src={game.imageUrl}
                                alt={`${game.name} 이미지`}
                                style={styles.gameThumbnail}
                              />
                            ) : (
                              <div style={styles.gameThumbnailFallback}>
                                {(game.name || '게임')[0]}
                              </div>
                            )}
                            <div style={{ display: 'grid', gap: 6 }}>
                              <h3 style={styles.gameTitle}>{game.name}</h3>
                              <p style={styles.gameDescription}>{game.description || '설명 없음'}</p>
                              <div style={styles.gameHeroMeta}>
                                <span style={styles.heroRolePill}>내 역할 {game.heroRole || '미등록'}</span>
                                {Number.isFinite(game.heroSlotNo) ? (
                                  <span style={styles.heroScorePill}>슬롯 #{Number(game.heroSlotNo) + 1}</span>
                                ) : null}
                                {Number.isFinite(game.heroScore) ? (
                                  <span style={styles.heroScorePill}>점수 {game.heroScore}</span>
                                ) : null}
                                {Number.isFinite(game.heroRating) ? (
                                  <span style={styles.heroScorePill}>레이팅 {game.heroRating}</span>
                                ) : null}
                                {game.heroScoreRange ? (
                                  <span style={styles.heroScorePill}>
                                    허용 점수 {formatScoreRange(game.heroScoreRange)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            style={styles.gameActionButton(isSelected, gameCatalogLoading || gameCatalogRefreshing)}
                            onClick={() => setSelectedGameId(game.id)}
                            disabled={gameCatalogLoading || gameCatalogRefreshing}
                          >
                            {isSelected ? '선택됨' : '이 게임 선택'}
                          </button>
                        </div>
                        <div style={styles.tagRow}>
                          <span style={styles.tag}>{formatRealtimeModeLabel(game.realtimeMode)}</span>
                          <span style={styles.tag}>{formatDropInLabel(game.dropInEnabled)}</span>
                          {game.promptSet?.name ? (
                            <span style={styles.tag}>프롬프트 {game.promptSet.name}</span>
                          ) : null}
                          <span style={styles.tag}>슬롯 {game.slotCount ?? 0}개</span>
                          {Number.isFinite(game.playCount) ? (
                            <span style={styles.tag}>플레이 {game.playCount}</span>
                          ) : null}
                        </div>
                        {game.slots?.length ? (
                          <div style={styles.slotChipRow}>
                            {game.slots.slice(0, 6).map((slot, index) => (
                              <span
                                key={`${game.id}:slot:${slot.slotIndex ?? index}`}
                                style={styles.slotChip(slot.active)}
                              >
                                {slot.role || `슬롯 ${slot.slotIndex != null ? slot.slotIndex + 1 : index + 1}`}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {game.participants?.length ? (
                          <div style={styles.participantList}>
                            {game.participants.slice(0, 3).map((participant, index) => (
                              <div
                                key={`${game.id}:participant:${participant.ownerId || index}`}
                                style={styles.participantItem}
                              >
                                <strong>{participant.ownerId ? shortId(participant.ownerId) : '미등록'}</strong>
                                <span>{participant.role || '역할 미정'}</span>
                                {participant.rating != null ? <span>레이팅 {participant.rating}</span> : null}
                                <span>업데이트 {formatRelativeTime(participant.updatedAt)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {game.promptSlots?.length ? (
                          <div style={styles.promptSlotRow}>
                            {game.promptSlots.slice(0, 6).map((slot, index) => (
                              <span key={`${game.id}:prompt:${slot.slotNo ?? index}`}>
                                #{slot.slotNo ?? index + 1} {slot.slotType}
                                {slot.isStart ? ' · 시작' : ''}
                                {slot.invisible ? ' · 비공개' : ''}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {!game.heroRole ? (
                          <p style={styles.roleWarning}>캐릭터가 이 게임에 등록된 역할이 없어 매칭에 사용할 수 없습니다.</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                {filteredGames.length === 0 && !(gameCatalogLoading || gameCatalogRefreshing) ? (
                  <p style={styles.empty}>
                    {heroId
                      ? '참여 중인 게임이 없거나 선택 조건과 일치하는 게임이 없습니다.'
                      : '캐릭터 정보를 불러오는 중입니다.'}
                  </p>
                ) : null}
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>AI 모델 API 키</h2>
                  <p style={styles.cardHint}>
                    Supabase가 암호화해 보관하는 OpenAI · Gemini 키를 등록하고 사용할 키를 선택하세요.
                  </p>
                </header>
                <div style={styles.formGrid}>
                  <div style={styles.formRow}>
                    <label htmlFor="rankApiKey" style={styles.label}>
                      새 API 키
                    </label>
                    <input
                      id="rankApiKey"
                      value={newApiKey}
                      onChange={(event) => setNewApiKey(event.target.value)}
                      style={styles.input}
                      placeholder="sk-…, AIza…, gk-…"
                    />
                  </div>
                  <div style={styles.toggleRow}>
                    <input
                      id="activateOnSave"
                      type="checkbox"
                      checked={activateOnSave}
                      onChange={(event) => setActivateOnSave(event.target.checked)}
                    />
                    <label htmlFor="activateOnSave">저장 후 바로 사용으로 전환</label>
                  </div>
                  <div style={styles.formActions}>
                    <button
                      type="button"
                      style={styles.primaryButton(keyringSubmitting)}
                      onClick={handleAddApiKey}
                      disabled={keyringSubmitting || !newApiKey.trim()}
                    >
                      {keyringSubmitting ? '저장 중…' : 'API 키 저장'}
                    </button>
                    <span style={styles.subtleText}>
                      등록 {keyringEntries.length}/{keyringLimit} · 사용 중 {activeKeyCount}
                    </span>
                  </div>
                </div>
                {keyringError ? (
                  <p style={styles.errorText}>{keyringError.message || 'API 키 작업 중 오류가 발생했습니다.'}</p>
                ) : null}
                {keyringMessage ? <p style={styles.infoText}>{keyringMessage}</p> : null}
                {keyringLoading ? <p style={styles.cardHint}>키 목록을 불러오는 중…</p> : null}
                <ul style={styles.keyList}>
                  {keyringEntries.map((entry, index) => {
                    const isActive = entry.isActive
                    const isActivating = keyMutation.type === 'activate' && keyMutation.id === entry.id
                    const isDeactivating = keyMutation.type === 'deactivate' && keyMutation.id === entry.id
                    const isDeleting = keyMutation.type === 'delete' && keyMutation.id === entry.id
                    const storageKey = entry.id || `${entry.keySample || 'entry'}:${index}`
                    return (
                      <li key={storageKey} style={styles.keyItem}>
                        <div style={styles.keyHeader}>
                          <div>
                            <p style={styles.keyTitle}>{entry.keySample || '샘플 없음'}</p>
                            <p style={styles.keyMeta}>
                              <span>{formatProviderLabel(entry.provider)}</span>
                              {entry.modelLabel ? <span>{entry.modelLabel}</span> : null}
                              {entry.apiVersion ? <span>v{entry.apiVersion}</span> : null}
                              {entry.geminiMode ? <span>{entry.geminiMode}</span> : null}
                              {entry.updatedAt ? (
                                <span>업데이트 {formatRelativeTime(entry.updatedAt)}</span>
                              ) : null}
                            </p>
                          </div>
                          {isActive ? <span style={styles.statusBadge('ready')}>사용 중</span> : null}
                        </div>
                        <div style={styles.keyActions}>
                          <button
                            type="button"
                            style={styles.keyActionButton('primary', isActivating)}
                            onClick={() => handleActivateKey(entry)}
                            disabled={isActivating || isActive}
                          >
                            {isActivating ? '전환 중…' : '사용'}
                          </button>
                          <button
                            type="button"
                            style={styles.keyActionButton('neutral', isDeactivating)}
                            onClick={() => handleDeactivateKey(entry)}
                            disabled={isDeactivating || !isActive}
                          >
                            {isDeactivating ? '해제 중…' : '사용 해제'}
                          </button>
                          <button
                            type="button"
                            style={styles.keyActionButton('danger', isDeleting)}
                            onClick={() => handleDeleteKey(entry)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? '삭제 중…' : '삭제'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {keyringEntries.length === 0 && !keyringLoading ? (
                  <p style={styles.empty}>등록된 API 키가 없습니다.</p>
                ) : null}
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>큐 합류</h2>
                  <p style={styles.cardHint}>
                    Open Match Frontend가 하던 일을 Postgres RPC (`join_rank_queue`)로 짧게 마무리합니다.
                  </p>
                </header>
                {selectedGame ? (
                  <div style={styles.selectionSummary}>
                    <div style={styles.selectionSummaryContainer}>
                      {selectedGame.imageUrl ? (
                        <img
                          src={selectedGame.imageUrl}
                          alt={`${selectedGame.name} 이미지`}
                          style={styles.selectionSummaryImage}
                        />
                      ) : (
                        <div style={styles.selectionSummaryImageFallback}>
                          {(selectedGame.name || '게임')[0]}
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: 6 }}>
                        <h3 style={styles.selectionSummaryTitle}>{selectedGame.name}</h3>
                        <p style={styles.selectionSummaryMeta}>
                          <span>{formatRealtimeModeLabel(selectedGame.realtimeMode)}</span>
                          <span>{formatDropInLabel(selectedGame.dropInEnabled)}</span>
                          {selectedGame.promptSet?.name ? (
                            <span>프롬프트 {selectedGame.promptSet.name}</span>
                          ) : null}
                          <span>슬롯 {selectedGame.slotCount ?? 0}개</span>
                        </p>
                        <p style={styles.selectionSummaryHeroMeta}>
                          <span style={styles.heroRolePill}>
                            내 역할 {selectedGame.heroRole || '미등록'}
                          </span>
                          {Number.isFinite(selectedGame.heroSlotNo) ? (
                            <span style={styles.heroScorePill}>
                              슬롯 #{Number(selectedGame.heroSlotNo) + 1}
                            </span>
                          ) : null}
                          {Number.isFinite(selectedGame.heroScore) ? (
                            <span style={styles.heroScorePill}>점수 {selectedGame.heroScore}</span>
                          ) : null}
                          {Number.isFinite(selectedGame.heroRating) ? (
                            <span style={styles.heroScorePill}>레이팅 {selectedGame.heroRating}</span>
                          ) : null}
                          {selectedGame.heroScoreRange ? (
                            <span style={styles.heroScorePill}>
                              허용 점수 {formatScoreRange(selectedGame.heroScoreRange)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {!selectedGame.heroRole ? (
                      <p style={styles.roleWarning}>
                        캐릭터가 이 게임에서 맡을 수 있는 역할이 없어 큐 참가가 제한됩니다.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p style={styles.warningText}>큐에 합류하려면 상단에서 게임을 선택해 주세요.</p>
                )}
                {!hasActiveKey ? (
                  <p style={styles.warningText}>AI API 키를 사용으로 전환해야 큐에 참가할 수 있습니다.</p>
                ) : null}
                <div style={styles.formGrid}>
                  <div style={styles.formRow}>
                    <label htmlFor="queueId" style={styles.label}>
                      큐 ID
                    </label>
                    <input
                      id="queueId"
                      value={queueId}
                      onChange={(event) => setQueueId(event.target.value)}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formRow}>
                    <label htmlFor="queueMode" style={styles.label}>
                      매치 모드
                    </label>
                    <select
                      id="queueMode"
                      value={joinForm.mode}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, mode: event.target.value }))}
                      style={styles.select}
                    >
                      {MATCH_MODE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formRow}>
                    <span style={styles.label}>내 역할</span>
                    <div style={styles.roleDisplay}>
                      {selectedGame?.heroRole ? (
                        <>
                          <span style={styles.heroRolePill}>역할 {selectedGame.heroRole}</span>
                          {Number.isFinite(selectedGame?.heroSlotNo) ? (
                            <span style={styles.heroScorePill}>
                              슬롯 #{Number(selectedGame.heroSlotNo) + 1}
                            </span>
                          ) : null}
                          {Number.isFinite(selectedGame?.heroScore) ? (
                            <span style={styles.heroScorePill}>점수 {selectedGame.heroScore}</span>
                          ) : null}
                          {Number.isFinite(selectedGame?.heroRating) ? (
                            <span style={styles.heroScorePill}>레이팅 {selectedGame.heroRating}</span>
                          ) : null}
                          {selectedGame?.heroScoreRange ? (
                            <span style={styles.heroScorePill}>
                              허용 점수 {formatScoreRange(selectedGame.heroScoreRange)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span style={styles.roleDisplayEmpty}>
                          역할이 없어 큐에 참가할 수 없습니다.
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={styles.formRow}>
                    <label htmlFor="queueRoom" style={styles.label}>
                      연결할 방 (선택)
                    </label>
                    <select
                      id="queueRoom"
                      value={joinForm.roomId}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, roomId: event.target.value }))}
                      style={styles.select}
                    >
                      <option value="">자동 지정</option>
                      {roomPreview.map((room) => (
                        <option key={room.id || room.code} value={room.id || ''}>
                          {room.code ? `${room.code} · ${translateMode(room.mode)}` : shortId(room.id)}
                        </option>
                      ))}
                    </select>
                    {selectedGame?.heroRole && accessibleRooms.length === 0 ? (
                      <p style={styles.cardHint}>역할·점수 조건에 맞는 방이 없습니다.</p>
                    ) : null}
                  </div>
                  <div style={styles.formRow}>
                    <label htmlFor="queueNote" style={styles.label}>
                      추가 메모
                    </label>
                    <textarea
                      id="queueNote"
                      value={joinForm.note}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, note: event.target.value }))}
                      style={styles.textarea}
                      placeholder="희망 포지션, 파티 키 등 Open Match 속성으로 남겨보세요."
                    />
                  </div>
                  <div style={styles.formActions}>
                    <button
                      type="button"
                      style={styles.primaryButton(joinBusy || !canJoinQueue)}
                      onClick={handleJoinQueue}
                      disabled={joinBusy || !canJoinQueue}
                    >
                      {joinBusy ? '큐 참가 중…' : '큐 참가'}
                    </button>
                    <button
                      type="button"
                      style={styles.dangerButton(leaveBusy)}
                      onClick={handleLeaveQueue}
                      disabled={leaveBusy}
                    >
                      {leaveBusy ? '정리 중…' : '큐 티켓 삭제'}
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton(stageBusy || !ticket?.id)}
                      onClick={handleStageMatch}
                      disabled={stageBusy || !ticket?.id}
                    >
                      {stageBusy ? '스테이징…' : '준비 상태 확인'}
                    </button>
                    {ticket?.id ? (
                      <span style={{ fontSize: 13, color: '#cbd5f5' }}>
                        현재 티켓 {shortId(ticket.id)} · {translateStatus(ticket.status)} · {buildSeatSummary(ticket)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>
                        큐 티켓이 생성되면 여기에서 상태를 볼 수 있습니다.
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {stageInfo ? (
                <section style={styles.card}>
                  <header style={styles.cardHeader}>
                    <h2 style={styles.cardTitle}>스테이징 정보</h2>
                    <p style={styles.cardHint}>
                      Open Match MMF가 제안한 좌석을 `stage_rank_match` RPC로 복원합니다.
                    </p>
                  </header>
                  <div style={styles.badgeRow}>
                    <span style={styles.badge}>
                      세션 {stageInfo.sessionId ? shortId(stageInfo.sessionId) : '생성중'}
                    </span>
                    <span style={styles.badge}>
                      레디 마감 {stageInfo.readyExpiresAt ? formatRelativeTime(stageInfo.readyExpiresAt) : '—'}
                    </span>
                    {stageInfo.sessionId ? (
                      <Link
                        href={`/arena/staging?sessionId=${stageInfo.sessionId}`}
                        style={styles.linkButton}
                      >
                        스테이징 화면 열기
                      </Link>
                    ) : null}
                  </div>
                  <ul style={styles.stageSeats}>
                    {stageInfo.seats?.length ? (
                      stageInfo.seats.map((seat) => (
                        <li key={seat.index ?? Math.random()} style={styles.stageSeatItem}>
                          <span>
                            슬롯 {seat.index != null ? seat.index + 1 : '?'} · {seat.role || '역할 미정'} ·{' '}
                            {seat.ownerId ? shortId(seat.ownerId) : '빈자리'}
                          </span>
                          <span style={styles.seatReady(seat.ready)}>
                            {seat.ready ? 'READY' : 'WAITING'}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li style={{ color: '#94a3b8', fontSize: 13 }}>좌석 데이터가 아직 없습니다.</li>
                    )}
                  </ul>
                </section>
              ) : null}
            </div>

            <div style={styles.cardsColumn}>
              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>큐 티켓 스트림</h2>
                  <p style={styles.cardHint}>
                    `rank_queue_tickets` 테이블을 직접 구독해 대기열 변화를 실시간으로 확인합니다.
                  </p>
                </header>
                {queuePreview.length ? (
                  <ul style={styles.list}>
                    {queuePreview.map((entry) => (
                      <li key={entry.id} style={styles.listItem}>
                        <div style={styles.listRow}>
                          <h3 style={styles.listTitle}>티켓 {shortId(entry.id)}</h3>
                          <span style={styles.statusBadge(entry.status)}>{translateStatus(entry.status)}</span>
                        </div>
                        <p style={styles.listMeta}>
                          <span>모드 {translateMode(entry.mode)}</span>
                          {entry.roomId ? <span>방 {shortId(entry.roomId)}</span> : null}
                          <span>좌석 {entry.occupiedSlots}/{entry.totalSlots ?? '—'}</span>
                          <span>업데이트 {formatRelativeTime(entry.updatedAt)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={styles.empty}>표시할 큐 티켓이 없습니다.</p>
                )}
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>진행 중인 세션</h2>
                  <p style={styles.cardHint}>
                    Open Match Backend 참고: `rank_sessions`의 활성을 감시해 난입·관전을 준비합니다.
                  </p>
                </header>
                {sessionPreview.length ? (
                  <ul style={styles.list}>
                    {sessionPreview.map((session) => (
                      <li key={session.id} style={styles.listItem}>
                        <div style={styles.listRow}>
                          <h3 style={styles.listTitle}>세션 {shortId(session.id)}</h3>
                          <span style={styles.statusBadge(session.status)}>{translateStatus(session.status)}</span>
                        </div>
                        <p style={styles.listMeta}>
                          <span>모드 {translateMode(session.mode)}</span>
                          <span>턴 {session.turn}</span>
                          <span>갱신 {formatRelativeTime(session.updatedAt)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={styles.empty}>활성 세션이 없습니다.</p>
                )}
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>방 현황</h2>
                  <p style={styles.cardHint}>
                    기존 방 브라우저 대신 Open Match 룸 컨셉에 맞춘 요약 정보를 제공합니다.
                  </p>
                </header>
                {roomPreview.length ? (
                  <ul style={styles.list}>
                    {roomPreview.map((room) => (
                      <li key={room.id} style={styles.listItem}>
                        <div style={styles.listRow}>
                          <h3 style={styles.listTitle}>{room.code || `방 ${shortId(room.id)}`}</h3>
                          <span style={styles.statusBadge(room.status)}>{translateStatus(room.status)}</span>
                        </div>
                        <p style={styles.listMeta}>
                          <span>모드 {translateMode(room.mode)}</span>
                          <span>
                            좌석 {room.readyCount ?? 0}/{room.slotCount ?? '—'} 준비 · {room.filledCount ?? 0} 착석
                          </span>
                          <span>갱신 {formatRelativeTime(room.updatedAt)}</span>
                        </p>
                        {room.id ? (
                          <div style={styles.badgeRow}>
                            <Link href={`/rooms/${room.id}`} style={styles.linkButton}>
                              방 상세 보기
                            </Link>
                            <span style={styles.badge}>호스트 활동 {formatRelativeTime(room.hostLastActiveAt)}</span>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={styles.empty}>활성 방이 없습니다.</p>
                )}
              </section>

              <section style={styles.card}>
                <header style={styles.cardHeader}>
                  <h2 style={styles.cardTitle}>Realtime 이벤트 로그</h2>
                  <p style={styles.cardHint}>
                    Tinode의 activity feed처럼 큐/방/세션 변화를 한눈에 파악합니다.
                  </p>
                </header>
                {eventLog.length ? (
                  <ul style={styles.timeline}>
                    {eventLog.map((entry) => (
                      <li key={entry.id} style={styles.timelineItem}>
                        <h4 style={styles.timelineTitle}>{entry.summary}</h4>
                        <p style={styles.timelineMeta}>
                          {entry.table} · {entry.eventType} · {formatRelativeTime(entry.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={styles.empty}>아직 수신된 이벤트가 없습니다.</p>
                )}
              </section>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
