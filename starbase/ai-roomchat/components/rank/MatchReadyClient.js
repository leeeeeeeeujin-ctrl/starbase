'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { removeQueueEntry } from '../../lib/rank/matchmakingService'
import { supabase } from '../../lib/supabase'
import usePersistApiKey from './hooks/usePersistApiKey'
import {
  CONFIRMATION_WINDOW_SECONDS,
  FAILURE_REDIRECT_DELAY_MS,
  PENALTY_NOTICE,
} from './matchConstants'
import { coerceHeroMap, extractHeroIdsFromAssignments, resolveMemberLabel } from './matchUtils'
import { clearMatchConfirmation, loadMatchConfirmation } from './matchStorage'
import { buildMatchMetaPayload, readStoredStartConfig, storeStartMatchMeta } from './startConfig'
import styles from './MatchReadyClient.module.css'
import {
  START_SESSION_KEYS,
  writeStartSessionValue,
} from '../../lib/rank/startSessionChannel'

function getMatchPagePath(mode, gameId) {
  if (!gameId) return '/rank'
  if (mode === 'rank_duo') return `/rank/${gameId}/duo-match`
  if (mode === 'casual_match') return `/rank/${gameId}/casual`
  return `/rank/${gameId}/solo-match`
}

function getModeLabel(mode) {
  if (mode === 'rank_duo') return '듀오 랭크'
  if (mode === 'casual_match') return '캐주얼'
  return '솔로 랭크'
}

function buildPlayErrorMessage(payload) {
  const code = typeof payload?.error === 'string' ? payload.error.trim() : ''
  const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : ''

  switch (code) {
    case 'missing_user_api_key':
      return 'AI API 키가 필요합니다. 전투 화면에서 키를 입력한 뒤 다시 시도해 주세요.'
    case 'invalid_user_api_key':
      return detail || 'AI API 키가 올바르지 않습니다. 설정을 확인한 뒤 다시 시도해 주세요.'
    case 'quota_exhausted':
      return detail || 'AI 호출 가능 횟수를 모두 사용했습니다. 잠시 후 다시 시도해 주세요.'
    case 'ai_network_error':
      return detail
        ? `AI 호출 중 네트워크 오류가 발생했습니다: ${detail}`
        : 'AI 호출 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    case 'ai_prompt_blocked':
      return detail || 'AI가 요청을 차단했습니다. 다른 영웅이나 구성을 시도해 주세요.'
    case 'ai_failed':
      return detail || 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.'
    case 'server_error':
      return detail || '전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    default:
      if (code) {
        if (detail) {
          return detail
        }
        return `전투를 시작하지 못했습니다. (${code})`
      }
      return detail || '전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

export default function MatchReadyClient({ gameId, mode }) {
  const router = useRouter()
  const persistApiKeyOnServer = usePersistApiKey()
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('loading')
  const [countdown, setCountdown] = useState(CONFIRMATION_WINDOW_SECONDS)
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef(null)
  const intervalRef = useRef(null)
  const redirectTimerRef = useRef(null)
  const autoTriggerRef = useRef(false)
  const playTriggeredRef = useRef(false)

  const matchPagePath = useMemo(() => getMatchPagePath(mode, gameId), [gameId, mode])
  const mainRoomPath = useMemo(() => (gameId ? `/rank/${gameId}` : '/rank'), [gameId])

  const requiresManualConfirmation = Boolean(payload?.requiresManualConfirmation)

  const heroMap = useMemo(() => coerceHeroMap(payload?.match?.heroMap), [payload?.match?.heroMap])

  const assignmentSummary = useMemo(() => {
    if (!payload?.match?.assignments?.length) return []
    return payload.match.assignments.map((assignment, assignmentIndex) => {
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
  }, [heroMap, payload?.match?.assignments])

  const matchMetaLines = useMemo(() => {
    if (!payload?.match) return []
    const { matchType, maxWindow, matchCode, brawlVacancies, dropInTarget, turnTimer } = payload.match
    const lines = []
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
    const numericTimer = Number(turnTimer ?? payload.turnTimer)
    if (Number.isFinite(numericTimer) && numericTimer > 0) {
      lines.push(`턴 제한 ${numericTimer}초 설정`)
    }
    if (notice) {
      lines.push(notice)
    }
    return lines
  }, [notice, payload?.match, payload?.turnTimer])

  const handleTimeout = useCallback(() => {
    if (!payload || redirectTimerRef.current) return
    setStatus('expired')
    setError(PENALTY_NOTICE)
    clearMatchConfirmation()
    removeQueueEntry(supabase, {
      gameId,
      mode,
      ownerId: payload.viewerId || undefined,
    }).catch((errorCause) => {
      console.warn('[MatchReadyClient] 큐 제거 실패:', errorCause)
    })
    redirectTimerRef.current = setTimeout(() => {
      router.replace(mainRoomPath)
    }, FAILURE_REDIRECT_DELAY_MS)
  }, [gameId, mainRoomPath, mode, payload, router])

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const triggerPlay = useCallback(
    async ({ token, assignments, roles }) => {
      if (!token) {
        return false
      }
      if (playTriggeredRef.current) {
        return true
      }
      playTriggeredRef.current = true

      try {
        const heroIds = extractHeroIdsFromAssignments({ roles, assignments })
        if (!heroIds.length || heroIds.some((value) => !value)) {
          setError('전투에 필요한 슬롯 정보를 불러오지 못했습니다. 다시 시도해 주세요.')
          playTriggeredRef.current = false
          return false
        }

        const { apiKey, apiVersion, geminiMode, geminiModel } = readStoredStartConfig()
        const trimmedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''

        if (trimmedApiKey && typeof window !== 'undefined') {
          try {
            writeStartSessionValue(START_SESSION_KEYS.API_KEY, trimmedApiKey, {
              source: 'match-ready',
            })
          } catch (storageError) {
            console.warn('[MatchReadyClient] API 키를 저장하지 못했습니다:', storageError)
          }
        }

        if (!trimmedApiKey) {
          setNotice('AI API 키 확인은 전투 화면에서 진행됩니다.')
          return true
        }

        await persistApiKeyOnServer(trimmedApiKey, apiVersion, {
          geminiMode,
          geminiModel,
        })

        setNotice('전투를 준비하는 중입니다…')

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

        let payloadJson = {}
        try {
          payloadJson = await response.json()
        } catch (parseError) {
          payloadJson = {}
        }

        const errorPayload =
          !response.ok || payloadJson?.ok === false || payloadJson?.error
            ? payloadJson || {}
            : null

        if (errorPayload) {
          setError(buildPlayErrorMessage(errorPayload))
          setNotice('')
          playTriggeredRef.current = false
          return false
        }

        const outcome = payloadJson?.outcome
        if (outcome === 'win') {
          setNotice('전투 결과: 승리')
        } else if (outcome === 'lose') {
          setNotice('전투 결과: 패배')
        } else if (outcome === 'draw') {
          setNotice('전투 결과: 무승부')
        } else {
          setNotice('전투가 완료되었습니다.')
        }

        return true
      } catch (errorCause) {
        console.error('[MatchReadyClient] 자동 전투 실행 실패:', errorCause)
        setError('전투를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        setNotice('')
        playTriggeredRef.current = false
        return false
      }
    },
    [gameId, persistApiKeyOnServer],
  )

  const handleConfirm = useCallback(async () => {
    if (!payload) return
    if (confirming) return
    setConfirming(true)
    setError('')
    setStatus('confirming')

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        throw sessionError
      }
      const token = sessionData?.session?.access_token
      if (!token) {
        throw new Error('세션 정보를 확인하지 못했습니다.')
      }

      const matchMetaPayload = buildMatchMetaPayload(payload.match, {
        mode,
        turnTimer:
          Number.isFinite(Number(payload.turnTimer)) && Number(payload.turnTimer) > 0
            ? Number(payload.turnTimer)
            : null,
        source: 'match_ready_client',
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
          role: payload.roleName,
          match_code: payload.match?.matchCode || null,
          turn_timer:
            Number.isFinite(Number(payload.turnTimer)) && Number(payload.turnTimer) > 0
              ? Number(payload.turnTimer)
              : undefined,
        }),
      })

      if (!response.ok) {
        const responsePayload = await response.json().catch(() => ({}))
        const message =
          responsePayload?.error || responsePayload?.detail || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        throw new Error(message)
      }

      const payloadJson = await response.json().catch(() => ({}))
      if (!payloadJson?.ok) {
        const message =
          payloadJson?.error || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        throw new Error(message)
      }

      const playOk = await triggerPlay({
        token,
        assignments: payload.match?.assignments || [],
        roles: payload.roles || [],
      })
      if (!playOk) {
        setStatus('failed')
        clearTimers()
        clearMatchConfirmation()
        storeStartMatchMeta(null)
        redirectTimerRef.current = setTimeout(() => {
          router.replace(matchPagePath)
        }, FAILURE_REDIRECT_DELAY_MS)
        return
      }

      clearTimers()
      clearMatchConfirmation()
      removeQueueEntry(supabase, {
        gameId,
        mode,
        ownerId: payload.viewerId || undefined,
      }).catch((errorCause) => {
        console.warn('[MatchReadyClient] 큐 제거 실패:', errorCause)
      })
      setStatus('confirmed')
      router.replace({ pathname: `/rank/${gameId}/start`, query: { mode } })
    } catch (errorCause) {
      console.error('[MatchReadyClient] 매칭 확인 실패:', errorCause)
      setError(errorCause?.message || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setStatus('failed')
      clearTimers()
      clearMatchConfirmation()
      storeStartMatchMeta(null)
      redirectTimerRef.current = setTimeout(() => {
        router.replace(matchPagePath)
      }, FAILURE_REDIRECT_DELAY_MS)
    } finally {
      setConfirming(false)
    }
  }, [
    clearTimers,
    gameId,
    matchPagePath,
    mode,
    payload,
    router,
    triggerPlay,
  ])

  const handleReturnToMatch = useCallback(() => {
    clearMatchConfirmation()
    removeQueueEntry(supabase, {
      gameId,
      mode,
      ownerId: payload?.viewerId || undefined,
    }).catch((errorCause) => {
      console.warn('[MatchReadyClient] 큐 제거 실패:', errorCause)
    })
    router.replace(matchPagePath)
  }, [gameId, matchPagePath, mode, payload?.viewerId, router])

  const handleReturnToRoom = useCallback(() => {
    clearMatchConfirmation()
    removeQueueEntry(supabase, {
      gameId,
      mode,
      ownerId: payload?.viewerId || undefined,
    }).catch((errorCause) => {
      console.warn('[MatchReadyClient] 큐 제거 실패:', errorCause)
    })
    router.replace(mainRoomPath)
  }, [gameId, mainRoomPath, mode, payload?.viewerId, router])

  useEffect(() => {
    if (!router.isReady) return
    if (!gameId || !mode) return
    const stored = loadMatchConfirmation()
    if (!stored || stored.gameId !== gameId || stored.mode !== mode || !stored.match) {
      clearMatchConfirmation()
      router.replace(matchPagePath)
      return
    }
    setPayload(stored)
    setStatus('ready')
    setError('')
    setNotice('')
    autoTriggerRef.current = false
    playTriggeredRef.current = false
  }, [gameId, matchPagePath, mode, router])

  useEffect(() => {
    if (!requiresManualConfirmation || status === 'confirmed' || status === 'failed' || status === 'expired') {
      clearTimers()
      return
    }
    setCountdown(CONFIRMATION_WINDOW_SECONDS)
    clearTimers()
    timerRef.current = setTimeout(handleTimeout, CONFIRMATION_WINDOW_SECONDS * 1000)
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => {
      clearTimers()
    }
  }, [clearTimers, handleTimeout, requiresManualConfirmation, status])

  useEffect(() => {
    if (!payload) return
    if (requiresManualConfirmation) return
    if (autoTriggerRef.current) return
    autoTriggerRef.current = true
    handleConfirm()
  }, [handleConfirm, payload, requiresManualConfirmation])

  useEffect(() => {
    return () => {
      clearTimers()
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
        redirectTimerRef.current = null
      }
    }
  }, [clearTimers])

  if (status === 'loading') {
    return <div className={styles.container}>매칭 정보를 불러오는 중…</div>
  }

  if (!payload) {
    return <div className={styles.container}>매칭 정보를 찾을 수 없어 대기열로 돌아갑니다…</div>
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.title}>{getModeLabel(mode)} 매칭 완료</h1>
        <p className={styles.subtitle}>
          {requiresManualConfirmation
            ? '모든 참가자가 확인하면 전투가 시작됩니다.'
            : '비실시간 매칭은 자동으로 전투가 시작됩니다.'}
        </p>
      </div>

      {matchMetaLines.length ? (
        <div className={styles.meta} role="note">
          {matchMetaLines.map((line) => (
            <p key={line} className={styles.metaLine}>
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

      {requiresManualConfirmation ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? '준비 중…' : '전투 시작하기'}
            <span className={styles.countdown}>{countdown}초</span>
          </button>
          <p className={styles.hint}>시간 안에 확인하지 않으면 매칭이 취소됩니다.</p>
        </div>
      ) : (
        <div className={styles.autoNotice}>
          <p className={styles.hint}>전투를 자동으로 준비하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.links}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={handleReturnToMatch}
        >
          매칭 화면으로 돌아가기
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={handleReturnToRoom}
        >
          메인 룸으로 이동
        </button>
      </div>
    </div>
  )
}
