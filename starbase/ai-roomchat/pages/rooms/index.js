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

const QUEUE_ROLE_OPTIONS = [
  { key: 'flex', label: '플렉스' },
  { key: 'damage', label: '딜러' },
  { key: 'support', label: '서포터' },
  { key: 'tank', label: '탱커' },
]

const MATCH_MODE_OPTIONS = [
  { key: 'rank', label: '랭크' },
  { key: 'casual', label: '캐주얼' },
  { key: 'event', label: '이벤트' },
]

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
    code: row.code || null,
    status: (row.status || '').toLowerCase() || 'open',
    mode: row.mode || null,
    realtimeMode: row.realtime_mode || null,
    slotCount: Number.isFinite(row.slot_count) ? Number(row.slot_count) : null,
    readyCount: Number.isFinite(row.ready_count) ? Number(row.ready_count) : null,
    filledCount: Number.isFinite(row.filled_count) ? Number(row.filled_count) : null,
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

function buildQueuePayload(hero, joinForm, heroStats) {
  const payload = {
    hero_id: hero?.hero_id || null,
    hero_name: hero?.name || null,
    owner_id: hero?.owner_id || hero?.user_id || null,
    role: joinForm.role || 'flex',
    mode: joinForm.mode || 'rank',
    queue_mode: joinForm.mode || 'rank',
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
    preferred_role: joinForm.role || 'flex',
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
  if (Object.keys(properties).length) {
    payload.properties = properties
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

  const [joinForm, setJoinForm] = useState({ mode: 'rank', role: 'flex', roomId: '', note: '' })
  const [ticket, setTicket] = useState(null)
  const [stageInfo, setStageInfo] = useState(null)

  const [joinBusy, setJoinBusy] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [stageBusy, setStageBusy] = useState(false)
  const [queueError, setQueueError] = useState(null)

  const [eventLog, setEventLog] = useState([])

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

  const heroStats = useMemo(() => computeHeroStats(participations), [participations])

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
    setQueueError(null)
    setJoinBusy(true)
    try {
      const payload = buildQueuePayload(viewerHero, joinForm, heroStats)
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
  }, [queueId, viewerHero, joinForm, heroStats, fetchSnapshot])

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
    return games
  }, [heroStats.games])

  const queuePreview = useMemo(() => snapshot.queue.slice(0, 6), [snapshot.queue])
  const sessionPreview = useMemo(() => snapshot.sessions.slice(0, 5), [snapshot.sessions])
  const roomPreview = useMemo(() => snapshot.rooms.slice(0, 5), [snapshot.rooms])
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
                  <h2 style={styles.cardTitle}>큐 합류</h2>
                  <p style={styles.cardHint}>
                    Open Match Frontend가 하던 일을 Postgres RPC (`join_rank_queue`)로 짧게 마무리합니다.
                  </p>
                </header>
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
                    <label htmlFor="queueRole" style={styles.label}>
                      선호 역할
                    </label>
                    <select
                      id="queueRole"
                      value={joinForm.role}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, role: event.target.value }))}
                      style={styles.select}
                    >
                      {QUEUE_ROLE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                      style={styles.primaryButton(joinBusy)}
                      onClick={handleJoinQueue}
                      disabled={joinBusy}
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
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>큐 티켓이 생성되면 여기에서 상태를 볼 수 있습니다.</span>
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
