'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import {
  buildSlotsFromParticipants,
  makeNodePrompt,
  parseOutcome,
} from '../../../lib/promptEngine'
import { pickNextEdge } from './engine/graph'
import { buildSystemMessage, parseRules } from './engine/systemPrompt'
import { resolveSlotBinding } from './engine/slotBindingResolver'
import { createBridgeContext } from './engine/bridgeContext'
import {
  buildUserActionPersona,
  normalizeHeroName,
  resolveActorContext,
} from './engine/actorContext'
import { buildBattleLogDraft } from './engine/battleLogBuilder'
import { formatRealtimeReason } from './engine/realtimeReasons'
import {
  buildLogEntriesFromEvents,
  initializeRealtimeEvents,
  appendSnapshotEvents,
} from './engine/timelineState'
import {
  createOwnerDisplayMap,
  deriveParticipantOwnerId,
} from './engine/participants'
import { isApiKeyError } from './engine/apiKeyUtils'
import { createTurnTimerService } from './services/turnTimerService'
import {
  createTurnVoteController,
  deriveEligibleOwnerIds,
} from './services/turnVoteController'
import { createRealtimeSessionManager } from './services/realtimeSessionManager'
import { createDropInQueueService } from './services/dropInQueueService'
import { createAsyncSessionManager } from './services/asyncSessionManager'
import {
  mergeTimelineEvents,
  normalizeTimelineStatus,
} from '@/lib/rank/timelineEvents'
import { useHistoryBuffer } from './hooks/useHistoryBuffer'
import { useStartSessionLifecycle } from './hooks/useStartSessionLifecycle'
import { useStartApiKeyManager } from './hooks/useStartApiKeyManager'
import { useStartCooldown } from './hooks/useStartCooldown'
import { useStartManualResponse } from './hooks/useStartManualResponse'
import { useStartSessionWatchdog } from './hooks/useStartSessionWatchdog'
import { consumeStartMatchMeta } from '../startConfig'
import { useMatchContextLoader } from './hooks/useMatchContextLoader'
import { sanitizeMatchMetadata } from './engine/matchContext'

export function useStartClientEngine(gameId) {
  const initialStoredApiKey =
    typeof window === 'undefined'
      ? ''
      : (window.sessionStorage.getItem('rank.start.apiKey') || '').trim()
  const initialMatchMeta = consumeStartMatchMeta()
  const initialApiVersion =
    typeof window === 'undefined'
      ? 'gemini'
      : window.sessionStorage.getItem('rank.start.apiVersion') || 'gemini'
  const initialGeminiConfig =
    typeof window === 'undefined'
      ? {}
      : {
          mode: window.sessionStorage.getItem('rank.start.geminiMode') || undefined,
          model: window.sessionStorage.getItem('rank.start.geminiModel') || undefined,
        }
  const startMatchMetaRef = useRef(initialMatchMeta)
  const [startMatchMeta] = useState(initialMatchMeta)
  const matchMetaLoggedRef = useRef(false)

  const { history, historyVersion, bumpHistoryVersion } = useHistoryBuffer()
  const {
    manualResponse,
    setManualResponse,
    clearManualResponse,
    requireManualResponse,
  } = useStartManualResponse()

  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([])
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [preflight, setPreflight] = useState(true)
  const [turn, setTurn] = useState(1)
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [activeGlobal, setActiveGlobal] = useState([])
  const [activeLocal, setActiveLocal] = useState([])
  const [logs, setLogs] = useState([])
  const logsRef = useRef([])
  const [battleLogDraft, setBattleLogDraft] = useState(null)
  const lastBattleLogSignatureRef = useRef(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [promptMetaWarning, setPromptMetaWarning] = useState('')
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [winCount, setWinCount] = useState(0)
  const [lastDropInTurn, setLastDropInTurn] = useState(null)
  const [viewerId, setViewerId] = useState(null)
  const [turnDeadline, setTurnDeadline] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [activeHeroAssets, setActiveHeroAssets] = useState({
    backgrounds: [],
    bgmUrl: null,
    bgmDuration: null,
    audioProfile: null,
  })
  const [activeActorNames, setActiveActorNames] = useState([])
  const [turnTimerSeconds] = useState(() => {
    if (typeof window === 'undefined') return 60
    const stored = Number(window.sessionStorage.getItem('rank.start.turnTimer'))
    if (Number.isFinite(stored) && stored > 0) return stored
    return 60
  })
  const realtimeManagerRef = useRef(null)
  if (!realtimeManagerRef.current) {
    realtimeManagerRef.current = createRealtimeSessionManager()
  }
  const dropInQueueRef = useRef(null)
  if (!dropInQueueRef.current) {
    dropInQueueRef.current = createDropInQueueService()
  }
  const asyncSessionManagerRef = useRef(null)
  if (!asyncSessionManagerRef.current) {
    asyncSessionManagerRef.current = createAsyncSessionManager({
      dropInQueue: dropInQueueRef.current,
    })
  }
  const turnTimerServiceRef = useRef(null)
  if (!turnTimerServiceRef.current) {
    turnTimerServiceRef.current = createTurnTimerService({
      baseSeconds: turnTimerSeconds,
    })
  } else {
    turnTimerServiceRef.current.configureBase(turnTimerSeconds)
  }
  const turnVoteControllerRef = useRef(null)
  if (!turnVoteControllerRef.current) {
    turnVoteControllerRef.current = createTurnVoteController()
  }
  const initialRealtimeSnapshotRef = useRef(null)
  if (!initialRealtimeSnapshotRef.current) {
    initialRealtimeSnapshotRef.current = realtimeManagerRef.current
      ? realtimeManagerRef.current.getSnapshot()
      : null
  }
  const [consensusState, setConsensusState] = useState(() =>
    turnVoteControllerRef.current.getSnapshot(),
  )
  const [realtimePresence, setRealtimePresence] = useState(
    initialRealtimeSnapshotRef.current,
  )
  const [realtimeEvents, setRealtimeEvents] = useState(() =>
    initializeRealtimeEvents(initialRealtimeSnapshotRef.current),
  )
  const realtimeEventsRef = useRef(realtimeEvents)
  const [dropInSnapshot, setDropInSnapshot] = useState(null)
  const dropInSnapshotRef = useRef(null)

  useEffect(() => {
    logsRef.current = Array.isArray(logs) ? logs : []
  }, [logs])

  useEffect(() => {
    realtimeEventsRef.current = Array.isArray(realtimeEvents)
      ? realtimeEvents
      : []
  }, [realtimeEvents])

  useEffect(() => {
    dropInSnapshotRef.current = dropInSnapshot || null
  }, [dropInSnapshot])

  const matchingMetadata = useMemo(
    () => sanitizeMatchMetadata(startMatchMeta),
    [startMatchMeta],
  )

  useEffect(() => {
    startMatchMetaRef.current = matchingMetadata
  }, [matchingMetadata])
  const [startingSession, setStartingSession] = useState(false)
  const [gameVoided, setGameVoided] = useState(false)
  const [sessionInfo, setSessionInfo] = useState(null)
  const lastScheduledTurnRef = useRef(0)
  const participantIdSetRef = useRef(new Set())

  const {
    loading: matchContextLoading,
    error: matchContextError,
    context: matchContext,
    warnings: matchContextWarnings,
  } = useMatchContextLoader({
    gameId,
    supabaseClient: supabase,
    startMatchMeta: matchingMetadata,
  })
  const loading = matchContextLoading
  const error = matchContextError

  useEffect(() => {
    const context = matchContext || null
    setGame(context?.game || null)
    setParticipants(
      Array.isArray(context?.participants) ? context.participants : [],
    )
    if (context?.graph && Array.isArray(context.graph.nodes)) {
      setGraph(context.graph)
    } else {
      setGraph({ nodes: [], edges: [] })
    }
  }, [matchContext])

  useEffect(() => {
    if (!Array.isArray(matchContextWarnings) || matchContextWarnings.length === 0) {
      setPromptMetaWarning('')
      return
    }

    const promptMessages = []
    matchContextWarnings.forEach((warning) => {
      if (!warning) return
      const message = warning.message || ''
      if (!message) return
      const payload = warning.context || warning
      if (warning.type === 'slot_mismatch') {
        console.warn('[MatchContext] 슬롯 경고:', message, payload)
      } else {
        console.info('[MatchContext] 경고:', message, payload)
      }
      if (warning.type === 'prompt_meta') {
        promptMessages.push(message)
      }
    })

    setPromptMetaWarning(promptMessages.join('\n'))
  }, [matchContextWarnings])

  const applyRealtimeSnapshot = useCallback((snapshot) => {
    if (!snapshot) {
      setRealtimePresence(null)
      setRealtimeEvents([])
      return
    }
    setRealtimePresence(snapshot)
    setRealtimeEvents((prev) => appendSnapshotEvents(prev, snapshot))
  }, [])

  const clearConsensusVotes = useCallback(() => {
    const controller = turnVoteControllerRef.current
    if (!controller) return
    const snapshot = controller.clear()
    setConsensusState(snapshot)
  }, [])

  const {
    rememberActiveSession,
    updateSessionRecord,
    clearSessionRecord,
    markSessionDefeated,
  } = useStartSessionLifecycle({
    gameId,
    game,
    activeActorNames,
    sessionInfo,
    setSessionInfo,
    realtimeManagerRef,
    dropInQueueRef,
    asyncSessionManagerRef,
    applyRealtimeSnapshot,
    setTurnDeadline,
    setTimeRemaining,
  })


  const logTurnEntries = useCallback(
    async ({ entries, turnNumber }) => {
      if (!sessionInfo?.id) {
        return
      }

      const normalized = []
      if (Array.isArray(entries)) {
        entries.forEach((entry) => {
          if (!entry) return
          const rawRole = typeof entry.role === 'string' ? entry.role.trim() : ''
          const role = rawRole || 'narration'
          let content = ''
          if (typeof entry.content === 'string') {
            content = entry.content
          } else if (entry.content != null) {
            try {
              content = JSON.stringify(entry.content)
            } catch (error) {
              content = String(entry.content)
            }
          }
          if (!content || !content.trim()) {
            return
          }
          const visibilityValue =
            typeof entry.visibility === 'string' ? entry.visibility.trim().toLowerCase() : ''

          let summary = null
          const summaryCandidates = [entry.summary, entry.summary_payload, entry.summaryPayload]
          for (const candidate of summaryCandidates) {
            if (candidate && typeof candidate === 'object') {
              try {
                summary = JSON.parse(JSON.stringify(candidate))
                break
              } catch (error) {
                summary = null
              }
            }
          }

          const prompt = typeof entry.prompt === 'string' ? entry.prompt : null
          const actors = Array.isArray(entry.actors)
            ? entry.actors
                .map((actor) => (typeof actor === 'string' ? actor.trim() : ''))
                .filter(Boolean)
            : null
          const extra =
            entry.extra && typeof entry.extra === 'object'
              ? JSON.parse(JSON.stringify(entry.extra))
              : null

          const normalizedEntry = {
            role,
            content,
            public: entry.public !== false,
          }

          if (typeof entry.isVisible === 'boolean') {
            normalizedEntry.isVisible = entry.isVisible
          }

          if (visibilityValue) {
            normalizedEntry.visibility = visibilityValue
          }

          if (summary) {
            normalizedEntry.summary = summary
          }

          if (prompt) {
            normalizedEntry.prompt = prompt
          }

          if (actors && actors.length) {
            normalizedEntry.actors = actors
          }

          if (extra) {
            normalizedEntry.extra = extra
          }

          normalized.push(normalizedEntry)
        })
      }

      if (!normalized.length) {
        return
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }
        const token = sessionData?.session?.access_token
        if (!token) {
          throw new Error('세션 토큰을 확인할 수 없습니다.')
        }

        const payload = {
          session_id: sessionInfo.id,
          game_id: gameId,
          entries: normalized,
        }
        const numericTurn = Number(turnNumber)
        if (Number.isFinite(numericTurn) && numericTurn > 0) {
          payload.turn_number = numericTurn
        }

        const response = await fetch('/api/rank/log-turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          let detail = null
          try {
            detail = await response.json()
          } catch (error) {
            detail = null
          }
          const message = detail?.error || '턴 기록에 실패했습니다.'
          throw new Error(message)
        }
      } catch (err) {
        console.error('턴 기록 실패:', err)
      }
    },
    [gameId, sessionInfo?.id],
  )
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!alive) return
        if (error) {
          console.warn('뷰어 정보를 불러오지 못했습니다:', error)
          setViewerId(null)
          return
        }
        setViewerId(data?.user?.id || null)
      } catch (err) {
        if (!alive) return
        console.warn('뷰어 정보를 확인하는 중 오류 발생:', err)
        setViewerId(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!gameId || preflight) return
    updateSessionRecord({ turn, actorNames: activeActorNames })
  }, [gameId, preflight, turn, activeActorNames, updateSessionRecord])

  const scheduleTurnTimer = useCallback(
    (turnNumber) => {
      if (preflight) return
      if (!currentNodeId) return
      if (!turnTimerServiceRef.current) return
      const durationSeconds = turnTimerServiceRef.current.nextTurnDuration(turnNumber)
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        setTurnDeadline(null)
        setTimeRemaining(null)
        return
      }
      const deadline = Date.now() + durationSeconds * 1000
      setTurnDeadline(deadline)
      setTimeRemaining(durationSeconds)
      lastScheduledTurnRef.current = turnNumber
    },
    [preflight, currentNodeId],
  )

  useEffect(() => {
    if (preflight) return
    if (!currentNodeId) return
    if (isAdvancing) return
    if (!turn || turn <= 0) return
    if (lastScheduledTurnRef.current === turn && turnDeadline) return
    scheduleTurnTimer(turn)
  }, [preflight, currentNodeId, turn, turnDeadline, isAdvancing, scheduleTurnTimer])

  useEffect(() => {
    if (!realtimeManagerRef.current) return
    const snapshot = realtimeManagerRef.current.syncParticipants(participants)
    applyRealtimeSnapshot(snapshot)
  }, [participants, applyRealtimeSnapshot])

  useEffect(() => {
    if (!realtimeManagerRef.current) return
    if (!game?.realtime_match) {
      const snapshot = realtimeManagerRef.current.setManagedOwners([])
      applyRealtimeSnapshot(snapshot)
      return
    }
    const normalizedViewer = viewerId ? [String(viewerId).trim()] : []
    const snapshot = realtimeManagerRef.current.setManagedOwners(normalizedViewer)
    applyRealtimeSnapshot(snapshot)
  }, [viewerId, game?.realtime_match, applyRealtimeSnapshot])

  useEffect(() => {
    if (preflight) return
    if (!game?.realtime_match) return
    if (!turn || turn <= 0) return
    if (!realtimeManagerRef.current) return
    const snapshot = realtimeManagerRef.current.beginTurn({
      turnNumber: turn,
      eligibleOwnerIds: deriveEligibleOwnerIds(participants),
    })
    applyRealtimeSnapshot(snapshot)
  }, [preflight, game?.realtime_match, turn, participants, applyRealtimeSnapshot])

  useEffect(() => {
    if (!currentNodeId) {
      setLastDropInTurn(null)
    }
  }, [currentNodeId])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!turnDeadline) {
      setTimeRemaining(null)
      return undefined
    }

    const tick = () => {
      const diff = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000))
      setTimeRemaining(diff)
    }

    tick()

    const timerId = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(timerId)
    }
  }, [turnDeadline])

  const systemPrompt = useMemo(() => buildSystemMessage(game || {}), [game])
  const parsedRules = useMemo(() => parseRules(game || {}), [game])
  const brawlEnabled = parsedRules?.brawl_rule === 'allow-brawl'
  const endConditionVariable = useMemo(() => {
    const raw = parsedRules?.end_condition_variable
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      return trimmed || null
    }
    return null
  }, [parsedRules])
  const slots = useMemo(() => buildSlotsFromParticipants(participants), [participants])
  const heroLookup = useMemo(() => {
    const map = new Map()
    participants.forEach((participant, index) => {
      const heroName = participant?.hero?.name
      if (!heroName) return
      const key = normalizeHeroName(heroName)
      if (!key) return
      const entry = {
        hero: participant.hero,
        participant,
        slotIndex: index,
      }
      if (!map.has(key)) {
        map.set(key, [entry])
      } else {
        map.get(key).push(entry)
      }
    })
    return map
  }, [participants])
  const resolveHeroAssets = useCallback(
    (names, fallbackContext) => {
      const trimmed = Array.isArray(names)
        ? names.map((name) => String(name || '').trim()).filter(Boolean)
        : []

      const matchedEntries = []
      const resolvedNames = []
      const seen = new Set()

      for (const raw of trimmed) {
        const key = normalizeHeroName(raw)
        if (!key || seen.has(key)) continue
        const candidates = heroLookup.get(key)
        if (candidates && candidates.length) {
          seen.add(key)
          resolvedNames.push(raw)
          matchedEntries.push(candidates[0])
        }
      }

      if (!matchedEntries.length) {
        const fallbackHero = fallbackContext?.participant?.hero || null
        if (fallbackHero) {
          matchedEntries.push({
            hero: fallbackHero,
            participant: fallbackContext?.participant || null,
            slotIndex: fallbackContext?.slotIndex ?? null,
          })
          if (fallbackHero.name) {
            resolvedNames.push(fallbackHero.name)
          }
        } else if (fallbackContext?.heroSlot?.name) {
          resolvedNames.push(fallbackContext.heroSlot.name)
        }
      }

      const backgrounds = matchedEntries
        .map((entry) => entry.hero?.background_url || entry.hero?.image_url || '')
        .filter(Boolean)
      const bgmSource = matchedEntries.find((entry) => entry.hero?.bgm_url)

      const audioProfile = bgmSource
        ? {
            heroId: bgmSource.hero?.id || null,
            heroName: bgmSource.hero?.name || '',
            bgmUrl: bgmSource.hero?.bgm_url || null,
            bgmDuration: Number(bgmSource.hero?.bgm_duration_seconds) || null,
            equalizer: null,
            reverb: null,
            compressor: null,
          }
        : null

      return {
        backgrounds,
        bgmUrl: audioProfile?.bgmUrl || null,
        bgmDuration: audioProfile?.bgmDuration || null,
        actorNames: resolvedNames,
        audioProfile,
      }
    },
    [heroLookup],
  )

  const updateHeroAssets = useCallback(
    (names, fallbackContext) => {
      const { backgrounds, bgmUrl, bgmDuration, actorNames, audioProfile } =
        resolveHeroAssets(names, fallbackContext)
      setActiveHeroAssets({
        backgrounds,
        bgmUrl,
        bgmDuration,
        audioProfile,
      })
      setActiveActorNames(actorNames)
    },
    [resolveHeroAssets],
  )
  const participantsStatus = useMemo(
    () =>
      participants.map((participant) => ({
        role: participant.role,
        status: participant.status,
      })),
    [participants],
  )
  const ownerDisplayMap = useMemo(
    () => createOwnerDisplayMap(participants),
    [participants],
  )

  const finalizeRealtimeTurn = useCallback(
    (reason, { defaultReason } = {}) => {
      if (!game?.realtime_match) return
      const manager = realtimeManagerRef.current
      if (!manager) return

      const result = manager.completeTurn({
        turnNumber: turn,
        reason: reason || defaultReason || 'unspecified',
        eligibleOwnerIds: deriveEligibleOwnerIds(participants),
      })
      if (!result) return

      applyRealtimeSnapshot(result.snapshot)

      const warningReasonMap = new Map()
      const escalationReasonMap = new Map()

      if (Array.isArray(result.events) && result.events.length) {
        const warningLimitValue = Number.isFinite(Number(result.snapshot?.warningLimit))
          ? Number(result.snapshot.warningLimit)
          : undefined
        const eventEntries = []

        result.events.forEach((event) => {
          if (!event) return
          const ownerId = event.ownerId ? String(event.ownerId).trim() : ''
          if (!ownerId) return

          const info = ownerDisplayMap.get(ownerId)
          const displayName = info?.displayName || `플레이어 ${ownerId.slice(0, 6)}`
          const baseLimit = Number.isFinite(Number(event.limit))
            ? Number(event.limit)
            : warningLimitValue
          const reasonLabel = formatRealtimeReason(event.reason)
          const eventId = event.id || event.eventId || null

          if (event.type === 'warning') {
            if (reasonLabel) {
              warningReasonMap.set(ownerId, reasonLabel)
            }
            const strikeText = Number.isFinite(Number(event.strike))
              ? `${Number(event.strike)}회`
              : '1회'
            const remainingText =
              Number.isFinite(Number(event.remaining)) && Number(event.remaining) > 0
                ? ` (남은 기회 ${Number(event.remaining)}회)`
                : ''
            const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : ''
            eventEntries.push({
              role: 'system',
              content: `⚠️ ${displayName} 경고 ${strikeText}${remainingText}${reasonSuffix}`,
              public: true,
              visibility: 'public',
              extra: {
                eventType: 'warning',
                ownerId,
                strike: Number.isFinite(Number(event.strike))
                  ? Number(event.strike)
                  : null,
                remaining:
                  Number.isFinite(Number(event.remaining)) && Number(event.remaining) >= 0
                    ? Number(event.remaining)
                    : null,
                limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
                reason: event.reason || null,
                turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
                timestamp: Number.isFinite(Number(event.timestamp))
                  ? Number(event.timestamp)
                  : Date.now(),
                eventId,
                status: event.status || null,
              },
            })
          } else if (event.type === 'proxy_escalated') {
            if (reasonLabel) {
              escalationReasonMap.set(ownerId, reasonLabel)
            }
            const strikeText = Number.isFinite(Number(event.strike))
              ? ` (경고 ${Number(event.strike)}회 누적)`
              : ''
            const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : ''
            eventEntries.push({
              role: 'system',
              content: `🚨 ${displayName} 대역 전환${strikeText}${reasonSuffix}`,
              public: true,
              visibility: 'public',
              extra: {
                eventType: 'proxy_escalated',
                ownerId,
                strike: Number.isFinite(Number(event.strike))
                  ? Number(event.strike)
                  : null,
                limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
                reason: event.reason || null,
                turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
                timestamp: Number.isFinite(Number(event.timestamp))
                  ? Number(event.timestamp)
                  : Date.now(),
                status: 'proxy',
                eventId,
              },
            })
          }
        })

        if (eventEntries.length) {
          logTurnEntries({ entries: eventEntries, turnNumber: turn }).catch((error) => {
            console.error('[StartClient] 경고/대역 이벤트 로그 실패:', error)
          })
        }
      }

      if (Array.isArray(result.warnings) && result.warnings.length) {
        const messages = result.warnings
          .map(({ ownerId, strike, remaining, reason: warningReason }) => {
            if (!ownerId) return null
            const normalized = String(ownerId).trim()
            if (!normalized) return null
            const info = ownerDisplayMap.get(normalized)
            const displayName = info?.displayName || `플레이어 ${normalized.slice(0, 6)}`
            const remainText = remaining > 0 ? ` (남은 기회 ${remaining}회)` : ''
            const reasonLabel =
              warningReasonMap.get(normalized) || formatRealtimeReason(warningReason)
            const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : ''
            return `${displayName} 경고 ${strike}회${remainText}${reasonSuffix}`
          })
          .filter(Boolean)

        if (messages.length) {
          setStatusMessage((prev) => {
            const notice = `경고: ${messages.join(', ')} - "다음" 버튼을 눌러 참여해 주세요.`
            if (!prev) return notice
            if (prev.includes(notice)) return prev
            return `${prev}\n${notice}`
          })
        }
      }

      if (Array.isArray(result.escalated) && result.escalated.length) {
        const escalatedSet = new Set(
          result.escalated
            .map((ownerId) => (ownerId ? String(ownerId).trim() : ''))
            .filter(Boolean),
        )
        if (escalatedSet.size) {
          setParticipants((prev) =>
            prev.map((participant) => {
              const ownerId = deriveParticipantOwnerId(participant)
              if (!ownerId) return participant
              const normalized = String(ownerId).trim()
              if (!escalatedSet.has(normalized)) return participant
              const statusValue = String(participant?.status || '').toLowerCase()
              if (statusValue === 'proxy') return participant
              return { ...participant, status: 'proxy' }
            }),
          )
          const names = Array.from(escalatedSet).map((ownerId) => {
            const info = ownerDisplayMap.get(ownerId)
            const displayName = info?.displayName || `플레이어 ${ownerId.slice(0, 6)}`
            const reasonLabel = escalationReasonMap.get(ownerId)
            return reasonLabel ? `${displayName} (${reasonLabel})` : displayName
          })
          setStatusMessage((prev) => {
            const notice = `대역 전환: ${names.join(', ')} – 3회 이상 응답하지 않아 대역으로 교체되었습니다.`
            if (!prev) return notice
            if (prev.includes(notice)) return prev
            return `${prev}\n${notice}`
          })
        }
      }

      return result
    },
    [
      game?.realtime_match,
      applyRealtimeSnapshot,
      logTurnEntries,
      ownerDisplayMap,
      participants,
      setParticipants,
      setStatusMessage,
      turn,
    ],
  )

  const recordTimelineEvents = useCallback(
    (events, { turnNumber: overrideTurn, logEntries = null, buildLogs = true } = {}) => {
      if (!Array.isArray(events) || events.length === 0) return
      setRealtimeEvents((prev) => mergeTimelineEvents(prev, events))

      let entries = logEntries
      if (!entries && buildLogs) {
        const defaultTurn =
          Number.isFinite(Number(overrideTurn)) && Number(overrideTurn) > 0
            ? Number(overrideTurn)
            : Number.isFinite(Number(turn)) && Number(turn) > 0
              ? Number(turn)
              : null
        entries = buildLogEntriesFromEvents(events, {
          ownerDisplayMap,
          defaultTurn,
          defaultMode: game?.realtime_match ? 'realtime' : 'async',
        })
      }

      if (Array.isArray(entries) && entries.length) {
        const effectiveTurn =
          Number.isFinite(Number(overrideTurn)) && Number(overrideTurn) > 0
            ? Number(overrideTurn)
            : Number.isFinite(Number(turn)) && Number(turn) > 0
              ? Number(turn)
              : null
        logTurnEntries({ entries, turnNumber: effectiveTurn }).catch((error) => {
          console.error('[StartClient] 타임라인 이벤트 로그 실패:', error)
        })
      }
    },
    [ownerDisplayMap, game?.realtime_match, turn, logTurnEntries],
  )

  useEffect(() => {
    if (preflight) {
      participantIdSetRef.current = new Set(
        participants.map((participant, index) =>
          String(participant?.id ?? participant?.hero_id ?? index),
        ),
      )
      const resetSnapshot = dropInQueueRef.current?.reset?.()
      if (resetSnapshot && typeof resetSnapshot === 'object') {
        setDropInSnapshot(resetSnapshot)
      } else {
        setDropInSnapshot(null)
      }
      asyncSessionManagerRef.current?.reset()
      return
    }

    participantIdSetRef.current = new Set(
      participants.map((participant, index) =>
        String(participant?.id ?? participant?.hero_id ?? index),
      ),
    )

    const queueService = dropInQueueRef.current
    if (!queueService) return

    const queueResult = queueService.syncParticipants(participants, {
      turnNumber: turn,
      mode: game?.realtime_match ? 'realtime' : 'async',
    })
    if (queueResult && typeof queueResult === 'object') {
      setDropInSnapshot(queueResult.snapshot || null)
    }

    const arrivals = Array.isArray(queueResult?.arrivals)
      ? queueResult.arrivals
      : []

    if (arrivals.length > 0) {
      const service = turnTimerServiceRef.current
      if (service) {
        const hasActiveDeadline = turnDeadline && turnDeadline > Date.now()
        const extraSeconds = service.registerDropInBonus({
          immediate: hasActiveDeadline,
          turnNumber: turn,
        })

        if (extraSeconds > 0 && hasActiveDeadline) {
          setTurnDeadline((prev) => (prev ? prev + extraSeconds * 1000 : prev))
          setTimeRemaining((prev) =>
            typeof prev === 'number' ? prev + extraSeconds : prev,
          )
        }
      }

      setLastDropInTurn(Number.isFinite(Number(turn)) ? Number(turn) : 0)
    }

    let timelineEvents = []

    if (game?.realtime_match) {
      if (arrivals.length) {
        timelineEvents = arrivals.map((arrival) => {
          const status =
            normalizeTimelineStatus(arrival.status) || 'active'
          const cause = arrival.replaced ? 'realtime_drop_in' : 'realtime_joined'
          return {
            type: 'drop_in_joined',
            ownerId: arrival.ownerId ? String(arrival.ownerId).trim() : null,
            status,
            turn: Number.isFinite(Number(arrival.turn))
              ? Number(arrival.turn)
              : Number.isFinite(Number(turn))
                ? Number(turn)
                : null,
            timestamp: arrival.timestamp,
            reason: cause,
            context: {
              role: arrival.role || null,
              heroName: arrival.heroName || null,
              participantId: arrival.participantId ?? null,
              slotIndex: arrival.slotIndex ?? null,
              mode: 'realtime',
              substitution: {
                cause,
                replacedOwnerId: arrival.replaced?.ownerId || null,
                replacedHeroName: arrival.replaced?.heroName || null,
                replacedParticipantId: arrival.replaced?.participantId || null,
                queueDepth:
                  arrival.stats?.queueDepth ?? arrival.stats?.replacements ?? 0,
                arrivalOrder: arrival.stats?.arrivalOrder ?? null,
                totalReplacements: arrival.stats?.replacements ?? 0,
                lastDepartureCause: arrival.stats?.lastDepartureCause || null,
              },
            },
            metadata: queueResult?.matching
              ? { matching: queueResult.matching }
              : null,
          }
        })
      }
    } else if (asyncSessionManagerRef.current) {
      const { events } = asyncSessionManagerRef.current.processQueueResult(
        queueResult,
        { mode: 'async' },
      )
      if (Array.isArray(events) && events.length) {
        timelineEvents = events.map((event) => ({
          ...event,
          metadata:
            event.metadata ||
            (queueResult?.matching ? { matching: queueResult.matching } : null),
        }))
      }
    }

    if (timelineEvents.length) {
      recordTimelineEvents(timelineEvents, { turnNumber: turn })
    }
  }, [
    participants,
    preflight,
    turnDeadline,
    turn,
    recordTimelineEvents,
    game?.realtime_match,
  ])

  const captureBattleLog = useCallback(
    (outcome, { reason, turnNumber: overrideTurn } = {}) => {
      try {
        const finalTurn = Number.isFinite(Number(overrideTurn))
          ? Number(overrideTurn)
          : Number.isFinite(Number(turn))
            ? Number(turn)
            : null
        const draft = buildBattleLogDraft({
          gameId,
          sessionId: sessionInfo?.id || null,
          gameName: game?.name || null,
          result: outcome || 'unknown',
          reason: reason || null,
          logs: logsRef.current || [],
          historyEntries: history.getAll(),
          timelineEvents: realtimeEventsRef.current || [],
          participants,
          realtimePresence,
          dropInSnapshot: dropInSnapshotRef.current || null,
          winCount,
          endTurn: finalTurn,
          endedAt: Date.now(),
        })
        setBattleLogDraft(draft)
      } catch (error) {
        console.warn('[StartClient] 배틀 로그 캡처 실패:', error)
      }
    },
    [
      gameId,
      sessionInfo?.id,
      game?.name,
      participants,
      realtimePresence,
      winCount,
      history,
      turn,
    ],
  )

  const persistBattleLogDraft = useCallback(
    async (draft) => {
      if (!draft || !sessionInfo?.id || !gameId) return
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }
        const token = sessionData?.session?.access_token
        if (!token) {
          throw new Error('세션 토큰을 확인하지 못했습니다.')
        }

        const response = await fetch('/api/rank/save-battle-log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionInfo.id,
            game_id: gameId,
            draft,
          }),
        })

        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(detail || '배틀 로그 저장에 실패했습니다.')
        }
      } catch (error) {
        console.warn('[StartClient] battleLogDraft 저장 실패:', error)
      }
    },
    [gameId, sessionInfo?.id],
  )

  useEffect(() => {
    if (!battleLogDraft) return
    const signature = JSON.stringify({
      session: sessionInfo?.id || null,
      generatedAt: battleLogDraft?.meta?.generatedAt || null,
      result: battleLogDraft?.meta?.result || null,
      endTurn: battleLogDraft?.meta?.endTurn ?? null,
    })
    if (lastBattleLogSignatureRef.current === signature) {
      return
    }
    lastBattleLogSignatureRef.current = signature
    persistBattleLogDraft(battleLogDraft)
  }, [battleLogDraft, persistBattleLogDraft, sessionInfo?.id])

  const {
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    apiKeyCooldown,
    apiKeyWarning,
    evaluateApiKeyCooldown,
    normaliseApiKey,
    effectiveApiKey,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    normalizedGeminiMode,
    normalizedGeminiModel,
    persistApiKeyOnServer,
    applyCooldownInfo,
  } = useStartApiKeyManager({
    initialApiKey: initialStoredApiKey,
    initialApiVersion,
    initialGeminiConfig,
    viewerId,
    turn,
    recordTimelineEvents,
  })

  const { ensureApiKeyReady, voidSession } = useStartCooldown({
    evaluateApiKeyCooldown,
    applyCooldownInfo,
    setStatusMessage,
    setGameVoided,
    setCurrentNodeId,
    setTurnDeadline,
    setTimeRemaining,
    clearConsensusVotes,
    updateHeroAssets,
    updateSessionRecord,
    clearSessionRecord,
    viewerId,
    apiVersion,
    gameId,
    game,
    sessionInfo,
    onSessionVoided: (payload = {}) => {
      const reason =
        payload?.options?.reason ||
        payload?.reason ||
        payload?.options?.message ||
        'void'
      captureBattleLog('void', { reason, turnNumber: turn })
    },
  })

  useStartSessionWatchdog({
    enabled: !preflight && !!sessionInfo?.id && !!currentNodeId && !gameVoided,
    turn,
    historyVersion,
    logsLength: Array.isArray(logs) ? logs.length : 0,
    timelineVersion: Array.isArray(realtimeEvents) ? realtimeEvents.length : 0,
    turnDeadline,
    turnTimerSeconds,
    isAdvancing,
    gameVoided,
    currentNodeId,
    voidSession,
    recordTimelineEvents,
    sessionInfo,
    gameId,
  })

  const visitedSlotIds = useRef(new Set())
  const apiVersionLock = useRef(null)
  const advanceIntentRef = useRef(null)



  useEffect(() => {
    if (matchMetaLoggedRef.current) return
    const meta = startMatchMetaRef.current
    if (!meta) return
    if (preflight) return
    const metadata = {
      matching: {
        source: meta.source || 'client_start',
        matchType: meta.matchType || null,
        matchCode: meta.matchCode || null,
        dropInTarget: meta.dropInTarget || null,
        dropInMeta: meta.dropInMeta || null,
        sampleMeta: meta.sampleMeta || null,
        roleStatus: meta.roleStatus || null,
        assignments: Array.isArray(meta.assignments) ? meta.assignments : [],
        storedAt: meta.storedAt || Date.now(),
        mode: meta.mode || null,
        turnTimer: meta.turnTimer || null,
      },
    }
    recordTimelineEvents(
      [
        {
          type: 'drop_in_matching_context',
          ownerId: null,
          reason: metadata.matching.matchType || 'matched',
          turn: 0,
          timestamp: metadata.matching.storedAt,
          context: { actorLabel: '시스템', matchType: metadata.matching.matchType || null },
          metadata,
        },
      ],
      { turnNumber: 0 },
    )
    matchMetaLoggedRef.current = true
  }, [preflight, recordTimelineEvents])
  const normalizedViewerId = useMemo(() => {
    if (!viewerId) return ''
    return String(viewerId).trim()
  }, [viewerId])
  const eligibleOwnerIds = consensusState?.eligibleOwnerIds || []
  const consentedOwnerIds = consensusState?.consentedOwnerIds || []
  const consensusCount = consensusState?.consensusCount || 0
  const needsConsensus = !preflight && Boolean(consensusState?.needsConsensus)
  const viewerCanConsent =
    needsConsensus && normalizedViewerId
      ? eligibleOwnerIds.includes(normalizedViewerId)
      : false
  const viewerHasConsented =
    viewerCanConsent && consentedOwnerIds.includes(normalizedViewerId)
  const currentNode = useMemo(
    () => graph.nodes.find((node) => node.id === currentNodeId) || null,
    [graph.nodes, currentNodeId],
  )
  const aiMemory = useMemo(
    () => history.getAiMemory({ last: 24 }),
    [history, historyVersion],
  )
  const playerHistories = useMemo(
    () =>
      participants.map((participant, index) => ({
        slotIndex: index,
        role: participant?.role || '',
        heroName:
          participant?.hero?.name ||
          participant?.hero_name ||
          participant?.heroName ||
          '',
        entries: history.getVisibleForSlot(index, { onlyPublic: true, last: 10 }),
      })),
    [participants, history, historyVersion],
  )
  const currentActorContext = useMemo(
    () => resolveActorContext({ node: currentNode, slots, participants }),
    [currentNode, slots, participants],
  )
  const slotType = currentNode?.slot_type || 'ai'
  const isUserActionSlot = slotType === 'user_action' || slotType === 'manual'
  const viewerOwnsSlot =
    isUserActionSlot && viewerId && currentActorContext?.participant?.owner_id === viewerId
  const canSubmitAction = !isUserActionSlot || viewerOwnsSlot
  const currentActorInfo = useMemo(
    () => ({
      slotIndex: currentActorContext?.slotIndex ?? null,
      role:
        currentActorContext?.participant?.role ||
        currentActorContext?.heroSlot?.role ||
        '',
      name:
        currentActorContext?.participant?.hero?.name ||
        currentActorContext?.heroSlot?.name ||
        '',
      isUserAction: isUserActionSlot,
    }),
    [currentActorContext, isUserActionSlot],
  )

  const viewerParticipant = useMemo(() => {
    if (!viewerId) return null
    return (
      participants.find((participant) => {
        const ownerId =
          participant?.owner_id ||
          participant?.ownerId ||
          participant?.ownerID ||
          participant?.owner?.id ||
          null
        return ownerId === viewerId
      }) || null
    )
  }, [participants, viewerId])

  const bootLocalSession = useCallback(() => {
    if (graph.nodes.length === 0) {
      setStatusMessage('시작할 프롬프트 세트를 찾을 수 없습니다.')
      return
    }

    const startNode = graph.nodes.find((node) => node.is_start) || graph.nodes[0]
    history.beginSession()
    bumpHistoryVersion()
    if (systemPrompt) {
      history.push({ role: 'system', content: systemPrompt, public: false })
    }

    if (realtimeManagerRef.current) {
      const manager = realtimeManagerRef.current
      manager.reset()
      if (game?.realtime_match) {
        manager.syncParticipants(participants)
        if (viewerId) {
          manager.setManagedOwners([String(viewerId).trim()])
        } else {
          manager.setManagedOwners([])
        }
        manager.beginTurn({
          turnNumber: 1,
          eligibleOwnerIds: deriveEligibleOwnerIds(participants),
        })
      }
      applyRealtimeSnapshot(manager.getSnapshot())
    }

    visitedSlotIds.current = new Set()
    apiVersionLock.current = null
    turnTimerServiceRef.current?.configureBase(turnTimerSeconds)
    turnTimerServiceRef.current?.reset()
    dropInQueueRef.current?.reset()
    asyncSessionManagerRef.current?.reset()
    participantIdSetRef.current = new Set(
      participants.map((participant, index) =>
        String(participant?.id ?? participant?.hero_id ?? index),
      ),
    )
    lastScheduledTurnRef.current = 0
    setPreflight(false)
    setGameVoided(false)
    setTurn(1)
    setLogs(() => {
      logsRef.current = []
      return []
    })
    setBattleLogDraft(null)
    setWinCount(0)
    setLastDropInTurn(null)
    setActiveGlobal([])
    setActiveLocal([])
    setStatusMessage('게임이 시작되었습니다.')
    const startContext = resolveActorContext({ node: startNode, slots, participants })
    const startNames = startContext?.participant?.hero?.name
      ? [startContext.participant.hero.name]
      : startContext?.heroSlot?.name
      ? [startContext.heroSlot.name]
      : []
    updateHeroAssets(startNames, startContext)
    rememberActiveSession({
      turn: 1,
      actorNames: startNames,
      status: 'active',
      defeated: false,
    })
    setTurnDeadline(null)
    setTimeRemaining(null)
    clearConsensusVotes()
    setCurrentNodeId(startNode.id)
  }, [
    graph.nodes,
    history,
    systemPrompt,
    slots,
    participants,
    updateHeroAssets,
    rememberActiveSession,
    turnTimerSeconds,
    game?.realtime_match,
    viewerId,
    applyRealtimeSnapshot,
  ])

  const handleStart = useCallback(async () => {
    if (graph.nodes.length === 0) {
      setStatusMessage('시작할 프롬프트 세트를 찾을 수 없습니다.')
      return
    }

    if (startingSession) {
      return
    }

    if (!gameId) {
      setStatusMessage('게임 정보를 찾을 수 없습니다.')
      return
    }

    if (effectiveApiKey) {
      if (!ensureApiKeyReady(effectiveApiKey)) {
        return
      }

          await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
            geminiMode: normalizedGeminiMode,
            geminiModel: normalizedGeminiModel,
          })
    }

    setStartingSession(true)
    setStatusMessage('세션을 준비하는 중입니다…')

    let sessionReady = false

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw sessionError
      }

      const token = sessionData?.session?.access_token
      if (!token) {
        throw new Error('세션 정보가 만료되었습니다. 다시 로그인해 주세요.')
      }

      const response = await fetch('/api/rank/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          mode: game?.realtime_match ? 'realtime' : 'manual',
          role: viewerParticipant?.role || null,
          match_code: null,
        }),
      })

      let payload = {}
      try {
        payload = await response.json()
      } catch (error) {
        payload = {}
      }

      if (!response.ok) {
        const message = payload?.error || payload?.detail || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        throw new Error(message)
      }

      if (!payload?.ok) {
        const message = payload?.error || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        throw new Error(message)
      }

      const sessionPayload = payload?.session || null
      if (!sessionPayload?.id) {
        throw new Error('세션 정보를 받지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }

      setSessionInfo({
        id: sessionPayload.id,
        status: sessionPayload.status || 'active',
        createdAt: sessionPayload.created_at || null,
        reused: Boolean(sessionPayload.reused),
      })

      sessionReady = true
    } catch (error) {
      console.error('세션 준비 실패:', error)
      const message =
        error?.message || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setStatusMessage(message)
    } finally {
      setStartingSession(false)
    }

    if (!sessionReady) {
      return
    }

    bootLocalSession()
  }, [
    apiVersion,
    bootLocalSession,
    game?.realtime_match,
    gameId,
    graph.nodes,
    startingSession,
    viewerParticipant?.role,
    effectiveApiKey,
    ensureApiKeyReady,
    persistApiKeyOnServer,
    normalizedGeminiMode,
    normalizedGeminiModel,
  ])

  const advanceTurn = useCallback(
    async (overrideResponse = null, options = {}) => {
      if (preflight) {
        setStatusMessage('먼저 "게임 시작"을 눌러 주세요.')
        return
      }
      if (!currentNodeId) {
        setStatusMessage('진행 가능한 노드가 없습니다.')
        return
      }

      const node = graph.nodes.find((entry) => entry.id === currentNodeId)
      if (!node) {
        setStatusMessage('현재 노드 정보를 찾을 수 없습니다.')
        return
      }

      if (gameVoided) {
        setStatusMessage('게임이 무효 처리되어 더 이상 진행할 수 없습니다.')
        return
      }

      const advanceReason =
        typeof options?.reason === 'string' && options.reason.trim()
          ? options.reason.trim()
          : 'unspecified'

      const actorContext = resolveActorContext({ node, slots, participants })
      const slotBinding = resolveSlotBinding({ node, actorContext })
      const slotTypeValue = node.slot_type || 'ai'
      const isUserAction = slotTypeValue === 'user_action' || slotTypeValue === 'manual'
      const historyRole = isUserAction ? 'user' : 'assistant'
      const actingOwnerId = actorContext?.participant?.owner_id || null

      const recordRealtimeParticipation = (ownerId, type) => {
        if (!game?.realtime_match) return
        if (!ownerId) return
        const manager = realtimeManagerRef.current
        if (!manager) return
        const snapshot = manager.recordParticipation(ownerId, turn, { type })
        applyRealtimeSnapshot(snapshot)
      }

      if (isUserAction && (!viewerId || actingOwnerId !== viewerId)) {
        setStatusMessage('현재 차례의 플레이어만 행동을 제출할 수 있습니다.')
        return
      }

      if (isUserAction && actingOwnerId) {
        recordRealtimeParticipation(actingOwnerId, 'action')
      }

      setIsAdvancing(true)
      setStatusMessage('')
      setTurnDeadline(null)
      setTimeRemaining(null)

      try {
        const compiled = makeNodePrompt({
          node,
          slots,
          historyText: history.joinedText({ onlyPublic: false, last: 12 }),
          activeGlobalNames: activeGlobal,
          activeLocalNames: activeLocal,
          currentSlot: slotBinding.templateSlotRef,
        })

        const promptText = compiled.text
        if (compiled.pickedSlot != null) {
          visitedSlotIds.current.add(String(compiled.pickedSlot))
        }

        let responseText =
          typeof overrideResponse === 'string'
            ? overrideResponse.trim()
            : manualResponse.trim()

        let loggedByServer = false
        let loggedTurnNumber = null
        let serverSummary = null

        let effectiveSystemPrompt = systemPrompt
        let effectivePrompt = promptText

        if (!game?.realtime_match && isUserAction) {
          const persona = buildUserActionPersona(actorContext)
          effectiveSystemPrompt = [systemPrompt, persona.system]
            .filter(Boolean)
            .join('\n\n')
          effectivePrompt = persona.prompt ? `${persona.prompt}\n\n${promptText}` : promptText
        }

        if (!responseText) {
          if (!effectiveApiKey) {
            setStatusMessage('AI API 키가 입력되지 않았습니다. 왼쪽 패널에서 키를 입력한 뒤 다시 시도해 주세요.')
            return
          }

          if (game?.realtime_match) {
            if (
              apiVersionLock.current &&
              apiVersionLock.current !== apiVersion
            ) {
              throw new Error(
                '실시간 매칭에서는 처음 선택한 API 버전을 변경할 수 없습니다.',
              )
            }
          }

          if (!sessionInfo?.id) {
            throw new Error('세션 정보를 확인할 수 없습니다. 페이지를 새로고침해 주세요.')
          }

          if (!ensureApiKeyReady(effectiveApiKey)) {
            return
          }

          await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
            geminiMode: normalizedGeminiMode,
            geminiModel: normalizedGeminiModel,
          })

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) {
            throw sessionError
          }

          const token = sessionData?.session?.access_token
          if (!token) {
            throw new Error('세션 토큰을 확인할 수 없습니다.')
          }

          const res = await fetch('/api/rank/run-turn', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              apiKey: effectiveApiKey,
              system: effectiveSystemPrompt,
              prompt: effectivePrompt,
              apiVersion,
              geminiMode: apiVersion === 'gemini' ? normalizedGeminiMode : undefined,
              geminiModel: apiVersion === 'gemini' ? normalizedGeminiModel : undefined,
              session_id: sessionInfo.id,
              game_id: gameId,
              prompt_role: 'system',
              response_role: historyRole,
              response_public: true,
            }),
          })

          let payload = {}
          try {
            payload = await res.json()
          } catch (error) {
            payload = {}
          }

          if (!res.ok) {
            const error = new Error(
              payload?.error || payload?.detail || 'AI 호출에 실패했습니다.',
            )
            if (payload?.error) {
              error.code = payload.error
            }
            if (typeof payload?.detail === 'string' && payload.detail.trim()) {
              error.detail = payload.detail.trim()
            }
            throw error
          }

          if (payload?.error) {
            const error = new Error(payload.error)
            error.code = payload.error
            throw error
          }

          responseText =
            (typeof payload?.text === 'string' && payload.text.trim()) ||
            payload?.choices?.[0]?.message?.content ||
            payload?.content ||
            ''

          if (payload?.logged) {
            loggedByServer = true
            const numericTurn = Number(payload?.turn_number)
            if (Number.isFinite(numericTurn)) {
              loggedTurnNumber = numericTurn
            }
            if (Array.isArray(payload?.entries)) {
              const responseEntry = payload.entries.find(
                (entry) => entry?.role === historyRole,
              )
              if (responseEntry?.summary_payload) {
                try {
                  serverSummary = JSON.parse(JSON.stringify(responseEntry.summary_payload))
                } catch (error) {
                  serverSummary = responseEntry.summary_payload
                }
              }
            }
          }

          if (game?.realtime_match && !apiVersionLock.current) {
            apiVersionLock.current = apiVersion
          }
        }

        if (!responseText) {
          responseText = ['(샘플 응답)', '', '', '', '', '무승부'].join('\n')
        }

        const slotIndex = slotBinding.slotIndex
        const promptAudiencePayload =
          slotBinding.promptAudience.audience === 'slots'
            ? { audience: 'slots', slots: slotBinding.visibleSlots }
            : { audience: 'all' }
        const responseAudiencePayload =
          slotBinding.responseAudience.audience === 'slots'
            ? { audience: 'slots', slots: slotBinding.visibleSlots }
            : { audience: 'all' }
        const responseIsPublic = !slotBinding.hasLimitedAudience
        const promptVisibility = slotBinding.hasLimitedAudience ? 'private' : 'hidden'
        const responseVisibility = responseIsPublic ? 'public' : 'private'

        const fallbackActorNames = []
        if (actorContext?.participant?.hero?.name) {
          fallbackActorNames.push(actorContext.participant.hero.name)
        } else if (actorContext?.heroSlot?.name) {
          fallbackActorNames.push(actorContext.heroSlot.name)
        }

        const promptEntry = history.push({
          role: 'system',
          content: `[PROMPT]\n${effectivePrompt}`,
          public: false,
          includeInAi: true,
          ...promptAudiencePayload,
          meta: { slotIndex },
        })
        const responseEntry = history.push({
          role: historyRole,
          content: responseText,
          public: responseIsPublic,
          includeInAi: true,
          ...responseAudiencePayload,
          meta: { slotIndex },
        })
        bumpHistoryVersion()

        const outcome = parseOutcome(responseText)
        const resolvedActorNames =
          outcome.actors && outcome.actors.length ? outcome.actors : fallbackActorNames
        updateHeroAssets(resolvedActorNames, actorContext)
        if (promptEntry?.meta) {
          promptEntry.meta = { ...promptEntry.meta, actors: resolvedActorNames }
        }
        if (responseEntry?.meta) {
          responseEntry.meta = { ...responseEntry.meta, actors: resolvedActorNames }
        }
        const nextActiveGlobal = Array.from(
          new Set([...activeGlobal, ...(outcome.variables || [])]),
        )

        let fallbackSummary = null
        if (!loggedByServer) {
          fallbackSummary = {
            preview: responseText.slice(0, 240),
            promptPreview: promptText.slice(0, 240),
            outcome: {
              lastLine: outcome.lastLine || undefined,
              variables: outcome.variables && outcome.variables.length ? outcome.variables : undefined,
              actors: resolvedActorNames && resolvedActorNames.length ? resolvedActorNames : undefined,
            },
            extra: {
              slotIndex,
              nodeId: node?.id ?? null,
              source: 'fallback-log',
            },
          }

          await logTurnEntries({
            entries: [
              {
                role: promptEntry?.role || 'system',
                content: promptEntry?.content || promptText,
                public: promptEntry?.public,
                visibility: slotBinding.hasLimitedAudience
                  ? promptVisibility
                  : promptEntry?.public === false
                    ? 'hidden'
                    : 'public',
                extra: { slotIndex },
              },
              {
                role: historyRole,
                content: responseText,
                public: responseEntry?.public,
                visibility: responseIsPublic ? 'public' : responseVisibility,
                actors: resolvedActorNames,
                summary: fallbackSummary,
                extra: {
                  slotIndex,
                  nodeId: node?.id ?? null,
                },
              },
            ],
            turnNumber: loggedTurnNumber ?? turn,
          })
        }

        setActiveLocal(outcome.variables || [])
        setActiveGlobal(nextActiveGlobal)

        const context = createBridgeContext({
          turn,
          historyUserText: history.joinedText({ onlyPublic: true, last: 5 }),
          historyAiText: history.joinedText({ onlyPublic: false, last: 5 }),
          visitedSlotIds: visitedSlotIds.current,
          participantsStatus,
          activeGlobalNames: nextActiveGlobal,
          activeLocalNames: outcome.variables || [],
          currentRole:
            actorContext?.participant?.role || actorContext?.heroSlot?.role || null,
          sessionFlags: {
            brawlEnabled,
            gameVoided,
            winCount,
            lastDropInTurn,
            endTriggered: triggeredEnd,
            dropInGraceTurns: 0,
          },
        })

        const outgoing = graph.edges.filter(
          (edge) => edge.from === String(node.id) || edge.from === node.id,
        )
        const chosenEdge = pickNextEdge(outgoing, context)

        setLogs((prev) => {
          const nextLogs = [
            ...prev,
            {
              turn,
              nodeId: node.id,
              slotIndex,
              promptAudience: slotBinding.promptAudience,
              responseAudience: slotBinding.responseAudience,
              prompt: promptText,
              response: responseText,
              outcome: outcome.lastLine || '',
              variables: outcome.variables || [],
              next: chosenEdge?.to || null,
              action: chosenEdge?.data?.action || 'continue',
              actors: resolvedActorNames,
              summary: serverSummary || fallbackSummary || null,
            },
          ]
          logsRef.current = nextLogs
          return nextLogs
        })

        clearManualResponse()

        if (!chosenEdge) {
          finalizeRealtimeTurn('no-bridge', { defaultReason: advanceReason })
          setCurrentNodeId(null)
          setStatusMessage('더 이상 진행할 경로가 없어 세션을 종료합니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          captureBattleLog('terminated', { reason: 'no_path', turnNumber: turn })
          clearSessionRecord()
          return
        }

        const action = chosenEdge.data?.action || 'continue'
        const nextNodeId = chosenEdge.to != null ? String(chosenEdge.to) : null

        const outcomeVariables = outcome.variables || []
        const triggeredEnd = endConditionVariable
          ? outcomeVariables.includes(endConditionVariable)
          : false

        if (action === 'win') {
          const upcomingWin = winCount + 1
          if (brawlEnabled && !triggeredEnd) {
            setWinCount((prev) => prev + 1)
            setStatusMessage(`승리 ${upcomingWin}회 달성! 난입 허용 규칙으로 전투가 계속됩니다.`)
          } else {
            if (brawlEnabled) {
              setWinCount(() => upcomingWin)
            }
            finalizeRealtimeTurn('win', { defaultReason: advanceReason })
            setCurrentNodeId(null)
            const suffix = brawlEnabled
              ? ` 누적 승리 ${upcomingWin}회를 기록했습니다.`
              : ''
            setStatusMessage(`승리 조건이 충족되었습니다!${suffix}`)
            setTurnDeadline(null)
            setTimeRemaining(null)
            captureBattleLog('win', { reason: 'win', turnNumber: turn })
            clearSessionRecord()
            return
          }
        } else if (action === 'lose') {
          finalizeRealtimeTurn('lose', { defaultReason: advanceReason })
          setCurrentNodeId(null)
          setStatusMessage(
            brawlEnabled
              ? '패배로 해당 역할군이 전장에서 추방되었습니다.'
              : '패배 조건이 충족되었습니다.',
          )
          setTurnDeadline(null)
          setTimeRemaining(null)
          captureBattleLog('lose', { reason: 'lose', turnNumber: turn })
          if (viewerId && actingOwnerId === viewerId) {
            markSessionDefeated()
          } else {
            clearSessionRecord()
          }
          return
        } else if (action === 'draw') {
          finalizeRealtimeTurn('draw', { defaultReason: advanceReason })
          setCurrentNodeId(null)
          setStatusMessage('무승부로 종료되었습니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          captureBattleLog('draw', { reason: 'draw', turnNumber: turn })
          clearSessionRecord()
          return
        }

        if (!nextNodeId) {
          finalizeRealtimeTurn('missing-next', { defaultReason: advanceReason })
          setCurrentNodeId(null)
          setStatusMessage('다음에 진행할 노드를 찾을 수 없습니다.')
          setTurnDeadline(null)
          setTimeRemaining(null)
          captureBattleLog('terminated', { reason: 'missing_next', turnNumber: turn })
          clearSessionRecord()
          return
        }

        finalizeRealtimeTurn('continue', { defaultReason: advanceReason })
        setCurrentNodeId(nextNodeId)
        setTurn((prev) => prev + 1)
      } catch (err) {
        console.error(err)
        if (isApiKeyError(err)) {
          const reason = err?.code || 'api_key_error'
          const fallback =
            reason === 'quota_exhausted'
              ? '사용 중인 API 키 한도가 모두 소진되어 세션이 무효 처리되었습니다. 새 키를 등록해 주세요.'
              : reason === 'missing_user_api_key'
              ? 'AI API 키가 입력되지 않아 세션이 중단되었습니다. 왼쪽 패널에서 키를 입력한 뒤 다시 시도해 주세요.'
              : err?.message || 'API 키 오류로 세션이 무효 처리되었습니다.'
          voidSession(fallback, {
            apiKey: effectiveApiKey,
            reason,
            provider: apiVersion,
            viewerId,
            gameId,
            sessionId: sessionInfo?.id || null,
            note: err?.message || null,
          })
        } else {
          setStatusMessage(err?.message || '턴 진행 중 오류가 발생했습니다.')
        }
      } finally {
        setIsAdvancing(false)
      }
    },
    [
      preflight,
      currentNodeId,
      graph.nodes,
      graph.edges,
      slots,
      history,
      activeGlobal,
      activeLocal,
      manualResponse,
      effectiveApiKey,
      apiVersion,
      systemPrompt,
      turn,
      participants,
      participantsStatus,
      game?.realtime_match,
      brawlEnabled,
      endConditionVariable,
      winCount,
      lastDropInTurn,
      viewerId,
      updateHeroAssets,
      logTurnEntries,
      voidSession,
      gameVoided,
      ensureApiKeyReady,
      persistApiKeyOnServer,
      normalizedGeminiMode,
      normalizedGeminiModel,
      applyRealtimeSnapshot,
      finalizeRealtimeTurn,
    ],
  )

  const advanceWithManual = useCallback(() => {
    const trimmed = requireManualResponse()
    if (!trimmed) {
      return
    }
    advanceIntentRef.current = null
    clearConsensusVotes()
    advanceTurn(trimmed, { reason: 'manual' })
  }, [advanceTurn, clearConsensusVotes, requireManualResponse])

  const advanceWithAi = useCallback(() => {
    if (!needsConsensus) {
      if (game?.realtime_match && normalizedViewerId) {
        const manager = realtimeManagerRef.current
        if (manager) {
          const snapshot = manager.recordParticipation(normalizedViewerId, turn, {
            type: 'vote',
          })
          if (snapshot) {
            applyRealtimeSnapshot(snapshot)
          }
        }
      }
      advanceIntentRef.current = null
      clearConsensusVotes()
      advanceTurn(null, { reason: 'ai' })
      return
    }
    if (!viewerCanConsent) {
      setStatusMessage('동의 대상인 참가자만 다음 턴 진행을 제안할 수 있습니다.')
      return
    }
    const controller = turnVoteControllerRef.current
    if (!controller) {
      return
    }
    if (game?.realtime_match && normalizedViewerId) {
      const manager = realtimeManagerRef.current
      if (manager) {
        const snapshot = manager.recordParticipation(normalizedViewerId, turn, {
          type: 'vote',
        })
        if (snapshot) {
          applyRealtimeSnapshot(snapshot)
        }
      }
    }
    advanceIntentRef.current = { override: null, reason: 'consensus' }
    let snapshot = controller.getSnapshot()
    if (!controller.hasConsented(normalizedViewerId)) {
      snapshot = controller.registerConsent(normalizedViewerId)
    }
    setConsensusState(snapshot)
    const { consensusCount: futureCount, threshold } = snapshot
    setStatusMessage(`다음 턴 동의 ${futureCount}/${threshold}명`)
  }, [
    advanceTurn,
    clearConsensusVotes,
    needsConsensus,
    setStatusMessage,
    viewerCanConsent,
    normalizedViewerId,
    game?.realtime_match,
    turn,
    applyRealtimeSnapshot,
  ])

  const autoAdvance = useCallback(() => {
    advanceIntentRef.current = null
    clearConsensusVotes()
    const turnNumber = Number.isFinite(Number(turn)) ? Number(turn) : null
    recordTimelineEvents(
      [
        {
          type: 'turn_timeout',
          turn: turnNumber,
          timestamp: Date.now(),
          reason: 'timeout',
          context: {
            mode: game?.realtime_match ? 'realtime' : 'async',
          },
        },
      ],
      { turnNumber },
    )
    return advanceTurn(null, { reason: 'timeout' })
  }, [advanceTurn, clearConsensusVotes, recordTimelineEvents, turn, game?.realtime_match])

  useEffect(() => {
    if (!needsConsensus) return undefined
    if (!advanceIntentRef.current) return undefined
    if (!consensusState?.hasReachedThreshold) return undefined
    const turnNumber = Number.isFinite(Number(turn)) ? Number(turn) : null
    recordTimelineEvents(
      [
        {
          type: 'consensus_reached',
          turn: turnNumber,
          timestamp: Date.now(),
          reason: 'consensus',
          context: {
            consensusCount: consensusState?.consensusCount ?? null,
            threshold: consensusState?.threshold ?? null,
            mode: game?.realtime_match ? 'realtime' : 'async',
          },
        },
      ],
      { turnNumber },
    )
    const intent = advanceIntentRef.current
    advanceIntentRef.current = null
    clearConsensusVotes()
    advanceTurn(intent?.override ?? null, { reason: intent?.reason || 'consensus' })
    return undefined
  }, [
    advanceTurn,
    consensusState?.hasReachedThreshold,
    needsConsensus,
    clearConsensusVotes,
    recordTimelineEvents,
    consensusState?.consensusCount,
    consensusState?.threshold,
    game?.realtime_match,
    turn,
  ])

  useEffect(() => {
    if (preflight || !game?.realtime_match) {
      const snapshot = turnVoteControllerRef.current?.syncEligibleOwners([])
      if (snapshot) {
        setConsensusState(snapshot)
      }
      return
    }
    const snapshot = turnVoteControllerRef.current?.syncEligibleOwners(
      deriveEligibleOwnerIds(participants),
    )
    if (snapshot) {
      setConsensusState(snapshot)
    }
  }, [participants, game?.realtime_match, preflight])

  useEffect(() => {
    if (preflight) {
      advanceIntentRef.current = null
      clearConsensusVotes()
    }
  }, [preflight, clearConsensusVotes])

  useEffect(() => {
    advanceIntentRef.current = null
    clearConsensusVotes()
  }, [turn, clearConsensusVotes])

  useEffect(() => {
    const sessionId = sessionInfo?.id
    if (!sessionId) return undefined

    const channel = supabase.channel(`rank-session:${sessionId}`, {
      config: { broadcast: { ack: true } },
    })

    const handleTimeline = (payload) => {
      const raw = payload?.payload || payload || {}
      const events = Array.isArray(raw.events) ? raw.events : []
      if (!events.length) return
      setRealtimeEvents((prev) => mergeTimelineEvents(prev, events))
    }

    channel.on('broadcast', { event: 'rank:timeline-event' }, handleTimeline)

    try {
      channel.subscribe((status) => {
        if (!status || status === 'SUBSCRIBED') {
          return
        }
        const logger = status === 'CHANNEL_ERROR' ? 'error' : 'warn'
        console[logger](
          '[StartClient] 실시간 타임라인 채널 상태:',
          status,
        )
      })
    } catch (error) {
      console.error('[StartClient] 실시간 타임라인 채널 구독 실패:', error)
    }

    return () => {
      try {
        channel.unsubscribe()
      } catch (error) {
        console.warn('[StartClient] 실시간 타임라인 채널 해제 실패:', error)
      }
      supabase.removeChannel(channel)
    }
  }, [sessionInfo?.id, supabase])

  useEffect(() => {
    if (!needsConsensus) {
      const intent = advanceIntentRef.current
      advanceIntentRef.current = null
      if (intent) {
        clearConsensusVotes()
        advanceTurn(intent?.override ?? null, {
          reason: intent?.reason || 'consensus',
        })
      }
    }
  }, [needsConsensus, advanceTurn, clearConsensusVotes])

  return {
    loading,
    error,
    game,
    participants,
    currentNode,
    preflight,
    turn,
    activeGlobal,
    activeLocal,
    statusMessage,
    promptMetaWarning,
    apiKeyWarning,
    logs,
    aiMemory,
    playerHistories,
    battleLogDraft,
    apiKey,
    setApiKey,
    apiKeyCooldown,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    manualResponse,
    setManualResponse,
    isAdvancing,
    isStarting: startingSession,
    handleStart,
    advanceWithAi,
    advanceWithManual,
    autoAdvance,
    turnTimerSeconds,
    timeRemaining,
    currentActor: currentActorInfo,
    canSubmitAction,
    activeBackdropUrls: activeHeroAssets.backgrounds,
    activeActorNames,
    activeBgmUrl: activeHeroAssets.bgmUrl,
    activeBgmDuration: activeHeroAssets.bgmDuration,
    activeAudioProfile: activeHeroAssets.audioProfile,
    sessionInfo,
    realtimePresence,
    realtimeEvents,
    dropInSnapshot,
    consensus: {
      required: eligibleOwnerIds.length,
      count: consensusCount,
      viewerEligible: viewerCanConsent,
      viewerHasConsented,
      active: needsConsensus,
      threshold: consensusState?.threshold ?? Math.max(1, Math.ceil(eligibleOwnerIds.length * 0.8)),
      reached: Boolean(consensusState?.hasReachedThreshold),
    },
  }
}
