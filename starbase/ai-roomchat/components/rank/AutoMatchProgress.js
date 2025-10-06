'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import useMatchQueue from './hooks/useMatchQueue'
import usePersistApiKey from './hooks/usePersistApiKey'
import styles from './AutoMatchProgress.module.css'
import {
  HERO_BLOCKER_MESSAGE,
  HERO_REDIRECT_DELAY_MS,
  MATCH_TRANSITION_DELAY_MS,
  QUEUE_TIMEOUT_MS,
  MATCH_INACTIVITY_TIMEOUT_MS,
  CONFIRMATION_WINDOW_SECONDS,
  FAILURE_REDIRECT_DELAY_MS,
  PENALTY_NOTICE,
  ROLE_BLOCKER_MESSAGE,
  VIEWER_BLOCKER_MESSAGE,
} from './matchConstants'
import {
  coerceHeroMap,
  extractHeroIdsFromAssignments,
  resolveMemberLabel,
} from './matchUtils'
import { clearMatchConfirmation, saveMatchConfirmation } from './matchStorage'
import { buildMatchMetaPayload, readStoredStartConfig, storeStartMatchMeta } from './startConfig'
import {
  START_SESSION_KEYS,
  readStartSessionValue,
  writeStartSessionValue,
} from '../../lib/rank/startSessionChannel'
import {
  registerMatchConnections,
  removeConnectionEntries,
} from '../../lib/rank/startConnectionRegistry'
import { supabase } from '../../lib/supabase'

function resolveRoleName(lockedRole, roles) {
  if (lockedRole && typeof lockedRole === 'string' && lockedRole.trim().length) {
    return lockedRole
  }
  if (!Array.isArray(roles)) return ''
  for (const role of roles) {
    if (!role) continue
    if (typeof role === 'string') {
      const trimmed = role.trim()
      if (trimmed) return trimmed
      continue
    }
    if (typeof role === 'object' && typeof role.name === 'string') {
      const trimmed = role.name.trim()
      if (trimmed) return trimmed
    }
  }
  return ''
}

export default function AutoMatchProgress({ gameId, mode, initialHeroId }) {
  const router = useRouter()
  const navigationLockedRef = useRef(false)
  const apiKeyExpiredHandledRef = useRef(false)
  const apiKeyExpiredHandlerRef = useRef(null)
  const apiKeyExpiredProxy = useCallback((info) => {
    const handler = apiKeyExpiredHandlerRef.current
    if (typeof handler === 'function') {
      handler(info)
    }
  }, [])
  useEffect(() => {
    apiKeyExpiredHandledRef.current = false
  }, [gameId])
  const { state, actions } = useMatchQueue({
    gameId,
    mode,
    enabled: Boolean(gameId),
    initialHeroId,
    onApiKeyExpired: apiKeyExpiredProxy,
  })
  const [joinError, setJoinError] = useState('')
  const joinSignatureRef = useRef('')
  const heroRedirectTimerRef = useRef(null)
  const queueTimeoutRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const dropInRedirectTimerRef = useRef(null)
  const latestStatusRef = useRef('idle')
  const confirmationTimerRef = useRef(null)
  const confirmationIntervalRef = useRef(null)
  const penaltyRedirectRef = useRef(null)
  const joinRetryTimerRef = useRef(null)
  const confirmButtonRef = useRef(null)
  const [confirmationState, setConfirmationState] = useState('idle')
  const [confirmationRemaining, setConfirmationRemaining] = useState(
    CONFIRMATION_WINDOW_SECONDS,
  )
  const [confirming, setConfirming] = useState(false)
  const [turnTimer, setTurnTimer] = useState(null)
  const previousStatusRef = useRef(state.status)
  const blockersRef = useRef([])
  const previousConfirmationRef = useRef('idle')
  const latestConfirmationRef = useRef('idle')
  const joinErrorRef = useRef('')
  const joinAttemptCountRef = useRef(0)
  const queueJoinStartedAtRef = useRef(null)
  const playTriggeredRef = useRef(false)
  const [playNotice, setPlayNotice] = useState('')
  const [displayStatus, setDisplayStatus] = useState(state.status)
  const [matchLocked, setMatchLocked] = useState(false)
  const matchLockedRef = useRef(false)
  const matchRedirectedRef = useRef(false)
  const inactivityTriggeredRef = useRef(false)

  const clearConnectionRegistry = useCallback(() => {
    if (!gameId) return
    try {
      removeConnectionEntries({ gameId, source: 'auto-match-progress' })
    } catch (error) {
      console.warn('[AutoMatchProgress] 연결 정보 초기화 실패:', error)
    }
  }, [gameId])

  const cancelQueueWithCleanup = useCallback(() => {
    const result = actions.cancelQueue()
    return Promise.resolve(result).finally(() => {
      clearConnectionRegistry()
    })
  }, [actions, clearConnectionRegistry])

  const handleApiKeyExpired = useCallback(
    () => {
      if (apiKeyExpiredHandledRef.current) return
      apiKeyExpiredHandledRef.current = true
      const notice = 'API 키가 만료되었습니다. 새 API 키를 사용해주세요.'
      setJoinError(notice)
      setConfirmationState('failed')
      joinSignatureRef.current = ''
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current)
        queueTimeoutRef.current = null
      }
      if (heroRedirectTimerRef.current) {
        clearTimeout(heroRedirectTimerRef.current)
        heroRedirectTimerRef.current = null
      }
      if (joinRetryTimerRef.current) {
        clearTimeout(joinRetryTimerRef.current)
        joinRetryTimerRef.current = null
      }
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current)
        confirmationTimerRef.current = null
      }
      if (confirmationIntervalRef.current) {
        clearInterval(confirmationIntervalRef.current)
        confirmationIntervalRef.current = null
      }
      if (penaltyRedirectRef.current) {
        clearTimeout(penaltyRedirectRef.current)
        penaltyRedirectRef.current = null
      }
      if (dropInRedirectTimerRef.current) {
        clearInterval(dropInRedirectTimerRef.current)
        dropInRedirectTimerRef.current = null
      }
      navigationLockedRef.current = true
      clearMatchConfirmation()
      try {
        if (typeof window !== 'undefined') {
          window.alert(notice)
        }
      } catch (alertError) {
        console.warn('[AutoMatchProgress] API 키 만료 알림 표시 실패:', alertError)
      }
      cancelQueueWithCleanup()
        .catch((error) => {
          console.warn('[AutoMatchProgress] API 키 만료 후 대기열 정리 실패:', error)
        })
        .finally(() => {
          router.replace(`/rank/${gameId}`)
        })
    },
    [cancelQueueWithCleanup, gameId, router],
  )

  useEffect(() => {
    apiKeyExpiredHandlerRef.current = handleApiKeyExpired
  }, [handleApiKeyExpired])

  const persistApiKeyOnServer = usePersistApiKey()

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (state.status === 'idle') return undefined

    const handlePageLeave = () => {
      if (navigationLockedRef.current) return
      if (state.status !== 'queued' && state.status !== 'matched') return
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      cancelQueueWithCleanup().catch((error) => {
        console.warn('[AutoMatchProgress] 페이지 이탈 시 대기열 취소 실패:', error)
      })
    }

    window.addEventListener('pagehide', handlePageLeave)
    window.addEventListener('beforeunload', handlePageLeave)

    return () => {
      window.removeEventListener('pagehide', handlePageLeave)
      window.removeEventListener('beforeunload', handlePageLeave)
    }
  }, [cancelQueueWithCleanup, state.status])

  const roleName = useMemo(() => resolveRoleName(state.lockedRole, state.roles), [
    state.lockedRole,
    state.roles,
  ])

  const isRealtimeMatch = useMemo(() => {
    const meta = state.match?.sampleMeta || state.sampleMeta
    if (meta && typeof meta.realtime === 'boolean') {
      return meta.realtime
    }
    if (meta && typeof meta.sampleType === 'string') {
      const normalized = meta.sampleType.toLowerCase()
      if (normalized === 'participant_pool') {
        return false
      }
      if (normalized === 'realtime_queue') {
        return true
      }
    }
    return true
  }, [state.match?.sampleMeta, state.sampleMeta])

  const requiresManualConfirmation = isRealtimeMatch

  const blockers = useMemo(() => {
    if (state.status === 'queued' || state.status === 'matched') {
      return []
    }
    const list = []
    if (!state.viewerId) {
      list.push(VIEWER_BLOCKER_MESSAGE)
    }
    if (!state.roleReady || !roleName) {
      list.push(ROLE_BLOCKER_MESSAGE)
    }
    if (!state.heroId) {
      list.push(HERO_BLOCKER_MESSAGE)
    }
    return list
  }, [state.status, state.viewerId, state.roleReady, roleName, state.heroId])

  useEffect(() => {
    if (previousStatusRef.current === state.status) return
    const previous = previousStatusRef.current
    console.debug('[AutoMatchProgress] 상태 변경', {
      previous,
      next: state.status,
      matchCode: state.match?.matchCode ?? null,
    })

    if (state.status === 'idle' && previous && previous !== 'idle') {
      console.debug('[AutoMatchProgress] 대기열 상태가 초기화되어 자동 참가 서명을 재설정합니다.')
      joinSignatureRef.current = ''
      if (joinRetryTimerRef.current) {
        clearTimeout(joinRetryTimerRef.current)
        joinRetryTimerRef.current = null
      }
    }

    previousStatusRef.current = state.status
  }, [state.status, state.match])

  useEffect(() => {
    if (!gameId || !mode) return
    if (state.status !== 'matched') {
      if (latestStatusRef.current === 'matched') {
        clearConnectionRegistry()
      }
      matchRedirectedRef.current = false
      latestStatusRef.current = state.status
      return
    }
    const match = state.match
    if (!match) {
      return
    }

    try {
      registerMatchConnections({
        gameId,
        match,
        viewerId: state.viewerId || '',
        source: 'auto-match-progress',
      })
    } catch (error) {
      console.warn('[AutoMatchProgress] 연결 정보 등록 실패:', error)
    }

    const plainHeroMap = match.heroMap instanceof Map
      ? Object.fromEntries(match.heroMap)
      : match.heroMap || null
    const sanitizedMatch = {
      assignments: Array.isArray(match.assignments) ? match.assignments : [],
      maxWindow: match.maxWindow ?? null,
      heroMap: plainHeroMap,
      matchCode: match.matchCode || '',
      matchType: match.matchType || 'standard',
      brawlVacancies: Array.isArray(match.brawlVacancies) ? match.brawlVacancies : [],
      roleStatus: match.roleStatus || null,
      sampleMeta: match.sampleMeta || state.sampleMeta || null,
      dropInTarget: match.dropInTarget || null,
      turnTimer: match.turnTimer ?? match.turn_timer ?? null,
    }

    clearMatchConfirmation()
    const saved = saveMatchConfirmation({
      gameId,
      mode,
      roleName,
      requiresManualConfirmation,
      turnTimer,
      roles: state.roles,
      viewerId: state.viewerId || '',
      heroId: state.heroId || '',
      match: sanitizedMatch,
      createdAt: Date.now(),
    })

    if (!saved) {
      latestStatusRef.current = state.status
      return
    }

    latestStatusRef.current = state.status

  }, [
    gameId,
    mode,
    clearConnectionRegistry,
    roleName,
    state.heroId,
    state.match,
    state.roles,
    state.sampleMeta,
    state.status,
    state.viewerId,
    turnTimer,
  ])

  useEffect(() => {
    const nextSignature = `${state.viewerId || ''}::${state.heroId || ''}::${roleName}`
    if (!joinSignatureRef.current) return
    if (joinSignatureRef.current === nextSignature) return

    console.debug('[AutoMatchProgress] 참가 정보가 변경되어 자동 참가 서명을 초기화합니다.', {
      previous: joinSignatureRef.current,
      next: nextSignature,
    })
    joinSignatureRef.current = ''
    if (joinRetryTimerRef.current) {
      clearTimeout(joinRetryTimerRef.current)
      joinRetryTimerRef.current = null
    }
  }, [roleName, state.heroId, state.viewerId])

  useEffect(() => {
    const previous = blockersRef.current || []
    const added = blockers.filter((message) => !previous.includes(message))
    const cleared = previous.filter((message) => !blockers.includes(message))
    if (added.length || cleared.length) {
      console.debug('[AutoMatchProgress] 참가 차단 요인 업데이트', {
        added,
        cleared,
        next: blockers,
      })
    }
    blockersRef.current = blockers
  }, [blockers])

  useEffect(() => {
    if (joinErrorRef.current === joinError) return
    if (joinError) {
      console.warn('[AutoMatchProgress] 자동 참가 오류', joinError)
    } else if (joinErrorRef.current) {
      console.debug('[AutoMatchProgress] 자동 참가 오류 해소')
    }
    joinErrorRef.current = joinError
  }, [joinError])

  useEffect(() => {
    if (previousConfirmationRef.current === confirmationState) return
    console.debug('[AutoMatchProgress] 확인 단계 변경', {
      previous: previousConfirmationRef.current,
      next: confirmationState,
      remaining: confirmationRemaining,
    })
    previousConfirmationRef.current = confirmationState
  }, [confirmationState, confirmationRemaining])

  useEffect(() => {
    latestConfirmationRef.current = confirmationState
  }, [confirmationState])

  useEffect(() => {
    if (confirmationState !== 'counting') return
    if (confirming) return

    if (typeof document === 'undefined') return

    const button = confirmButtonRef.current
    if (!button) return
    if (document.activeElement === button) return

    button.focus()
  }, [confirmationState, confirming])

  const clearConfirmationTimers = useCallback(() => {
    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current)
      confirmationTimerRef.current = null
    }
    if (confirmationIntervalRef.current) {
      clearInterval(confirmationIntervalRef.current)
      confirmationIntervalRef.current = null
    }
  }, [])

  const handleConfirmationTimeout = useCallback(() => {
    clearConfirmationTimers()
    setConfirmationState('failed')
    setJoinError(PENALTY_NOTICE)
    joinSignatureRef.current = ''
    cancelQueueWithCleanup()
    if (matchLockedRef.current) {
      matchLockedRef.current = false
      setMatchLocked(false)
    }
    if (penaltyRedirectRef.current) {
      clearTimeout(penaltyRedirectRef.current)
      penaltyRedirectRef.current = null
    }
    if (navigationLockedRef.current) return
    penaltyRedirectRef.current = setTimeout(() => {
      if (navigationLockedRef.current) return
      navigationLockedRef.current = true
      router.replace(`/rank/${gameId}`)
    }, FAILURE_REDIRECT_DELAY_MS)
  }, [cancelQueueWithCleanup, clearConfirmationTimers, gameId, router])

  const startConfirmationCountdown = useCallback(() => {
    clearConfirmationTimers()
    setConfirmationState('counting')
    setConfirmationRemaining(CONFIRMATION_WINDOW_SECONDS)
    confirmationTimerRef.current = setTimeout(
      handleConfirmationTimeout,
      CONFIRMATION_WINDOW_SECONDS * 1000,
    )
    confirmationIntervalRef.current = setInterval(() => {
      setConfirmationRemaining((prev) => {
        const next = prev > 0 ? prev - 1 : 0
        return next
      })
    }, 1000)
  }, [clearConfirmationTimers, handleConfirmationTimeout])

  const triggerPlay = useCallback(
    async (token) => {
      if (!gameId || !token) {
        return false
      }
      if (playTriggeredRef.current) {
        return true
      }
      playTriggeredRef.current = true

      try {
        const heroIds = extractHeroIdsFromAssignments({
          roles: state.roles,
          assignments: state.match?.assignments,
        })
        if (!heroIds.length || heroIds.some((value) => !value)) {
          setJoinError('전투에 필요한 슬롯 정보를 불러오지 못했습니다. 다시 시도해 주세요.')
          playTriggeredRef.current = false
          return false
        }

        const { apiKey, apiVersion, geminiMode, geminiModel } = readStoredStartConfig()
        const trimmedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''

        if (trimmedApiKey && typeof window !== 'undefined') {
          try {
            writeStartSessionValue(START_SESSION_KEYS.API_KEY, trimmedApiKey, {
              source: 'auto-match',
            })
          } catch (error) {
            console.warn('[AutoMatchProgress] API 키를 저장하지 못했습니다:', error)
          }
        }
        if (!trimmedApiKey) {
          setPlayNotice('AI API 키 확인은 전투 화면에서 진행됩니다.')
          return true
        }

        await persistApiKeyOnServer(trimmedApiKey, apiVersion, {
          geminiMode,
          geminiModel,
        })

        setPlayNotice('전투를 준비하는 중입니다…')

        const response = await fetch('/api/rank/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId,
            heroIds,
            userApiKey: trimmedApiKey,
            apiVersion,
            geminiMode: apiVersion === 'gemini' ? geminiMode : undefined,
            geminiModel: apiVersion === 'gemini' ? geminiModel : undefined,
          }),
        })

        let payload = {}
        try {
          payload = await response.json()
        } catch (error) {
          payload = {}
        }

        if (!response.ok || (payload && payload.ok === false && payload.error)) {
          const message =
            payload?.error || payload?.detail || '전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          if (message === 'missing_user_api_key') {
            setJoinError('AI API 키가 필요합니다. 전투 화면에서 키를 입력한 뒤 다시 시도해 주세요.')
          } else {
            setJoinError(message)
          }
          setPlayNotice('')
          playTriggeredRef.current = false
          return false
        }

        if (payload?.error && !payload?.ok) {
          const message =
            payload?.error || '전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          if (message === 'missing_user_api_key') {
            setJoinError('AI API 키가 필요합니다. 전투 화면에서 키를 입력한 뒤 다시 시도해 주세요.')
          } else {
            setJoinError(message)
          }
          setPlayNotice('')
          playTriggeredRef.current = false
          return false
        }

        const outcome = payload?.outcome
        if (outcome === 'win') {
          setPlayNotice('전투 결과: 승리')
        } else if (outcome === 'lose') {
          setPlayNotice('전투 결과: 패배')
        } else if (outcome === 'draw') {
          setPlayNotice('전투 결과: 무승부')
        } else {
          setPlayNotice('전투가 완료되었습니다.')
        }

        return true
      } catch (error) {
        console.error('자동 전투 실행 실패:', error)
        setJoinError('전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        setPlayNotice('')
        playTriggeredRef.current = false
        return false
      }
    },
    [gameId, persistApiKeyOnServer, state.match?.assignments, state.roles],
  )

  const handleConfirmMatch = useCallback(async () => {
    if (confirmationState !== 'counting') return
    if (confirming) return

    setConfirming(true)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw sessionError
      }
      const token = sessionData?.session?.access_token
      if (!token) {
        throw new Error('세션 정보를 확인하지 못했습니다.')
      }

      const matchMetaPayload = buildMatchMetaPayload(state.match, {
        mode,
        turnTimer: Number.isFinite(Number(turnTimer)) ? Number(turnTimer) : null,
        source: 'auto_match_progress',
      })
      if (matchMetaPayload) {
        storeStartMatchMeta(matchMetaPayload)
      } else {
        storeStartMatchMeta(null)
      }

      const response = await fetch('/api/rank/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          mode,
          role: roleName,
          match_code: state.match?.matchCode || null,
          turn_timer: Number.isFinite(Number(turnTimer)) && Number(turnTimer) > 0 ? Number(turnTimer) : undefined,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          payload?.error || payload?.detail || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        setJoinError(message)
        storeStartMatchMeta(null)
        return
      }

      const payload = await response.json().catch(() => ({}))
      if (!payload?.ok) {
        const message =
          payload?.error || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        setJoinError(message)
        storeStartMatchMeta(null)
        return
      }

      const playOk = await triggerPlay(token)
      if (!playOk) {
        setConfirmationState('failed')
        storeStartMatchMeta(null)
        return
      }

      clearConfirmationTimers()
      setConfirmationState('confirmed')
      setJoinError('')
      cancelQueueWithCleanup()
        .catch((error) => {
          console.warn('[AutoMatchProgress] 큐 정리 실패', error)
        })
    } catch (error) {
      console.error('세션 시작 실패:', error)
      setJoinError('전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      storeStartMatchMeta(null)
    } finally {
      setConfirming(false)
    }
  }, [
    cancelQueueWithCleanup,
    clearConfirmationTimers,
    confirmationState,
    confirming,
    gameId,
    mode,
    roleName,
    state.match?.matchCode,
    turnTimer,
  ])

  useEffect(() => {
    latestStatusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    if (
      matchLocked ||
      state.status === 'matched' ||
      confirmationState === 'counting' ||
      confirmationState === 'confirmed'
    ) {
      setDisplayStatus('matched')
      return
    }

    if (confirmationState === 'failed') {
      setDisplayStatus('queued')
      return
    }

    setDisplayStatus(state.status)
  }, [confirmationState, matchLocked, state.status])

  useEffect(() => {
    if (confirmationState === 'failed') {
      if (matchLockedRef.current) {
        matchLockedRef.current = false
        setMatchLocked(false)
      }
    }
  }, [confirmationState])

  useEffect(() => {
    if (state.status !== 'matched') {
      playTriggeredRef.current = false
      setPlayNotice('')
    }
  }, [state.status])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const stored = Number(readStartSessionValue(START_SESSION_KEYS.TURN_TIMER))
    if (Number.isFinite(stored) && stored > 0) {
      setTurnTimer(stored)
    }
  }, [])

  useEffect(() => {
    const next = Number(state.match?.turnTimer ?? state.match?.turn_timer)
    if (!Number.isFinite(next) || next <= 0) {
      return
    }
    setTurnTimer(next)
  }, [state.match?.turnTimer, state.match?.turn_timer])

  useEffect(() => {
    if (!gameId || !mode) return
    if (state.status === 'queued' || state.status === 'matched') return
    if (confirmationState !== 'idle') return
    if (blockers.length) return

    const signature = `${state.viewerId || ''}::${state.heroId || ''}::${roleName}`
    if (!signature.trim()) return
    if (joinSignatureRef.current === signature) return

    joinSignatureRef.current = signature
    joinAttemptCountRef.current += 1
    const attemptNumber = joinAttemptCountRef.current
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    queueJoinStartedAtRef.current = startedAt
    console.debug('[AutoMatchProgress] 자동 참가 시도', {
      signature,
      attemptNumber,
      startedAt,
    })
    actions.joinQueue(roleName).then((result) => {
      if (!result?.ok) {
        setJoinError(result?.error || '대기열에 참가하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        if (joinRetryTimerRef.current) {
          clearTimeout(joinRetryTimerRef.current)
        }
        joinRetryTimerRef.current = setTimeout(() => {
          joinSignatureRef.current = ''
          joinRetryTimerRef.current = null
        }, 1500)
      } else {
        setJoinError('')
        if (joinRetryTimerRef.current) {
          clearTimeout(joinRetryTimerRef.current)
          joinRetryTimerRef.current = null
        }
        console.debug('[AutoMatchProgress] 자동 참가 성공', {
          signature,
          attemptNumber,
        })
      }
    })
  }, [
    actions,
    blockers,
    confirmationState,
    gameId,
    mode,
    roleName,
    state.heroId,
    state.status,
    state.viewerId,
  ])

  useEffect(() => {
    if (!blockers.includes(HERO_BLOCKER_MESSAGE) || state.status !== 'idle') {
      if (heroRedirectTimerRef.current) {
        clearTimeout(heroRedirectTimerRef.current)
        heroRedirectTimerRef.current = null
      }
      return
    }

    if (heroRedirectTimerRef.current || navigationLockedRef.current) {
      return
    }

    setJoinError('사용할 캐릭터가 없어 메인 룸으로 돌아갑니다.')
    heroRedirectTimerRef.current = setTimeout(() => {
      if (navigationLockedRef.current) return
      navigationLockedRef.current = true
      router.replace(`/rank/${gameId}`)
    }, HERO_REDIRECT_DELAY_MS)

    return () => {
      if (heroRedirectTimerRef.current) {
        clearTimeout(heroRedirectTimerRef.current)
        heroRedirectTimerRef.current = null
      }
    }
  }, [blockers, gameId, router, state.status])

  useEffect(() => {
    if (state.status === 'queued') {
      if (queueJoinStartedAtRef.current != null) {
        const startedAt = queueJoinStartedAtRef.current
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const elapsedMs = Math.max(0, now - startedAt)
        console.debug('[AutoMatchProgress] 대기열 대기 시작', {
          elapsedMs,
          attemptNumber: joinAttemptCountRef.current,
        })
      }
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current)
      }
      queueTimeoutRef.current = setTimeout(() => {
        console.warn('[AutoMatchProgress] 대기열이 제한 시간 내에 매칭되지 않았습니다.', {
          timeoutMs: QUEUE_TIMEOUT_MS,
          attemptNumber: joinAttemptCountRef.current,
        })
        setJoinError('1분 안에 매칭이 완료되지 않아 메인 룸으로 돌아갑니다.')
        if (!navigationLockedRef.current) {
          navigationLockedRef.current = true
          cancelQueueWithCleanup()
          router.replace(`/rank/${gameId}`)
        }
      }, QUEUE_TIMEOUT_MS)
      return () => {
        if (queueTimeoutRef.current) {
          clearTimeout(queueTimeoutRef.current)
          queueTimeoutRef.current = null
        }
      }
    }

    if (queueTimeoutRef.current) {
      clearTimeout(queueTimeoutRef.current)
      queueTimeoutRef.current = null
    }
    return () => {}
  }, [cancelQueueWithCleanup, gameId, router, state.status])

  useEffect(() => {
    if (state.status !== 'matched' || !requiresManualConfirmation) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      inactivityTriggeredRef.current = false
      return undefined
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined
    }

    if (navigationLockedRef.current || matchRedirectedRef.current) {
      return undefined
    }

    inactivityTriggeredRef.current = false

    const scheduleInactivityCancel = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      inactivityTimerRef.current = setTimeout(() => {
        if (navigationLockedRef.current || matchRedirectedRef.current) {
          return
        }
        if (inactivityTriggeredRef.current) {
          return
        }
        inactivityTriggeredRef.current = true
        console.warn('[AutoMatchProgress] 사용자 활동이 감지되지 않아 매칭을 취소합니다.')
        setJoinError('응답이 없어 매칭이 취소되었습니다.')
        cancelQueueWithCleanup()
          .catch((error) => {
            console.warn('[AutoMatchProgress] 무활동 매칭 취소 실패:', error)
          })
          .finally(() => {
            if (inactivityTimerRef.current) {
              clearTimeout(inactivityTimerRef.current)
              inactivityTimerRef.current = null
            }
            if (!navigationLockedRef.current) {
              navigationLockedRef.current = true
              matchRedirectedRef.current = true
              router.replace(`/rank/${gameId}`)
            }
          })
      }, MATCH_INACTIVITY_TIMEOUT_MS)
    }

    const handleActivity = () => {
      if (navigationLockedRef.current || matchRedirectedRef.current) {
        return
      }
      inactivityTriggeredRef.current = false
      scheduleInactivityCancel()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleActivity()
      }
    }

    scheduleInactivityCancel()

    window.addEventListener('pointerdown', handleActivity, true)
    window.addEventListener('keydown', handleActivity, true)
    window.addEventListener('mousemove', handleActivity, true)
    window.addEventListener('touchstart', handleActivity, true)
    document.addEventListener('visibilitychange', handleVisibility, true)

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      window.removeEventListener('pointerdown', handleActivity, true)
      window.removeEventListener('keydown', handleActivity, true)
      window.removeEventListener('mousemove', handleActivity, true)
      window.removeEventListener('touchstart', handleActivity, true)
      document.removeEventListener('visibilitychange', handleVisibility, true)
    }
  }, [
    cancelQueueWithCleanup,
    gameId,
    requiresManualConfirmation,
    router,
    state.status,
  ])

  useEffect(() => {
    if (matchRedirectedRef.current) {
      return
    }
    if (state.status === 'matched') {
      if (!matchLockedRef.current) {
        matchLockedRef.current = true
        setMatchLocked(true)
      }
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current)
        queueTimeoutRef.current = null
      }
      queueJoinStartedAtRef.current = null

      if (confirmationState === 'idle') {
        startConfirmationCountdown()
      }
      return
    }

    if (state.status === 'idle' || confirmationState === 'failed') {
      if (matchLockedRef.current) {
        matchLockedRef.current = false
        setMatchLocked(false)
      }
    }

    if (matchLockedRef.current && confirmationState === 'counting') {
      return
    }

    if (confirmationState === 'confirmed') {
      return
    }

    clearConfirmationTimers()
    if (confirmationState !== 'idle') {
      setConfirmationState('idle')
      setConfirmationRemaining(CONFIRMATION_WINDOW_SECONDS)
    }
    queueJoinStartedAtRef.current = null
  }, [
    clearConfirmationTimers,
    confirmationState,
    startConfirmationCountdown,
    state.status,
  ])

  useEffect(() => {
    if (confirmationState === 'counting' && confirmationRemaining <= 0) {
      handleConfirmationTimeout()
    }
  }, [confirmationRemaining, confirmationState, handleConfirmationTimeout])

  useEffect(() => {
    if (confirmationState !== 'confirmed') return undefined
    if (!gameId) return undefined

    const timer = setTimeout(() => {
      if (navigationLockedRef.current) return
      navigationLockedRef.current = true
      matchRedirectedRef.current = true
      router.replace({ pathname: `/rank/${gameId}/start`, query: { mode } })
    }, MATCH_TRANSITION_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [confirmationState, gameId, mode, router])

  useEffect(() => {
    return () => {
      if (heroRedirectTimerRef.current) {
        clearTimeout(heroRedirectTimerRef.current)
        heroRedirectTimerRef.current = null
      }
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current)
        queueTimeoutRef.current = null
      }
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current)
        confirmationTimerRef.current = null
      }
      if (confirmationIntervalRef.current) {
        clearInterval(confirmationIntervalRef.current)
        confirmationIntervalRef.current = null
      }
      if (penaltyRedirectRef.current) {
        clearTimeout(penaltyRedirectRef.current)
        penaltyRedirectRef.current = null
      }
      if (joinRetryTimerRef.current) {
        clearTimeout(joinRetryTimerRef.current)
        joinRetryTimerRef.current = null
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      const latestConfirmation = latestConfirmationRef.current
      if (
        !matchRedirectedRef.current &&
        (latestStatusRef.current === 'queued' || latestStatusRef.current === 'matched') &&
        latestConfirmation !== 'confirmed'
      ) {
        cancelQueueWithCleanup()
      }
    }
  }, [cancelQueueWithCleanup])

  useEffect(() => {
    if (state.status === 'queued' || state.status === 'matched') {
      if (confirmationState !== 'failed') {
        setJoinError('')
      }
    }
  }, [confirmationState, state.status])

  const extraBlockers = confirmationState === 'counting' ? [] : blockers.slice(1)

  const heroMap = useMemo(
    () => coerceHeroMap(state.match?.heroMap),
    [state.match?.heroMap],
  )

  const assignmentSummary = useMemo(() => {
    if (!state.match?.assignments?.length) return []
    return state.match.assignments.map((assignment, assignmentIndex) => {
      const role =
        (typeof assignment?.role === 'string' && assignment.role.trim()) ||
        `역할 ${assignmentIndex + 1}`
      const members = Array.isArray(assignment?.members)
        ? assignment.members.map((member, memberIndex) => {
            const label = resolveMemberLabel({ member, heroMap })
            const rawKey =
              member?.id ??
              member?.queue_id ??
              member?.queueId ??
              member?.owner_id ??
              member?.ownerId ??
              member?.hero_id ??
              member?.heroId
            const keyBase = typeof rawKey === 'string' || typeof rawKey === 'number'
              ? String(rawKey)
              : `${assignmentIndex}-${memberIndex}`
            return {
              key: `${role}-${keyBase}`,
              label,
            }
          })
        : []
      return {
        key: assignment?.groupKey || `${role}-${assignmentIndex}`,
        role,
        members,
      }
    })
  }, [heroMap, state.match?.assignments])

  const matchMetaLines = useMemo(() => {
    if (!state.match) return playNotice ? [playNotice] : []
    const lines = []
    const { matchType, maxWindow, matchCode, brawlVacancies, dropInTarget } = state.match
    if (matchType === 'brawl') {
      lines.push('난입 슬롯 충원 매치로 진행됩니다.')
    } else if (matchType === 'drop_in') {
      lines.push('실시간 난입 매치로 진행됩니다.')
      if (dropInTarget?.roomCode) {
        lines.push(`룸 코드 ${dropInTarget.roomCode} 방으로 이동합니다.`)
      }
      if (Number.isFinite(Number(dropInTarget?.scoreDifference))) {
        const window = Math.round(Math.abs(Number(dropInTarget.scoreDifference)))
        if (window > 0) {
          lines.push(`점수 차이 ±${window} 이내에서 난입이 허용되었습니다.`)
        }
      }
    } else if (matchType && matchType !== 'standard') {
      lines.push(`${matchType} 매치로 진행됩니다.`)
    }
    const numericWindow = Number(maxWindow)
    if (Number.isFinite(numericWindow) && numericWindow > 0) {
      lines.push(`점수 범위 ±${numericWindow} 내에서 매칭되었습니다.`)
    }
    if (Array.isArray(brawlVacancies) && brawlVacancies.length) {
      const roleLine = brawlVacancies
        .map((item) => {
          if (!item) return null
          const name = typeof item.name === 'string' ? item.name.trim() : ''
          if (!name) return null
          const rawCount = item.slot_count ?? item.slotCount ?? item.capacity
          const count = Number(rawCount)
          if (Number.isFinite(count) && count > 0) {
            return `${name} ${count}자리`
          }
          return name
        })
        .filter(Boolean)
        .join(', ')
      if (roleLine) {
        lines.push(`충원 대상 역할: ${roleLine}`)
      }
    }
    if (typeof matchCode === 'string' && matchCode.trim()) {
      lines.push(`매치 코드 ${matchCode.trim()}`)
    }
    const numericTimer = Number(turnTimer)
    if (Number.isFinite(numericTimer) && numericTimer > 0) {
      lines.push(`턴 제한 ${numericTimer}초 설정`)
    }
    if (playNotice) {
      lines.push(playNotice)
    }
    return lines
  }, [playNotice, state.match, turnTimer])

  const baseDisplay = useMemo(() => {
    if (displayStatus === 'queued') {
      return {
        title: '매칭 중…',
        detail: '',
      }
    }

    if (joinError) {
      return {
        title: '매칭 준비 중…',
        detail: '',
      }
    }

    if (blockers.length) {
      return {
        title: '매칭 준비 중…',
        detail: '',
      }
    }

    return {
      title: '매칭 중…',
      detail: '',
    }
  }, [blockers, displayStatus, joinError])

  const matchedDisplay = useMemo(() => {
    if (confirmationState === 'confirmed') {
      return {
        title: '게임을 불러오는 중…',
        detail: '게임 시작을 준비하고 있습니다.',
      }
    }

    if (confirmationState === 'counting') {
      return {
        title: '매칭이 완료되었습니다.',
        detail: `${confirmationRemaining}초 안에 "게임 시작" 버튼을 눌러주세요.`,
      }
    }

    if (confirmationState === 'failed') {
      return {
        title: '매칭이 취소되었습니다.',
        detail: joinError || PENALTY_NOTICE,
      }
    }

    return {
      title: '매칭이 완료되었습니다.',
      detail: '참가자 구성을 확인해 주세요.',
    }
  }, [confirmationRemaining, confirmationState, joinError])

  const showMatchedOverlay = matchLocked || confirmationState !== 'idle'

  const showBaseSpinner = useMemo(() => {
    if (confirmationState === 'failed') {
      return true
    }
    return displayStatus !== 'matched'
  }, [confirmationState, displayStatus])

  return (
    <div
      className={styles.root}
      aria-live="polite"
      aria-busy={!showMatchedOverlay && displayStatus !== 'matched'}
    >
      <div
        className={styles.baseLayer}
        aria-hidden={showMatchedOverlay ? 'true' : 'false'}
      >
        {showBaseSpinner ? <div className={styles.spinner} aria-hidden="true" /> : null}
        <div className={styles.status} role="status">
          <p className={styles.message}>{baseDisplay.title}</p>
          {baseDisplay.detail ? (
            <p className={styles.detail}>{baseDisplay.detail}</p>
          ) : null}
          {!showMatchedOverlay && matchMetaLines.length ? (
            <div className={styles.matchMeta} role="note">
              {matchMetaLines.map((line) => (
                <p key={line} className={styles.matchMetaLine}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {!showMatchedOverlay && assignmentSummary.length ? (
            <div className={styles.assignmentList} role="group" aria-label="매칭된 역할 구성">
              {assignmentSummary.map((assignment) => (
                <div key={assignment.key} className={styles.assignmentItem}>
                  <span className={styles.assignmentRole}>{assignment.role}</span>
                  {assignment.members.length ? (
                    <ul className={styles.assignmentMembers}>
                      {assignment.members.map((member) => (
                        <li key={member.key} className={styles.assignmentMember}>
                          {member.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.assignmentEmpty}>참가자 정보를 불러오는 중…</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {!showMatchedOverlay && extraBlockers.length ? (
            <ul className={styles.blockerList}>
              {extraBlockers.map((message) => (
                <li key={message} className={styles.blockerItem}>
                  {message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {showMatchedOverlay ? (
        <div className={styles.matchedOverlay} role="status" aria-live="assertive">
          <div className={styles.status}>
            <p className={styles.message}>{matchedDisplay.title}</p>
            {matchedDisplay.detail ? (
              <p className={styles.detail}>{matchedDisplay.detail}</p>
            ) : null}
            {matchMetaLines.length ? (
              <div className={styles.matchMeta} role="note">
                {matchMetaLines.map((line) => (
                  <p key={line} className={styles.matchMetaLine}>
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {assignmentSummary.length ? (
              <div className={styles.assignmentList} role="group" aria-label="매칭된 역할 구성">
                {assignmentSummary.map((assignment) => (
                  <div key={assignment.key} className={styles.assignmentItem}>
                    <span className={styles.assignmentRole}>{assignment.role}</span>
                    {assignment.members.length ? (
                      <ul className={styles.assignmentMembers}>
                        {assignment.members.map((member) => (
                          <li key={member.key} className={styles.assignmentMember}>
                            {member.label}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.assignmentEmpty}>참가자 정보를 불러오는 중…</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {confirmationState === 'counting' ? (
              <div className={styles.confirmArea}>
                <button
                  type="button"
                  className={styles.confirmButton}
                  onClick={handleConfirmMatch}
                  disabled={confirming}
                  ref={confirmButtonRef}
                >
                  {confirming ? '시작 준비 중…' : '게임 시작'}
                  <span className={styles.confirmCountdown}>{confirmationRemaining}초</span>
                </button>
                <p className={styles.confirmHint}>
                  {CONFIRMATION_WINDOW_SECONDS}
                  초 안에 게임을 시작하지 않으면 매칭이 취소되고 다시 매칭이 진행됩니다.
                </p>
              </div>
            ) : null}
            {confirmationState === 'failed' && extraBlockers.length ? (
              <ul className={styles.blockerList}>
                {extraBlockers.map((message) => (
                  <li key={message} className={styles.blockerItem}>
                    {message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {joinError && state.status === 'queued' ? (
        <p className={styles.srOnly} role="alert">{joinError}</p>
      ) : null}
    </div>
  )
}
