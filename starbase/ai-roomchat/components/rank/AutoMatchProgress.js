import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import useMatchQueue from './hooks/useMatchQueue'
import styles from './AutoMatchProgress.module.css'

export default function AutoMatchProgress({ gameId, mode }) {
  const router = useRouter()
  const { state, actions } = useMatchQueue({ gameId, mode, enabled: Boolean(gameId) })
  const [localError, setLocalError] = useState('')
  const [phase, setPhase] = useState('search')
  const [confirmCountdown, setConfirmCountdown] = useState(10)
  const [notice, setNotice] = useState('')
  const navigationLockRef = useRef(false)
  const statusRef = useRef(state.status)
  const lastAttemptKeyRef = useRef('')
  const confirmTimerRef = useRef(null)
  const confirmIntervalRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  const redirectTimeoutRef = useRef(null)

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    if (state.status === 'idle') {
      lastAttemptKeyRef.current = ''
      navigationLockRef.current = false
    }
  }, [state.status])

  const preferredRole = useMemo(() => {
    if (state.lockedRole) return state.lockedRole
    if (Array.isArray(state.roles)) {
      for (const entry of state.roles) {
        if (!entry) continue
        if (typeof entry === 'string') return entry
        if (typeof entry === 'object' && entry.name) return entry.name
      }
    }
    return ''
  }, [state.lockedRole, state.roles])

  useEffect(() => {
    if (!gameId || !mode) return
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem('rank.start.mode', mode)
  }, [gameId, mode])

  useEffect(() => {
    if (!gameId || !preferredRole) return
    if (!state.viewerId) return
    if (state.status !== 'idle') return
    if (phase === 'notice') return

    const heroToken = state.heroId || ''
    if (!heroToken) return

    const attemptKey = `${preferredRole}:${heroToken}:${state.viewerId}`
    if (lastAttemptKeyRef.current === attemptKey) return

    lastAttemptKeyRef.current = attemptKey
    let cancelled = false

    actions
      .joinQueue(preferredRole)
      .then((result) => {
        if (cancelled) return
        if (!result?.ok && result?.error) {
          setLocalError(result.error)
        } else {
          setLocalError('')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLocalError(error?.message || '대기열에 합류하지 못했습니다.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [actions, gameId, phase, preferredRole, state.heroId, state.status, state.viewerId])

  useEffect(() => {
    const message = state.error || localError
    if (!message) return
    if (!gameId) return
    if (!/캐릭터|영웅/.test(message)) return
    router.replace(`/rank/${gameId}`)
  }, [gameId, localError, router, state.error])

  const clearConfirmTimers = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
    if (confirmIntervalRef.current) {
      clearInterval(confirmIntervalRef.current)
      confirmIntervalRef.current = null
    }
  }, [])

  const clearSearchTimeout = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }, [])

  const clearRedirectTimeout = useCallback(() => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current)
      redirectTimeoutRef.current = null
    }
  }, [])

  const handleReturnToRoom = useCallback(
    (message) => {
      setNotice(message)
      setPhase('notice')
      clearConfirmTimers()
      clearSearchTimeout()
      clearRedirectTimeout()
      actions.cancelQueue().catch(() => {})
      redirectTimeoutRef.current = setTimeout(() => {
        router.replace(`/rank/${gameId}`)
      }, 2500)
    },
    [actions, clearConfirmTimers, clearRedirectTimeout, clearSearchTimeout, gameId, router],
  )

  const handleConfirmTimeout = useCallback(() => {
    handleReturnToRoom('배틀 버튼을 누르지 않아 매칭이 취소되었습니다. 메인룸으로 돌아갑니다. 게임에 참여하지 않으면 불이익이 있을 수 있습니다.')
  }, [handleReturnToRoom])

  const startConfirmCountdown = useCallback(() => {
    clearConfirmTimers()
    setConfirmCountdown(10)
    confirmIntervalRef.current = setInterval(() => {
      setConfirmCountdown((prev) => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)
    confirmTimerRef.current = setTimeout(() => {
      handleConfirmTimeout()
    }, 10000)
  }, [clearConfirmTimers, handleConfirmTimeout])

  useEffect(() => {
    if (state.status === 'queued' && phase !== 'notice') {
      setPhase((current) => (current === 'confirm' ? current : 'search'))
      if (!searchTimeoutRef.current) {
        searchTimeoutRef.current = setTimeout(() => {
          handleReturnToRoom('1분 동안 매칭이 잡히지 않았습니다. 메인룸으로 돌아갑니다.')
        }, 60000)
      }
    } else {
      clearSearchTimeout()
    }
  }, [clearSearchTimeout, handleReturnToRoom, phase, state.status])

  useEffect(() => {
    if (state.status !== 'matched' || !state.match) return
    clearSearchTimeout()
    setNotice('')
    setPhase('confirm')
    startConfirmCountdown()
  }, [clearSearchTimeout, startConfirmCountdown, state.match, state.status])

  useEffect(() => {
    if (phase !== 'confirm') return
    if (state.status === 'queued' && !state.match) {
      clearConfirmTimers()
      setNotice('다른 참가자가 준비하지 않아 매칭을 다시 진행합니다.')
      setPhase('search')
    }
  }, [clearConfirmTimers, phase, state.match, state.status])

  useEffect(() => () => {
    clearConfirmTimers()
    clearSearchTimeout()
    clearRedirectTimeout()
  }, [clearConfirmTimers, clearRedirectTimeout, clearSearchTimeout])

  const handleConfirmBattle = useCallback(() => {
    if (!state.match || navigationLockRef.current) return
    navigationLockRef.current = true
    clearConfirmTimers()
    clearRedirectTimeout()
    router.replace({ pathname: `/rank/${gameId}/start`, query: { mode } })
  }, [clearConfirmTimers, clearRedirectTimeout, gameId, mode, router, state.match])

  useEffect(
    () => () => {
      if (statusRef.current === 'queued') {
        actions.cancelQueue().catch(() => {})
      }
    },
    [actions],
  )

  const errorMessage = state.error || localError

  return (
    <div className={styles.wrapper}>
      {phase === 'confirm' ? (
        <div className={styles.confirmCard}>
          <p className={styles.primaryText}>매칭이 잡혔습니다!</p>
          <p className={styles.secondaryText}>
            10초 안에 <strong>배틀</strong> 버튼을 눌러 주세요. 남은 시간 {confirmCountdown}초
          </p>
          <button type="button" className={styles.actionButton} onClick={handleConfirmBattle}>
            배틀
          </button>
        </div>
      ) : phase === 'notice' ? (
        <div className={styles.noticeCard}>
          <p className={styles.primaryText}>안내</p>
          <p className={styles.secondaryText}>{notice}</p>
        </div>
      ) : (
        <div className={styles.loader}>
          <div className={styles.spinner} aria-hidden />
          <p className={styles.primaryText}>매칭 중…</p>
          {notice ? <p className={styles.secondaryText}>{notice}</p> : null}
        </div>
      )}
      <div aria-live="assertive" className={styles.srOnly}>
        {errorMessage}
      </div>
    </div>
  )
}
