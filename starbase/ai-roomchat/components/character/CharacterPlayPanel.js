'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/router'

import { supabase } from '@/lib/supabase'
import { ensureRpc } from '@/modules/arena/rpcClient'
import { createQueueRealtimeWatcher } from '@/modules/arena/matchQueueFlow'
import {
  hydrateGameMatchData,
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchSessionHistory,
  setGameMatchSessionMeta,
  setGameMatchSlotTemplate,
  setGameMatchSnapshot,
} from '@/modules/rank/matchDataStore'
import { loadMatchFlowSnapshot } from '@/modules/rank/matchRealtimeSync'
import { readActiveSession, subscribeActiveSession } from '@/lib/rank/activeSessionStorage'
import { normalizeRealtimeMode, isRealtimeEnabled } from '@/lib/rank/realtimeModes'
import { formatPlayNumber } from '@/utils/characterPlayFormatting'

const ASYNC_MATCH_ENDPOINT = '/api/rank/match'

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
  lockedNotice: {
    marginTop: 12,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.72)',
    display: 'grid',
    gap: 8,
  },
  lockedText: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#f8fafc',
  },
  lockedGame: {
    margin: 0,
    fontSize: 12,
    color: 'rgba(148,163,184,0.9)',
  },
  lockedActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  lockedButton: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.85)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
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
    top: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(860px, calc(100vw - 32px))',
    borderRadius: 18,
    border: '1px solid rgba(56,189,248,0.55)',
    background: 'linear-gradient(180deg, rgba(8,47,73,0.94) 0%, rgba(2,6,23,0.96) 100%)',
    color: '#e0f2fe',
    padding: '14px 18px 16px',
    display: 'grid',
    gap: 12,
    zIndex: 4200,
    boxShadow: '0 36px 88px -44px rgba(56,189,248,0.85)',
    pointerEvents: 'auto',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  headingBlock: {
    display: 'grid',
    gap: 6,
    minWidth: 0,
    flex: '1 1 auto',
  },
  header: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.35,
  },
  subheader: {
    margin: 0,
    fontSize: 13,
    color: '#bae6fd',
    lineHeight: 1.6,
  },
  statusList: {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    margin: '4px 0 0',
  },
  statusItem: {
    fontSize: 12,
    color: 'rgba(186,230,253,0.9)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  toolButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(56,189,248,0.6)',
    background: 'rgba(8,47,73,0.7)',
    color: '#e0f2fe',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  toolButtonGhost: {
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#cbd5f5',
  },
  error: {
    margin: 0,
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
  debugPanel: {
    borderTop: '1px solid rgba(56,189,248,0.25)',
    paddingTop: 8,
    display: 'grid',
    gap: 8,
  },
  debugScroll: {
    maxHeight: 220,
    overflowY: 'auto',
    display: 'grid',
    gap: 6,
    paddingRight: 4,
  },
  debugEntry: {
    margin: 0,
    fontSize: 11,
    lineHeight: 1.5,
    color: '#bae6fd',
    background: 'rgba(15,23,42,0.65)',
    borderRadius: 10,
    padding: '6px 10px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  debugEmpty: {
    fontSize: 11,
    color: 'rgba(186,230,253,0.68)',
    textAlign: 'center',
  },
}

const SESSION_ENDED_STATUSES = new Set([
  'complete',
  'completed',
  'finished',
  'defeated',
  'retired',
  'abandoned',
  'cancelled',
  'canceled',
  'closed',
  'ended',
])

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
  ticketId,
  ticketStatus,
  queueMode,
  matchCode,
  debugEntries,
  debugOpen,
  onToggleDebug,
  onClearDebug,
  onCancel,
  onProceed,
}) {
  if (!open) return null

  const status = phase || 'queue'
  const ready = status === 'ready'
  const failed = status === 'error'
  const inFlight =
    status === 'queue' ||
    status === 'awaiting-room' ||
    status === 'staging' ||
    status === 'sampling' ||
    status === 'assembling'

  const headline = (() => {
    if (ready) return '매칭이 준비됐어요'
    if (failed) return '매칭을 준비하지 못했습니다'
    if (status === 'awaiting-room') return '방을 준비하는 중'
    if (status === 'staging') return '매칭 구성 중'
    if (status === 'sampling') return '상대 데이터를 탐색하는 중'
    if (status === 'assembling') return '전투를 구성하는 중'
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
    if (status === 'sampling') {
      return message || `${gameName}에 맞는 상대 데이터를 수집하고 있습니다.`
    }
    if (status === 'assembling') {
      return message || `${gameName} 전투 구성을 정리하는 중입니다.`
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

  const statusLines = [
    status ? `상태: ${status}` : null,
    ticketStatus ? `티켓 상태: ${ticketStatus}` : null,
    ticketId ? `티켓 ID: ${ticketId}` : null,
    queueMode ? `매칭 모드: ${queueMode === 'realtime' ? '실시간' : '비실시간'}` : null,
    matchCode ? `매치 코드: ${matchCode}` : null,
  ].filter(Boolean)

  const showProgress = inFlight || ready
  const showCancel = inFlight
  const primaryLabel = ready ? '확인' : failed ? '닫기' : '진행 중'
  const primaryEnabled = ready || failed

  const content = (
    <aside style={overlayStyles.root}>
      <div style={overlayStyles.headerRow}>
        <div style={overlayStyles.headingBlock}>
          <p style={overlayStyles.header}>{headline}</p>
          <p style={overlayStyles.subheader}>{subline}</p>
          {statusLines.length ? (
            <div style={overlayStyles.statusList}>
              {statusLines.map((line) => (
                <span key={line} style={overlayStyles.statusItem}>
                  {line}
                </span>
              ))}
            </div>
          ) : null}
          {ready && sessionMeta.length
            ? sessionMeta.map((entry) => (
                <span key={entry} style={overlayStyles.statusItem}>
                  {entry}
                </span>
              ))
            : null}
          {failed && errorMessage ? <p style={overlayStyles.error}>{errorMessage}</p> : null}
        </div>
        <div style={overlayStyles.toolbar}>
          <button type="button" style={overlayStyles.toolButton} onClick={onToggleDebug}>
            {debugOpen ? '디버그 닫기' : '디버그 열기'}
          </button>
          {debugOpen ? (
            <button
              type="button"
              style={{ ...overlayStyles.toolButton, ...overlayStyles.toolButtonGhost }}
              onClick={onClearDebug}
            >
              로그 초기화
            </button>
          ) : null}
        </div>
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
      {debugOpen ? (
        <div style={overlayStyles.debugPanel}>
          <div style={overlayStyles.debugScroll}>
            {debugEntries?.length ? (
              debugEntries.map((entry) => (
                <p key={entry.key} style={overlayStyles.debugEntry}>
                  [{entry.time}] {entry.event}
                  {entry.payload ? `\n${JSON.stringify(entry.payload, null, 2)}` : ''}
                </p>
              ))
            ) : (
              <p style={overlayStyles.debugEmpty}>현재 수집된 로그가 없습니다.</p>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
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

  const router = useRouter()

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

  const [activeSession, setActiveSession] = useState(() => readActiveSession())

  useEffect(() => {
    const unsubscribe = subscribeActiveSession((payload) => {
      setActiveSession(payload)
    })
    setActiveSession(readActiveSession())
    return () => {
      unsubscribe?.()
    }
  }, [])

  const activeSessionInfo = useMemo(() => {
    if (!activeSession || typeof activeSession !== 'object') {
      return null
    }
    const statusRaw =
      typeof activeSession.status === 'string' ? activeSession.status.trim().toLowerCase() : ''
    const gameIdValue = activeSession.gameId || activeSession.game_id || null
    const sessionIdValue = activeSession.sessionId || activeSession.session_id || null
    const hrefValue = typeof activeSession.href === 'string' ? activeSession.href : null
    const nameValue = typeof activeSession.gameName === 'string' ? activeSession.gameName : ''
    return {
      status: statusRaw,
      rawStatus: activeSession.status || '',
      gameId: gameIdValue ? String(gameIdValue) : null,
      sessionId: sessionIdValue ? String(sessionIdValue) : null,
      gameName: nameValue,
      href: hrefValue,
    }
  }, [activeSession])

  const hasBlockingActiveSession = useMemo(() => {
    if (!activeSessionInfo) return false
    if (!activeSessionInfo.status) return true
    return !SESSION_ENDED_STATUSES.has(activeSessionInfo.status)
  }, [activeSessionInfo])

  const activeSessionBlockMessage = useMemo(() => {
    if (!hasBlockingActiveSession) return ''
    const base = activeSessionInfo?.gameName
      ? `${activeSessionInfo.gameName} 전투가 진행 중입니다.`
      : '진행 중인 전투가 있습니다.'
    return `${base} 현재 전투를 마친 후 다시 시도해 주세요.`
  }, [activeSessionInfo?.gameName, hasBlockingActiveSession])

  const handleResumeActiveSession = useCallback(() => {
    if (activeSessionInfo?.href) {
      router.push(activeSessionInfo.href)
      return
    }
    if (activeSessionInfo?.gameId) {
      router.push(`/rank/${activeSessionInfo.gameId}/start`)
    }
  }, [activeSessionInfo, router])

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
    queueMode: null,
    matchCode: null,
  })
  const matchTaskRef = useRef(null)
  const queuePollRef = useRef(null)
  const queueRealtimeRef = useRef(null)
  const queuePollAttemptsRef = useRef(0)
  const stagingInProgressRef = useRef(false)
  const autoLaunchRef = useRef(false)
  const proceedInFlightRef = useRef(false)
  const latestTicketRef = useRef(null)
  const debugEntriesRef = useRef([])
  const debugIndexRef = useRef(0)
  const [debugEntries, setDebugEntries] = useState([])
  const [debugOpen, setDebugOpen] = useState(false)

  const appendDebug = useCallback((event, payload = null) => {
    const timestamp = new Date()
    const entry = {
      key: `${timestamp.getTime()}-${debugIndexRef.current}`,
      time: timestamp.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      event,
      payload,
    }
    debugIndexRef.current += 1
    const next = [...debugEntriesRef.current, entry].slice(-80)
    debugEntriesRef.current = next
    setDebugEntries(next)
  }, [])

  const clearDebug = useCallback(() => {
    debugEntriesRef.current = []
    setDebugEntries([])
  }, [])

  const applyMatchSnapshot = useCallback((gameId, payload) => {
    if (!gameId) return null
    hydrateGameMatchData(gameId)
    if (payload && typeof payload === 'object') {
      const {
        roster,
        participantPool,
        heroOptions,
        heroMap,
        realtimeMode,
        hostOwnerId,
        hostRoleLimit,
        slotTemplate,
        matchSnapshot,
        sessionMeta,
        sessionHistory,
      } = payload

      if (roster || participantPool || heroOptions || heroMap) {
        setGameMatchParticipation(gameId, {
          roster: roster || [],
          participantPool: participantPool || [],
          heroOptions: heroOptions || [],
          heroMap: heroMap || null,
          realtimeMode: realtimeMode ?? payload.mode ?? null,
          hostOwnerId: hostOwnerId ?? null,
          hostRoleLimit: hostRoleLimit ?? null,
        })
      }

      if (slotTemplate) {
        setGameMatchSlotTemplate(gameId, slotTemplate)
      }

      if (matchSnapshot) {
        setGameMatchSnapshot(gameId, matchSnapshot)
      }

      if (sessionMeta !== undefined) {
        setGameMatchSessionMeta(gameId, sessionMeta || null)
      }

      if (sessionHistory !== undefined) {
        setGameMatchSessionHistory(gameId, sessionHistory || null)
      }
    }

    return payload || null
  }, [])

  const fetchAndStoreMatchSnapshot = useCallback(
    async (gameId, { attempts = 3, delayMs = 500 } = {}) => {
      if (!gameId) {
        throw new Error('게임 정보를 찾을 수 없습니다.')
      }

      let snapshot = null
      let lastError = null

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        appendDebug('overlay:snapshot-attempt', { attempt: attempt + 1 })
        try {
          const payload = await loadMatchFlowSnapshot(supabase, gameId)
          if (payload) {
            snapshot = payload
            applyMatchSnapshot(gameId, payload)
            if (payload.sessionId || payload.session?.id) {
              return payload
            }
          } else {
            applyMatchSnapshot(gameId, null)
          }
          lastError = null
        } catch (error) {
          lastError = error
          appendDebug('overlay:snapshot-error', {
            attempt: attempt + 1,
            error: error?.message || String(error),
          })
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }

      if (snapshot) {
        return snapshot
      }

      if (lastError) {
        throw lastError
      }

      throw new Error('전투 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    },
    [appendDebug, applyMatchSnapshot],
  )

  const heroName = useMemo(() => {
    const raw = hero?.name
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return '이름 없는 영웅'
  }, [hero?.name])

  const heroOwnerId = useMemo(() => {
    const candidates = [
      hero?.owner_id,
      hero?.ownerId,
      hero?.user_id,
      hero?.userId,
      hero?.profile_id,
      hero?.profileId,
    ]
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined) continue
      const trimmed = String(candidate).trim()
      if (trimmed) {
        return trimmed
      }
    }
    return ''
  }, [hero?.ownerId, hero?.owner_id, hero?.profileId, hero?.profile_id, hero?.userId, hero?.user_id])

  const currentRole = selectedEntry?.role ? selectedEntry.role : null

  const gameDescription = useMemo(() => {
    const raw = selectedGame?.description
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    return '아직 등록된 설명이 없습니다.'
  }, [selectedGame?.description])

  useEffect(() => {
    if (!selectedGameId) return
    const heroId = hero?.id != null ? String(hero.id).trim() : ''
    if (!heroId) return
    const role = selectedEntry?.role != null ? String(selectedEntry.role).trim() : ''
    const heroImage = hero?.image_url || hero?.avatar_url || hero?.portrait_url || null
    const heroMeta = {
      id: heroId,
      name: heroName,
      image_url: heroImage || null,
    }
    setGameMatchHeroSelection(selectedGameId, {
      heroId,
      ownerId: heroOwnerId,
      viewerId: heroOwnerId || undefined,
      role,
      heroMeta,
    })
  }, [
    hero?.avatar_url,
    hero?.id,
    hero?.image_url,
    hero?.portrait_url,
    heroName,
    heroOwnerId,
    selectedEntry?.role,
    selectedGameId,
  ])

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

  const clearQueueWatch = useCallback(() => {
    if (queuePollRef.current) {
      clearInterval(queuePollRef.current)
      queuePollRef.current = null
    }
    if (queueRealtimeRef.current) {
      queueRealtimeRef.current.stop?.()
      queueRealtimeRef.current = null
    }
    queuePollAttemptsRef.current = 0
    stagingInProgressRef.current = false
    appendDebug('queue:watch-reset')
  }, [appendDebug])

  const stageTicket = useCallback(
    async (ticket) => {
      if (!ticket?.id) return
      if (!matchingState.open) {
        stagingInProgressRef.current = false
        return
      }

      setMatchingState((prev) => ({
        ...prev,
        phase: 'staging',
        progress: Math.max(prev.progress, 62),
        message: '매칭을 준비하는 중…',
        ticketId: ticket.id,
      }))

      appendDebug('stage:attempt', {
        ticketId: ticket.id,
        roomId: ticket.roomId || null,
        status: ticket.status || null,
      })

      try {
        const stageResult = await ensureRpc('stage_rank_match', { queue_ticket_id: ticket.id })

        appendDebug('rpc:stage_rank_match', {
          ticketId: ticket.id,
          roomId: ticket.roomId || null,
        })

        if (!matchingState.open) {
          stagingInProgressRef.current = false
          return
        }

        setMatchingState((prev) => ({
          ...prev,
          phase: 'ready',
          progress: 100,
          message: '매칭 준비가 완료되었습니다. 곧 전투가 시작됩니다.',
          error: '',
          ticketStatus: stageResult?.queue_status || prev.ticketStatus || 'ready',
          sessionId: stageResult?.session_id || null,
          readyExpiresAt: stageResult?.ready_expires_at || null,
        }))

        appendDebug('stage:ready', {
          ticketId: ticket.id,
          sessionId: stageResult?.session_id || null,
          readyExpiresAt: stageResult?.ready_expires_at || null,
        })

        if (typeof refreshParticipations === 'function') {
          try {
            await refreshParticipations()
          } catch (refreshError) {
            console.warn('[CharacterPlayPanel] 매칭 후 참가 정보를 새로고침하지 못했습니다:', refreshError)
          }
        }

        clearQueueWatch()
      } catch (error) {
        const detail = error?.message || error?.details || ''
        const normalized = typeof detail === 'string' ? detail.toLowerCase() : ''
        if (normalized.includes('missing_room_id')) {
          stagingInProgressRef.current = false
          setMatchingState((prev) => ({
            ...prev,
            phase: 'awaiting-room',
            message: '방 정보를 기다리는 중입니다…',
            error: '',
          }))
          appendDebug('stage:awaiting-room', {
            ticketId: ticket.id,
            detail,
          })
          return
        }

        const friendly =
          detail ||
          (typeof error === 'string'
            ? error
            : '매칭을 준비하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')

        appendDebug('stage:error', { ticketId: ticket.id, error: friendly })

        setMatchingState((prev) => ({
          ...prev,
          open: true,
          phase: 'error',
          progress: 0,
          message: '',
          error: friendly,
          ticketId: null,
          ticketStatus: null,
          sessionId: null,
          readyExpiresAt: null,
        }))

        clearQueueWatch()
      } finally {
        stagingInProgressRef.current = false
      }
    },
    [appendDebug, clearQueueWatch, matchingState.open, refreshParticipations],
  )

  const processTicketUpdate = useCallback(
    (ticket) => {
      if (!ticket) return
      latestTicketRef.current = ticket

      appendDebug('queue:update', {
        ticketId: ticket.id || null,
        status: ticket.status || null,
        roomId: ticket.roomId || null,
      })

      setMatchingState((prev) => {
        const nextState = { ...prev }
        let changed = false

        const nextStatus = ticket.status || prev.ticketStatus || null
        if (nextStatus !== prev.ticketStatus) {
          nextState.ticketStatus = nextStatus
          changed = true
        }

        if (!ticket.roomId && nextStatus === 'staging' && prev.phase !== 'awaiting-room') {
          nextState.phase = 'awaiting-room'
          nextState.message = '방을 구성 중입니다…'
          changed = true
        }

        return changed ? nextState : prev
      })

      if (ticket.roomId && ticket.id && !stagingInProgressRef.current) {
        stagingInProgressRef.current = true
        stageTicket(ticket)
      }
    },
    [appendDebug, stageTicket],
  )

  const startQueueRealtime = useCallback(
    (queueId, ticketId) => {
      if (!queueId || !ticketId) return

      if (queueRealtimeRef.current) {
        queueRealtimeRef.current.stop?.()
        queueRealtimeRef.current = null
      }

      appendDebug('queue:watch-start', { queueId, ticketId })

      const watcher = createQueueRealtimeWatcher({
        queueId,
        ticketId,
        onTicket: (row) => {
          const ticket = normalizeQueueTicket(row)
          if (ticket) {
            processTicketUpdate(ticket)
          }
        },
      })

      watcher.start?.()
      queueRealtimeRef.current = watcher
    },
    [appendDebug, processTicketUpdate],
  )

  useEffect(() => {
    if (!matchingState.open) return undefined
    if (!matchingState.ticketId) return undefined
    if (['ready', 'error'].includes(matchingState.phase)) return undefined

    let cancelled = false
    queuePollAttemptsRef.current = 0

    const poll = async () => {
      if (cancelled) return
      queuePollAttemptsRef.current += 1

      appendDebug('queue:poll', {
        attempt: queuePollAttemptsRef.current,
        ticketId: matchingState.ticketId,
      })

      let data
      try {
        data = await ensureRpc('fetch_rank_queue_ticket', {
          queue_ticket_id: matchingState.ticketId,
        })
      } catch (error) {
        if (cancelled) return
        const code = error?.code || error?.message || error?.details || ''
        const normalized = typeof code === 'string' ? code.toLowerCase() : ''
        appendDebug('queue:poll-error', { attempt: queuePollAttemptsRef.current, code })
        if (normalized.includes('queue_ticket_not_found')) {
          setMatchingState((prev) => ({
            ...prev,
            open: true,
            phase: 'error',
            progress: 0,
            message: '',
            error: '대기열 정보를 찾을 수 없습니다. 다시 시도해 주세요.',
            ticketId: null,
            ticketStatus: null,
            sessionId: null,
            readyExpiresAt: null,
          }))
          clearQueueWatch()
          cancelled = true
        }
        return
      }

      if (cancelled) return

      const ticket = normalizeQueueTicket(data)
      if (!ticket) return

      processTicketUpdate(ticket)

      if (!ticket.roomId && queuePollAttemptsRef.current >= QUEUE_POLL_LIMIT) {
        appendDebug('queue:poll-timeout', { attempts: queuePollAttemptsRef.current })
        setMatchingState((prev) => ({
          ...prev,
          open: true,
          phase: 'error',
          progress: 0,
          message: '',
          error: '매칭이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
          ticketId: null,
          ticketStatus: null,
          sessionId: null,
          readyExpiresAt: null,
          matchCode: null,
        }))

        clearQueueWatch()
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
    }
  }, [
    appendDebug,
    matchingState.open,
    matchingState.ticketId,
    matchingState.phase,
    processTicketUpdate,
    clearQueueWatch,
  ])

  const resetMatchingState = useCallback(() => {
    clearQueueWatch()
    latestTicketRef.current = null
    autoLaunchRef.current = false
    proceedInFlightRef.current = false
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
      queueMode: null,
      matchCode: null,
    })
    appendDebug('overlay:reset')
  }, [appendDebug, clearQueueWatch])

  const handleCancelMatching = useCallback(async () => {
    if (matchTaskRef.current) {
      matchTaskRef.current.cancelled = true
      matchTaskRef.current = null
    }

    const activeTicketId = matchingState.ticketId || latestTicketRef.current?.id || null
    if (activeTicketId) {
      try {
        await ensureRpc('cancel_rank_queue_ticket', { queue_ticket_id: activeTicketId })
        appendDebug('queue:cancel', { ticketId: activeTicketId })
      } catch (error) {
        console.warn('[CharacterPlayPanel] 매칭 취소 RPC 실패:', error)
        appendDebug('queue:cancel-error', { ticketId: activeTicketId, error: error?.message || String(error) })
      }
    }

    resetMatchingState()
  }, [appendDebug, matchingState.ticketId, resetMatchingState])

  useEffect(() => () => clearQueueWatch(), [clearQueueWatch])

  const handleProceedMatching = useCallback(async () => {
    appendDebug('overlay:confirm', { phase: matchingState.phase })

    if (matchingState.phase !== 'ready') {
      resetMatchingState()
      return
    }

    if (matchingState.queueMode !== 'realtime') {
      resetMatchingState()
      return
    }

    if (!selectedGameId) {
      setMatchingState((prev) => ({
        ...prev,
        open: true,
        phase: 'error',
        progress: 0,
        message: '',
        error: '게임 정보를 찾을 수 없습니다. 다시 시도해 주세요.',
      }))
      return
    }

    if (proceedInFlightRef.current) {
      appendDebug('overlay:launch-skipped', { reason: 'in-flight' })
      return
    }

    proceedInFlightRef.current = true

    setMatchingState((prev) => ({
      ...prev,
      message: '전투 화면으로 이동 중…',
      error: '',
    }))

    try {
      const snapshot = await fetchAndStoreMatchSnapshot(selectedGameId)
      const sessionId =
        matchingState.sessionId || snapshot?.sessionId || snapshot?.session?.id || null

      appendDebug('overlay:launch-success', {
        gameId: selectedGameId,
        sessionId,
      })

      resetMatchingState()

      const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
      router.push(`/rank/${selectedGameId}/start${query}`)
    } catch (error) {
      const friendly =
        error?.message || '전투 화면을 여는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      appendDebug('overlay:launch-error', { error: friendly })
      setMatchingState((prev) => ({
        ...prev,
        open: true,
        phase: 'error',
        progress: 0,
        message: '',
        error: friendly,
      }))
    } finally {
      proceedInFlightRef.current = false
    }
  }, [
    appendDebug,
    fetchAndStoreMatchSnapshot,
    matchingState.phase,
    matchingState.queueMode,
    matchingState.sessionId,
    resetMatchingState,
    router,
    selectedGameId,
  ])

  useEffect(() => {
    if (!matchingState.open) {
      autoLaunchRef.current = false
      return
    }
    if (matchingState.phase !== 'ready') return
    if (matchingState.queueMode !== 'realtime') return
    if (proceedInFlightRef.current) return
    if (autoLaunchRef.current) return

    autoLaunchRef.current = true

    const timer = setTimeout(() => {
      handleProceedMatching()
    }, 900)

    return () => {
      clearTimeout(timer)
    }
  }, [handleProceedMatching, matchingState.open, matchingState.phase, matchingState.queueMode])

  const runAsyncMatchFlow = useCallback(async (hostPayload = null) => {
    if (!selectedGameId) {
      throw new Error('게임 정보를 찾을 수 없습니다.')
    }

    appendDebug('async:request', { gameId: selectedGameId, host: hostPayload ? { role: hostPayload.role, heroId: hostPayload.heroId } : null })

    let response
    try {
      response = await fetch(ASYNC_MATCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: selectedGameId, mode: 'rank', host: hostPayload || undefined }),
      })
    } catch (error) {
      appendDebug('async:network-error', { error: error?.message || String(error) })
      throw new Error('매칭 요청을 보낼 수 없습니다. 네트워크 상태를 확인해 주세요.')
    }

    let payload = null
    try {
      payload = await response.json()
    } catch (error) {
      appendDebug('async:parse-error', { error: error?.message || String(error) })
    }

    appendDebug('async:response', {
      status: response.status,
      ok: response.ok,
      payload,
    })

    if (!response.ok) {
      const detail =
        (payload && (payload.detail || payload.error || payload.message)) ||
        '매칭 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      throw new Error(detail)
    }

    return payload || {}
  }, [appendDebug, selectedGameId])

  const runAutoMatch = useCallback(async () => {
    if (hasBlockingActiveSession) {
      appendDebug('queue:block-active-session', {
        status: activeSessionInfo?.rawStatus || null,
        gameId: activeSessionInfo?.gameId || null,
      })
      setMatchingState((prev) => ({
        ...prev,
        open: true,
        phase: 'error',
        progress: 0,
        message: '',
        error:
          activeSessionBlockMessage ||
          '진행 중인 전투가 있어 새로운 매칭을 시작할 수 없습니다. 현재 전투를 마친 뒤 다시 시도해 주세요.',
        ticketId: null,
        ticketStatus: null,
        sessionId: null,
        readyExpiresAt: null,
        matchCode: null,
      }))
      return
    }

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

    const initialPhase = realtimeEnabled ? 'queue' : 'sampling'
    const initialProgress = realtimeEnabled ? 8 : 12

    appendDebug('queue:start', {
      heroId: hero.id,
      gameId: selectedGameId,
      role: roleLabel,
      realtime: realtimeEnabled,
    })

    clearQueueWatch()
    setMatchingState({
      open: true,
      phase: initialPhase,
      progress: initialProgress,
      message: queueMessage,
      error: '',
      ticketId: null,
      ticketStatus: null,
      sessionId: null,
      readyExpiresAt: null,
      queueMode: realtimeEnabled ? 'realtime' : 'async',
      matchCode: null,
    })

    matchTaskRef.current = { cancelled: false }

    if (!realtimeEnabled) {
      const hostPayload = {
        heroId: hero.id,
        ownerId,
        role: roleLabel,
      }
      if (Number.isFinite(Number(selectedEntry?.score))) {
        hostPayload.score = Number(selectedEntry.score)
      }
      if (Number.isFinite(Number(selectedEntry?.rating))) {
        hostPayload.rating = Number(selectedEntry.rating)
      }
      if (Number.isFinite(Number(selectedEntry?.win_rate))) {
        hostPayload.winRate = Number(selectedEntry.win_rate)
      }
      if (Number.isFinite(Number(selectedEntry?.sessionCount))) {
        hostPayload.sessions = Number(selectedEntry.sessionCount)
      }
      try {
        setMatchingState((prev) => ({
          ...prev,
          phase: 'assembling',
          progress: Math.max(prev.progress, 42),
          message: '전투 구성을 계산하는 중입니다…',
          error: '',
        }))

        const result = await runAsyncMatchFlow(hostPayload)

        if (!result?.ready) {
          const friendly =
            result?.error ||
            (result?.sampleMeta?.message
              ? result.sampleMeta.message
              : '매칭을 완성하지 못했습니다. 잠시 후 다시 시도해 주세요.')

          setMatchingState((prev) => ({
            ...prev,
            phase: 'error',
            progress: 0,
            message: '',
            error: friendly,
            ticketId: null,
            ticketStatus: null,
            sessionId: null,
            readyExpiresAt: null,
            matchCode: null,
          }))
          appendDebug('async:not-ready', { friendly, meta: result?.sampleMeta || null })
        } else {
          const matchCode = result.matchCode || null
          const readyMessage = matchCode
            ? `매치 코드 ${matchCode}가 준비됐습니다. 곧 전투가 시작됩니다.`
            : '전투가 준비되었습니다. 곧 시작될 거예요.'

          setMatchingState((prev) => ({
            ...prev,
            phase: 'ready',
            progress: 100,
            message: readyMessage,
            error: '',
            ticketId: null,
            ticketStatus: null,
            sessionId: matchCode,
            readyExpiresAt: null,
            matchCode,
          }))

          appendDebug('async:ready', {
            matchCode,
            assignments: result?.assignments || null,
            sampleMeta: result?.sampleMeta || null,
          })

          if (typeof refreshParticipations === 'function') {
            try {
              await refreshParticipations()
            } catch (refreshError) {
              console.warn('[CharacterPlayPanel] 비실시간 매칭 후 참가 정보를 새로고침하지 못했습니다:', refreshError)
            }
          }
        }
      } catch (error) {
        const friendly =
          error?.message || '매칭 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        appendDebug('async:error', { error: friendly })
        setMatchingState((prev) => ({
          ...prev,
          phase: 'error',
          progress: 0,
          message: '',
          error: friendly,
          ticketId: null,
          ticketStatus: null,
          sessionId: null,
          readyExpiresAt: null,
          matchCode: null,
        }))
      } finally {
        matchTaskRef.current = null
      }
      return
    }

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

      appendDebug('rpc:join_rank_queue', {
        queueId: QUEUE_ID,
        heroId: hero.id,
        gameId: selectedGameId,
        role: roleLabel,
        realtimeMode,
        queueMode: realtimeEnabled ? 'realtime' : 'async',
      })
      const ticket = await ensureRpc('join_rank_queue', { queue_id: QUEUE_ID, payload })
      const normalizedTicket = normalizeQueueTicket(ticket)
      if (!normalizedTicket?.id) {
        throw new Error('큐 티켓을 확보하지 못했습니다.')
      }

      latestTicketRef.current = normalizedTicket
      appendDebug('queue:ticket-acquired', {
        ticketId: normalizedTicket.id,
        status: normalizedTicket.status || null,
        roomId: normalizedTicket.roomId || null,
      })
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

      startQueueRealtime(normalizedTicket.queueId || QUEUE_ID, normalizedTicket.id)
      processTicketUpdate(normalizedTicket)
    } catch (error) {
      const friendlyError =
        error?.message || error?.details || (typeof error === 'string' ? error : '매칭 중 오류가 발생했습니다.')
      appendDebug('queue:error', { stage: 'join', error: friendlyError })
      setMatchingState((prev) => ({
        ...prev,
        open: true,
        phase: 'error',
        progress: 0,
        message: '',
        error: friendlyError,
        ticketId: null,
        ticketStatus: null,
        sessionId: null,
        readyExpiresAt: null,
        matchCode: null,
      }))
    } finally {
      matchTaskRef.current = null
    }
  }, [
    appendDebug,
    clearQueueWatch,
    hero?.id,
    hero?.owner_id,
    heroName,
    processTicketUpdate,
    selectedEntry,
    selectedGame?.realtime_match,
    selectedGameId,
    startQueueRealtime,
    runAsyncMatchFlow,
    refreshParticipations,
    hasBlockingActiveSession,
    activeSessionInfo,
    activeSessionBlockMessage,
  ])

  const visibleBattleRows = useMemo(
    () => battleDetails.slice(0, visibleBattles || battleDetails.length),
    [battleDetails, visibleBattles],
  )

  const isMatchingBusy =
    matchingState.open &&
    ['queue', 'awaiting-room', 'staging', 'sampling', 'assembling'].includes(matchingState.phase)

  const startButtonDisabled = !selectedGameId || isMatchingBusy || hasBlockingActiveSession

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
          ...(startButtonDisabled ? panelStyles.buttonDisabled : {}),
        }}
        onClick={startButtonDisabled ? undefined : runAutoMatch}
        disabled={startButtonDisabled}
      >
        게임 시작
      </button>
      {hasBlockingActiveSession ? (
        <div style={panelStyles.lockedNotice}>
          <p style={panelStyles.lockedText}>{activeSessionBlockMessage}</p>
          {activeSessionInfo?.gameName ? (
            <p style={panelStyles.lockedGame}>현재 전투: {activeSessionInfo.gameName}</p>
          ) : null}
          <div style={panelStyles.lockedActions}>
            <button type="button" style={panelStyles.lockedButton} onClick={handleResumeActiveSession}>
              전투로 이동
            </button>
          </div>
        </div>
      ) : null}
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
        ticketId={matchingState.ticketId}
        ticketStatus={matchingState.ticketStatus}
        queueMode={matchingState.queueMode}
        matchCode={matchingState.matchCode}
        debugEntries={debugEntries}
        debugOpen={debugOpen}
        onToggleDebug={() => setDebugOpen((prev) => !prev)}
        onClearDebug={clearDebug}
        onCancel={handleCancelMatching}
        onProceed={handleProceedMatching}
      />
    </div>
  )
}
