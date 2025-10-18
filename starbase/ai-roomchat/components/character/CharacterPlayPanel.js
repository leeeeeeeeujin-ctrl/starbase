'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ensureRpc } from '@/modules/arena/rpcClient'
import { normalizeRealtimeMode, isRealtimeEnabled } from '@/lib/rank/realtimeModes'
import { formatPlayNumber } from '@/utils/characterPlayFormatting'

const panelStyles = {
  root: {
    display: 'grid',
    gap: 20,
    width: '100%',
  },
  section: {
    display: 'grid',
    gap: 12,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  sliderTrack: {
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    padding: '6px 2px 6px 0',
    scrollbarWidth: 'thin',
  },
  sliderCard: {
    position: 'relative',
    width: 180,
    minHeight: 108,
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.7)',
    color: '#f8fafc',
    padding: 14,
    display: 'grid',
    gap: 6,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  sliderCardActive: {
    transform: 'translateY(-6px)',
    borderColor: 'rgba(56,189,248,0.7)',
    boxShadow: '0 20px 44px -24px rgba(56,189,248,0.7)',
  },
  sliderBackground: (imageUrl) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: 18,
    backgroundImage: imageUrl
      ? `linear-gradient(180deg, rgba(2,6,23,0.2) 0%, rgba(2,6,23,0.85) 95%), url(${imageUrl})`
      : 'linear-gradient(180deg, rgba(2,6,23,0.4) 0%, rgba(2,6,23,0.85) 95%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: imageUrl ? 'saturate(1.15)' : 'none',
  }),
  sliderContent: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 4,
  },
  sliderGameName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  sliderMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  buttonPrimary: {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 20,
    border: 'none',
    background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
    color: '#020617',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 26px 60px -36px rgba(56,189,248,0.75)',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 14,
  },
  statCard: {
    borderRadius: 18,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(15,23,42,0.68)',
    padding: 16,
    display: 'grid',
    gap: 6,
  },
  statLabel: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  statValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  statMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  logList: {
    display: 'grid',
    gap: 12,
  },
  logCard: {
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.28)',
    background: 'rgba(2,6,23,0.78)',
    padding: 14,
    display: 'grid',
    gap: 8,
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
  },
  logDate: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  logResult: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  logMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  logText: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  emptyState: {
    padding: '18px 14px',
    borderRadius: 16,
    border: '1px dashed rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
    fontSize: 13,
    color: '#cbd5f5',
  },
  mutedButton: {
    justifySelf: 'center',
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  descriptionBlock: {
    borderRadius: 20,
    border: '1px solid rgba(148,163,184,0.32)',
    background: 'rgba(15,23,42,0.62)',
    padding: 18,
    display: 'grid',
    gap: 8,
  },
  descriptionHeading: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  descriptionText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
}

const overlayStyles = {
  root: {
    position: 'fixed',
    top: 16,
    left: 16,
    width: 280,
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: 20,
    border: '1px solid rgba(56,189,248,0.55)',
    background: 'linear-gradient(180deg, rgba(8,47,73,0.92) 0%, rgba(2,6,23,0.94) 100%)',
    color: '#e0f2fe',
    padding: 16,
    display: 'grid',
    gap: 10,
    zIndex: 2200,
    boxShadow: '0 28px 72px -40px rgba(56,189,248,0.8)',
  },
  header: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
  },
  subheader: {
    margin: 0,
    fontSize: 12,
    color: '#bae6fd',
    lineHeight: 1.6,
  },
  message: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#bae6fd',
    lineHeight: 1.6,
  },
  meta: {
    margin: '2px 0 0',
    fontSize: 11,
    color: 'rgba(148,163,184,0.85)',
  },
  error: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#fca5a5',
    lineHeight: 1.6,
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
  },
  progressFill: (value) => ({
    width: `${Math.min(100, Math.max(0, value))}%`,
    height: '100%',
    background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 100%)',
  }),
  actionRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  primary: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 14,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.78)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
}

function MatchingOverlay({
  open,
  heroName,
  gameName,
  progress,
  phase,
  message,
  errorMessage,
  sessionId,
  readyExpiresAt,
  onCancel,
  onProceed,
}) {
  if (!open) return null

  const status = phase || 'queue'
  const ready = status === 'ready'
  const failed = status === 'error'
  const inFlight = status === 'queue' || status === 'awaiting-room' || status === 'staging'

  const headline = (() => {
    if (ready) return '매칭이 준비됐어요'
    if (failed) return '매칭을 준비하지 못했습니다'
    if (status === 'awaiting-room') return '방을 준비하는 중'
    if (status === 'staging') return '매칭 구성 중'
    return '대기열에 참가하는 중'
  })()

  const subline = (() => {
    if (failed) {
      return `${heroName}의 매칭을 완료하지 못했습니다.`
    }
    if (ready) {
      return message || `${heroName}이(가) ${gameName} 전투를 시작할 준비가 끝났습니다.`
    }
    if (status === 'staging') {
      return message || `${gameName} 방을 준비하고 있어요.`
    }
    if (status === 'awaiting-room') {
      return message || `${gameName} 방을 확보하고 있어요. 잠시만 기다려 주세요.`
    }
    return message || `${heroName}이(가) ${gameName} 참가자를 찾는 중입니다.`
  })()

  const sessionMeta = []
  if (ready && readyExpiresAt) {
    try {
      const date = new Date(readyExpiresAt)
      if (!Number.isNaN(date.getTime())) {
        sessionMeta.push(`준비 만료: ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`)
      }
    } catch (error) {
      // ignore malformed date
    }
  }
  if (ready && sessionId) {
    sessionMeta.push(`세션 ID: ${sessionId}`)
  }

  const showProgress = inFlight || ready
  const showCancel = inFlight
  const primaryLabel = ready ? '확인' : failed ? '닫기' : '진행 중'
  const primaryEnabled = ready || failed

  return (
    <aside style={overlayStyles.root}>
      <div>
        <p style={overlayStyles.header}>{headline}</p>
        <p style={overlayStyles.subheader}>{subline}</p>
        {ready && sessionMeta.length
          ? sessionMeta.map((entry) => (
              <p key={entry} style={overlayStyles.meta}>
                {entry}
              </p>
            ))
          : null}
        {failed && errorMessage ? <p style={overlayStyles.error}>{errorMessage}</p> : null}
      </div>
      {showProgress ? (
        <div style={overlayStyles.progressBar}>
          <div style={overlayStyles.progressFill(ready ? 100 : progress)} />
        </div>
      ) : null}
      <div
        style={{
          ...overlayStyles.actionRow,
          justifyContent: showCancel ? 'space-between' : 'flex-end',
        }}
      >
        {showCancel ? (
          <button type="button" style={overlayStyles.secondary} onClick={onCancel}>
            취소
          </button>
        ) : null}
        <button
          type="button"
          style={{
            ...overlayStyles.primary,
            ...(showCancel ? {} : { flex: '0 0 100%' }),
            opacity: primaryEnabled ? 1 : 0.55,
            cursor: primaryEnabled ? 'pointer' : 'default',
          }}
          onClick={primaryEnabled ? onProceed : undefined}
          disabled={!primaryEnabled}
        >
          {primaryLabel}
        </button>
      </div>
    </aside>
  )
}

const QUEUE_ID = 'rank-default'
const QUEUE_POLL_INTERVAL_MS = 1500
const QUEUE_POLL_LIMIT = 40

function normalizeQueueTicket(row) {
  if (!row || typeof row !== 'object') return null
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload
      : row.payload_json && typeof row.payload_json === 'object'
      ? row.payload_json
      : null

  const seatMapRaw = row.seat_map ?? row.seatMap
  let seatMap = null
  if (Array.isArray(seatMapRaw)) {
    seatMap = seatMapRaw
  } else if (typeof seatMapRaw === 'string') {
    try {
      const parsed = JSON.parse(seatMapRaw)
      if (Array.isArray(parsed)) {
        seatMap = parsed
      }
    } catch (error) {
      seatMap = null
    }
  }

  return {
    id: row.id || row.ticket_id || null,
    queueId: row.queue_id || row.queueId || null,
    gameId: row.game_id || row.gameId || (payload?.game_id ?? null),
    roomId: row.room_id || row.roomId || null,
    ownerId: row.owner_id || row.ownerId || (payload?.owner_id ?? null),
    mode: row.mode || row.match_mode || null,
    status: row.status || row.queue_status || null,
    readyExpiresAt: row.ready_expires_at || row.readyExpiresAt || null,
    seatMap,
    payload,
  }
}

export default function CharacterPlayPanel({ hero, playData }) {

  const {
    selectedEntry = null,
    selectedGame = null,
    selectedGameId = null,
    battleDetails = [],
    battleSummary = null,
    visibleBattles = 0,
    battleLoading = false,
    battleError = '',
    showMoreBattles = () => {},
    refreshParticipations = () => {},
  } = playData || {}

  const [matchingState, setMatchingState] = useState({
    open: false,
    phase: 'idle',
    progress: 0,
    message: '',
    error: '',
    ticketId: null,
    ticketStatus: null,
    sessionId: null,
    readyExpiresAt: null,
  })
  const matchTaskRef = useRef(null)
  const queuePollRef = useRef(null)
  const queuePollAttemptsRef = useRef(0)
  const stagingInProgressRef = useRef(false)
  const latestTicketRef = useRef(null)

  const heroName = useMemo(() => {
    const raw = hero?.name
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return '이름 없는 영웅'
  }, [hero?.name])

  const currentRole = selectedEntry?.role ? selectedEntry.role : null

  const gameDescription = useMemo(() => {
    const raw = selectedGame?.description
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return '아직 등록된 설명이 없습니다.'
  }, [selectedGame?.description])

  useEffect(() => {
    if (!matchingState.open) return undefined
    if (!['queue', 'awaiting-room', 'staging'].includes(matchingState.phase)) return undefined

    let cancelled = false
    const timer = setInterval(() => {
      setMatchingState((prev) => {
        if (!prev.open || cancelled) return prev
        if (!['queue', 'awaiting-room', 'staging'].includes(prev.phase)) return prev
        const ceiling =
          prev.phase === 'staging' ? 96 : prev.phase === 'awaiting-room' ? 90 : 82
        const increment = prev.phase === 'staging' ? 6 : prev.phase === 'awaiting-room' ? 5 : 4
        const nextProgress = Math.min(ceiling, Math.max(0, prev.progress) + increment)
        if (nextProgress === prev.progress) return prev
        return { ...prev, progress: nextProgress }
      })
    }, 280)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [matchingState.open, matchingState.phase])

  useEffect(() => {
    if (!matchingState.open) return undefined
    if (!matchingState.ticketId) return undefined
    if (['ready', 'error'].includes(matchingState.phase)) return undefined

    let cancelled = false
    queuePollAttemptsRef.current = 0
    stagingInProgressRef.current = false

    const poll = async () => {
      if (cancelled) return
      queuePollAttemptsRef.current += 1

      let data
      try {
        data = await ensureRpc('fetch_rank_queue_ticket', {
          queue_ticket_id: matchingState.ticketId,
        })
      } catch (error) {
        if (cancelled) return
        const code = error?.code || error?.message || error?.details || ''
        const normalized = typeof code === 'string' ? code.toLowerCase() : ''
        if (normalized.includes('queue_ticket_not_found')) {
          setMatchingState({
            open: true,
            phase: 'error',
            progress: 0,
            message: '',
            error: '대기열 정보를 찾을 수 없습니다. 다시 시도해 주세요.',
            ticketId: null,
            ticketStatus: null,
            sessionId: null,
            readyExpiresAt: null,
          })
          if (queuePollRef.current) {
            clearInterval(queuePollRef.current)
            queuePollRef.current = null
          }
          cancelled = true
        }
        return
      }

      if (cancelled) return

      const ticket = normalizeQueueTicket(data)
      if (!ticket) return
      latestTicketRef.current = ticket

      setMatchingState((prev) => {
        let changed = false
        const nextStatus = ticket.status || prev.ticketStatus || null
        const nextState = { ...prev }
        if (nextStatus !== prev.ticketStatus) {
          nextState.ticketStatus = nextStatus
          changed = true
        }
        if (!ticket.roomId && nextStatus === 'staging' && prev.phase === 'queue') {
          nextState.phase = 'awaiting-room'
          if (!prev.message) {
            nextState.message = '방을 구성 중입니다…'
          }
          changed = true
        }
        if (!changed) return prev
        return nextState
      })

      if (ticket.roomId && ticket.id && !stagingInProgressRef.current) {
        stagingInProgressRef.current = true
        setMatchingState((prev) => ({
          ...prev,
          phase: 'staging',
          progress: Math.max(prev.progress, 62),
          message: '매칭을 준비하는 중…',
          ticketId: ticket.id,
        }))

        try {
          const stageResult = await ensureRpc('stage_rank_match', { queue_ticket_id: ticket.id })
          if (cancelled) return

          setMatchingState((prev) => ({
            ...prev,
            phase: 'ready',
            progress: 100,
            message: '매칭 준비가 완료되었습니다. 곧 전투가 시작됩니다.',
            error: '',
            sessionId: stageResult?.session_id || null,
            readyExpiresAt: stageResult?.ready_expires_at || null,
          }))

          if (typeof refreshParticipations === 'function') {
            try {
              await refreshParticipations()
            } catch (refreshError) {
              console.warn('[CharacterPlayPanel] 매칭 후 참가 정보를 새로고침하지 못했습니다:', refreshError)
            }
          }

          if (queuePollRef.current) {
            clearInterval(queuePollRef.current)
            queuePollRef.current = null
          }
          stagingInProgressRef.current = false
          cancelled = true
          return
        } catch (error) {
          stagingInProgressRef.current = false
          if (cancelled) return
          const detail = error?.message || error?.details || ''
          const normalized = typeof detail === 'string' ? detail.toLowerCase() : ''
          if (normalized.includes('missing_room_id')) {
            setMatchingState((prev) => ({
              ...prev,
              phase: 'awaiting-room',
              message: '방 정보를 기다리는 중입니다…',
              error: '',
            }))
            queuePollAttemptsRef.current = Math.max(queuePollAttemptsRef.current - 1, 0)
            return
          }

          const friendly =
            detail ||
            (typeof error === 'string'
              ? error
              : '매칭을 준비하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')

          setMatchingState({
            open: true,
            phase: 'error',
            progress: 0,
            message: '',
            error: friendly,
            ticketId: null,
            ticketStatus: null,
            sessionId: null,
            readyExpiresAt: null,
          })

          if (queuePollRef.current) {
            clearInterval(queuePollRef.current)
            queuePollRef.current = null
          }
          cancelled = true
          return
        }
      }

      if (!ticket.roomId && queuePollAttemptsRef.current >= QUEUE_POLL_LIMIT) {
        setMatchingState({
          open: true,
          phase: 'error',
          progress: 0,
          message: '',
          error: '매칭이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
          ticketId: null,
          ticketStatus: null,
          sessionId: null,
          readyExpiresAt: null,
        })

        if (queuePollRef.current) {
          clearInterval(queuePollRef.current)
          queuePollRef.current = null
        }
        cancelled = true
      }
    }

    const interval = setInterval(poll, QUEUE_POLL_INTERVAL_MS)
    queuePollRef.current = interval
    poll()

    return () => {
      cancelled = true
      if (queuePollRef.current) {
        clearInterval(queuePollRef.current)
        queuePollRef.current = null
      }
      stagingInProgressRef.current = false
    }
  }, [matchingState.open, matchingState.ticketId, matchingState.phase, refreshParticipations])

  const clearQueueWatch = useCallback(() => {
    if (queuePollRef.current) {
      clearInterval(queuePollRef.current)
      queuePollRef.current = null
    }
    queuePollAttemptsRef.current = 0
    stagingInProgressRef.current = false
  }, [])

  const resetMatchingState = useCallback(() => {
    clearQueueWatch()
    latestTicketRef.current = null
    setMatchingState({
      open: false,
      phase: 'idle',
      progress: 0,
      message: '',
      error: '',
      ticketId: null,
      ticketStatus: null,
      sessionId: null,
      readyExpiresAt: null,
    })
  }, [clearQueueWatch])

  const handleCancelMatching = useCallback(async () => {
    if (matchTaskRef.current) {
      matchTaskRef.current.cancelled = true
      matchTaskRef.current = null
    }

    const activeTicketId = matchingState.ticketId || latestTicketRef.current?.id || null
    if (activeTicketId) {
      try {
        await ensureRpc('cancel_rank_queue_ticket', { queue_ticket_id: activeTicketId })
      } catch (error) {
        console.warn('[CharacterPlayPanel] 매칭 취소 RPC 실패:', error)
      }
    }

    resetMatchingState()
  }, [matchingState.ticketId, resetMatchingState])

  useEffect(() => () => clearQueueWatch(), [clearQueueWatch])

  const handleProceedMatching = useCallback(() => {
    resetMatchingState()
  }, [resetMatchingState])

  const runAutoMatch = useCallback(async () => {
    if (!selectedGameId) {
      if (typeof window !== 'undefined') {
        window.alert('먼저 게임을 선택하세요.')
      }
      return
    }
    if (!hero?.id) {
      if (typeof window !== 'undefined') {
        window.alert('캐릭터 정보를 찾을 수 없습니다.')
      }
      return
    }
    const ownerId = hero?.owner_id || null
    const roleLabel =
      typeof selectedEntry?.role === 'string' && selectedEntry.role.trim()
        ? selectedEntry.role.trim()
        : 'flex'

    const realtimeMode = normalizeRealtimeMode(selectedGame?.realtime_match)
    const realtimeEnabled = isRealtimeEnabled(realtimeMode)
    const queueMessage = realtimeEnabled
      ? '실시간 매칭 대기열에 참가했습니다.'
      : '비실시간 매칭 준비를 시작했어요.'

    clearQueueWatch()
    setMatchingState({
      open: true,
      phase: 'queue',
      progress: 8,
      message: queueMessage,
      error: '',
      ticketId: null,
      ticketStatus: null,
      sessionId: null,
      readyExpiresAt: null,
    })

    try {
      const payload = {
        hero_id: hero.id,
        hero_name: heroName,
        owner_id: ownerId,
        game_id: selectedGameId,
        role: roleLabel,
        mode: 'rank',
        queue_mode: 'rank',
        queue_mode_detail: realtimeEnabled ? 'realtime' : 'async',
        ready_vote: {
          ready: true,
          hero_id: hero.id,
          owner_id: ownerId,
          role: roleLabel,
          realtime_mode: realtimeMode,
        },
        async_fill_meta: {
          preferred_role: roleLabel,
          requested_at: new Date().toISOString(),
          hero_id: hero.id,
          realtime_mode: realtimeMode,
        },
        match_preferences: {
          realtime_mode: realtimeMode,
          mode: realtimeEnabled ? 'realtime' : 'async',
        },
      }

      const properties = {}
      if (Number.isFinite(Number(selectedEntry?.sessionCount))) {
        properties.sessions_played = Number(selectedEntry.sessionCount)
      }
      if (selectedEntry?.primaryMode) {
        properties.favourite_mode = selectedEntry.primaryMode
      }
      if (Number.isFinite(Number(selectedEntry?.slot_no))) {
        properties.hero_slot_no = Number(selectedEntry.slot_no)
      }
      if (Number.isFinite(Number(selectedEntry?.score))) {
        properties.hero_score = Number(selectedEntry.score)
      }
      if (Number.isFinite(Number(selectedEntry?.rating))) {
        properties.hero_rating = Number(selectedEntry.rating)
      }
      if (Number.isFinite(Number(selectedEntry?.win_rate))) {
        properties.hero_win_rate = Number(selectedEntry.win_rate)
      }
      if (selectedGame?.realtime_match != null) {
        properties.selected_game_realtime_mode = realtimeMode
      }
      if (Object.keys(properties).length) {
        payload.properties = properties
      }

      const ticket = await ensureRpc('join_rank_queue', { queue_id: QUEUE_ID, payload })
      const normalizedTicket = normalizeQueueTicket(ticket)
      if (!normalizedTicket?.id) {
        throw new Error('큐 티켓을 확보하지 못했습니다.')
      }

      latestTicketRef.current = normalizedTicket
      setMatchingState((prev) => ({
        ...prev,
        phase:
          normalizedTicket.status === 'staging' && !normalizedTicket.roomId
            ? 'awaiting-room'
            : 'queue',
        progress: Math.max(prev.progress, normalizedTicket.roomId ? 55 : 18),
        message: prev.message || queueMessage,
        ticketId: normalizedTicket.id,
        ticketStatus: normalizedTicket.status || null,
      }))
    } catch (error) {
      const friendlyError =
        error?.message || error?.details || (typeof error === 'string' ? error : '매칭 중 오류가 발생했습니다.')
      setMatchingState({
        open: true,
        phase: 'error',
        progress: 0,
        message: '',
        error: friendlyError,
        ticketId: null,
        ticketStatus: null,
        sessionId: null,
        readyExpiresAt: null,
      })
    } finally {
      matchTaskRef.current = null
    }
  }, [
    clearQueueWatch,
    hero?.id,
    hero?.owner_id,
    heroName,
    selectedEntry,
    selectedGame?.realtime_match,
    selectedGameId,
  ])

  const visibleBattleRows = useMemo(
    () => battleDetails.slice(0, visibleBattles || battleDetails.length),
    [battleDetails, visibleBattles],
  )

  const isMatchingBusy =
    matchingState.open && ['queue', 'awaiting-room', 'staging'].includes(matchingState.phase)

  const startButton = (
    <section style={panelStyles.section}>
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>선택한 게임</h3>
        {currentRole ? <p style={panelStyles.subtitle}>{currentRole}</p> : null}
      </div>
      <p style={panelStyles.subtitle}>{selectedGame ? selectedGame.name : '게임을 선택해주세요.'}</p>
      <button
        type="button"
        style={{
          ...panelStyles.buttonPrimary,
          ...(!selectedGameId || isMatchingBusy ? panelStyles.buttonDisabled : {}),
        }}
        onClick={!selectedGameId || isMatchingBusy ? undefined : runAutoMatch}
        disabled={!selectedGameId || isMatchingBusy}
      >
        게임 시작
      </button>
    </section>
  )

  const descriptionSection = (
    <section>
      <div style={panelStyles.descriptionBlock}>
        <h3 style={panelStyles.descriptionHeading}>게임 설명</h3>
        <p style={panelStyles.descriptionText}>{gameDescription}</p>
      </div>
    </section>
  )

  const battleSection = (
    <section style={panelStyles.section}>
      <div style={panelStyles.headerRow}>
        <h3 style={panelStyles.title}>베틀 로그</h3>
        <p style={panelStyles.subtitle}>
          {battleSummary?.total ? `${battleSummary.total}회 기록됨` : '최근 전투 기록'}
        </p>
      </div>
      {battleLoading ? (
        <div style={panelStyles.emptyState}>전투 기록을 불러오는 중입니다…</div>
      ) : battleError ? (
        <div style={panelStyles.section}>
          <div style={panelStyles.emptyState}>{battleError}</div>
        </div>
      ) : visibleBattleRows.length ? (
        <div style={panelStyles.logList}>
          {visibleBattleRows.map((battle) => (
            <article key={battle.id} style={panelStyles.logCard}>
              <div style={panelStyles.logHeader}>
                <p style={panelStyles.logDate}>
                  {battle.created_at ? new Date(battle.created_at).toLocaleString('ko-KR') : '시간 정보 없음'}
                </p>
                <p style={panelStyles.logResult}>{battle.result ? battle.result.toUpperCase() : 'PENDING'}</p>
              </div>
              <p style={panelStyles.logMeta}>
                점수 변화: {battle.score_delta != null ? formatPlayNumber(battle.score_delta) : '—'}
              </p>
              {battle.logs?.length ? (
                <div>
                  {battle.logs.map((log) => (
                    <p key={`${battle.id}-${log.turn_no}`} style={panelStyles.logText}>
                      {log.prompt ? `${log.turn_no ?? 0}턴 - ${log.prompt}` : '로그 없음'}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {visibleBattles && visibleBattles < battleDetails.length ? (
            <button type="button" style={panelStyles.mutedButton} onClick={showMoreBattles}>
              더 보기
            </button>
          ) : null}
        </div>
      ) : (
        <div style={panelStyles.emptyState}>아직 기록된 베틀 로그가 없습니다.</div>
      )}
    </section>
  )

  return (
    <div style={panelStyles.root}>
      {startButton}
      {descriptionSection}
      {battleSection}
      <MatchingOverlay
        open={matchingState.open}
        heroName={heroName}
        gameName={selectedGame?.name || '선택한 게임'}
        progress={matchingState.progress}
        phase={matchingState.phase}
        message={matchingState.message}
        errorMessage={matchingState.error}
        sessionId={matchingState.sessionId}
        readyExpiresAt={matchingState.readyExpiresAt}
        onCancel={handleCancelMatching}
        onProceed={handleProceedMatching}
      />
    </div>
  )
}
