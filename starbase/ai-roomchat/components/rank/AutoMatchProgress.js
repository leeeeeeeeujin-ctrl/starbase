'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import useMatchQueue from './hooks/useMatchQueue'
import styles from './AutoMatchProgress.module.css'
import { supabase } from '../../lib/supabase'

const HERO_BLOCKER_MESSAGE = '사용할 캐릭터를 선택해 주세요.'
const ROLE_BLOCKER_MESSAGE = '참가할 역할 정보를 불러오고 있습니다.'
const VIEWER_BLOCKER_MESSAGE = '로그인 상태를 확인하는 중입니다.'

const HERO_REDIRECT_DELAY_MS = 3000
const MATCH_TRANSITION_DELAY_MS = 1200
const QUEUE_TIMEOUT_MS = 60000
const CONFIRMATION_WINDOW_SECONDS = 10
const FAILURE_REDIRECT_DELAY_MS = 2400
const PENALTY_NOTICE =
  '확인 시간이 지나 매칭이 취소되었습니다. 게임에 참여하지 않으면 불이익이 있을 수 있습니다.'

function coerceHeroMap(raw) {
  if (!raw) return new Map()
  if (raw instanceof Map) return raw
  if (typeof raw !== 'object') return new Map()
  try {
    return new Map(Object.entries(raw))
  } catch (error) {
    console.warn('히어로 맵 변환 실패:', error)
    return new Map()
  }
}

function resolveHeroName(heroMap, heroId) {
  if (!heroId) return '미지정 캐릭터'
  const id = typeof heroId === 'string' ? heroId : String(heroId)
  const numericId = Number(id)
  const altKey = Number.isNaN(numericId) ? id : numericId
  const fromMap = heroMap.get(id) || heroMap.get(altKey)
  if (fromMap?.name) {
    return fromMap.name
  }
  if (fromMap?.displayName) {
    return fromMap.displayName
  }
  if (typeof fromMap === 'string' && fromMap.trim()) {
    return fromMap.trim()
  }
  return `캐릭터 #${id}`
}

function resolveMemberLabel({ member, heroMap }) {
  if (!member) {
    return '알 수 없는 참가자'
  }
  const heroId = member.hero_id || member.heroId || member.heroID || null
  const heroName = resolveHeroName(heroMap, heroId)
  const ownerId = member.owner_id || member.ownerId || ''
  if (!ownerId) {
    return heroName
  }
  const shortOwner = ownerId.length > 6 ? `${ownerId.slice(0, 3)}…${ownerId.slice(-2)}` : ownerId
  return `${heroName} · ${shortOwner}`
}

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

export default function AutoMatchProgress({ gameId, mode }) {
  const router = useRouter()
  const navigationLockedRef = useRef(false)
  const { state, actions } = useMatchQueue({ gameId, mode, enabled: Boolean(gameId) })
  const [joinError, setJoinError] = useState('')
  const joinSignatureRef = useRef('')
  const heroRedirectTimerRef = useRef(null)
  const queueTimeoutRef = useRef(null)
  const latestStatusRef = useRef('idle')
  const confirmationTimerRef = useRef(null)
  const confirmationIntervalRef = useRef(null)
  const penaltyRedirectRef = useRef(null)
  const [confirmationState, setConfirmationState] = useState('idle')
  const [confirmationRemaining, setConfirmationRemaining] = useState(
    CONFIRMATION_WINDOW_SECONDS,
  )
  const [confirming, setConfirming] = useState(false)

  const roleName = useMemo(() => resolveRoleName(state.lockedRole, state.roles), [
    state.lockedRole,
    state.roles,
  ])

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
    actions.cancelQueue()
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
  }, [actions, clearConfirmationTimers, gameId, router])

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

  const handleConfirmMatch = useCallback(async () => {
    if (confirmationState !== 'counting' || confirming) return

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
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          payload?.error || payload?.detail || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        setJoinError(message)
        return
      }

      const payload = await response.json().catch(() => ({}))
      if (!payload?.ok) {
        const message =
          payload?.error || '전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        setJoinError(message)
        return
      }

      clearConfirmationTimers()
      setConfirmationState('confirmed')
      setJoinError('')
    } catch (error) {
      console.error('세션 시작 실패:', error)
      setJoinError('전투를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setConfirming(false)
    }
  }, [
    clearConfirmationTimers,
    confirmationState,
    confirming,
    gameId,
    mode,
    roleName,
    state.match?.matchCode,
  ])

  useEffect(() => {
    latestStatusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    if (!gameId || !mode) return
    if (state.status === 'queued' || state.status === 'matched') return
    if (blockers.length) return

    const signature = `${state.viewerId || ''}::${state.heroId || ''}::${roleName}`
    if (!signature.trim()) return
    if (joinSignatureRef.current === signature) return

    joinSignatureRef.current = signature
    actions.joinQueue(roleName).then((result) => {
      if (!result?.ok) {
        setJoinError(result?.error || '대기열에 참가하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      } else {
        setJoinError('')
      }
    })
  }, [actions, blockers, gameId, mode, roleName, state.heroId, state.status, state.viewerId])

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
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current)
      }
      queueTimeoutRef.current = setTimeout(() => {
        setJoinError('1분 안에 매칭이 완료되지 않아 메인 룸으로 돌아갑니다.')
        if (!navigationLockedRef.current) {
          navigationLockedRef.current = true
          actions.cancelQueue()
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
  }, [actions, gameId, router, state.status])

  useEffect(() => {
    if (state.status !== 'matched') {
      clearConfirmationTimers()
      setConfirmationState('idle')
      setConfirmationRemaining(CONFIRMATION_WINDOW_SECONDS)
      return
    }

    if (queueTimeoutRef.current) {
      clearTimeout(queueTimeoutRef.current)
      queueTimeoutRef.current = null
    }

    if (confirmationState === 'idle') {
      startConfirmationCountdown()
    }
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
    if (state.status !== 'matched') return undefined
    if (confirmationState !== 'confirmed') return undefined

    const timer = setTimeout(() => {
      if (navigationLockedRef.current) return
      navigationLockedRef.current = true
      router.replace({ pathname: `/rank/${gameId}/start`, query: { mode } })
    }, MATCH_TRANSITION_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [confirmationState, gameId, mode, router, state.status])

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
      if (latestStatusRef.current === 'queued') {
        actions.cancelQueue()
      }
    }
  }, [actions])

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
    if (!state.match) return []
    const lines = []
    const { matchType, maxWindow, matchCode, brawlVacancies } = state.match
    if (matchType === 'brawl') {
      lines.push('난입 슬롯 충원 매치로 진행됩니다.')
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
    return lines
  }, [state.match])

  const display = useMemo(() => {
    if (confirmationState === 'confirmed') {
      return {
        title: '전투 화면으로 이동 중…',
        detail: '매칭이 확정되었습니다. 전투를 불러오고 있습니다.',
      }
    }

    if (confirmationState === 'counting') {
      return {
        title: '매칭이 잡혔습니다~',
        detail: `${confirmationRemaining}초 안에 버튼을 눌러 전투를 시작해 주세요.`,
      }
    }

    if (confirmationState === 'failed') {
      return {
        title: '매칭이 취소되었습니다.',
        detail: joinError || PENALTY_NOTICE,
      }
    }

    if (state.status === 'matched') {
      return {
        title: '매칭이 잡혔습니다~',
        detail: '확인 절차를 준비하고 있습니다.',
      }
    }

    if (state.status === 'queued') {
      return {
        title: '매칭 중…',
        detail: '대기열에 합류했습니다. 다른 참가자를 기다리고 있습니다.',
      }
    }

    if (joinError) {
      return {
        title: '매칭 준비 중…',
        detail: joinError,
      }
    }

    if (blockers.length) {
      return {
        title: '매칭 준비 중…',
        detail: blockers[0],
      }
    }

    return {
      title: '매칭 중…',
      detail: '대기열에 합류하고 있습니다.',
    }
  }, [
    blockers,
    confirmationRemaining,
    confirmationState,
    joinError,
    state.status,
  ])

  return (
    <div className={styles.root} aria-live="polite" aria-busy={state.status !== 'matched'}>
      <div className={styles.spinner} aria-hidden="true" />
      <div className={styles.status} role="status">
        <p className={styles.message}>{display.title}</p>
        <p className={styles.detail}>{display.detail}</p>
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
            >
              {confirming ? '준비 중…' : '전투 시작하기'}
              <span className={styles.confirmCountdown}>{confirmationRemaining}초</span>
            </button>
            <p className={styles.confirmHint}>모든 참가자가 확인하면 전투가 시작됩니다.</p>
          </div>
        ) : null}
        {extraBlockers.length ? (
          <ul className={styles.blockerList}>
            {extraBlockers.map((message) => (
              <li key={message} className={styles.blockerItem}>
                {message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {joinError && state.status === 'queued' ? (
        <p className={styles.srOnly} role="alert">{joinError}</p>
      ) : null}
    </div>
  )
}
