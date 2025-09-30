import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import useMatchQueue from './hooks/useMatchQueue'
import styles from './AutoMatchProgress.module.css'

export default function AutoMatchProgress({ gameId, mode }) {
  const router = useRouter()
  const { state, actions } = useMatchQueue({ gameId, mode, enabled: Boolean(gameId) })
  const [localError, setLocalError] = useState('')
  const navigationLockRef = useRef(false)
  const statusRef = useRef(state.status)
  const lastAttemptKeyRef = useRef('')

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    if (state.status === 'idle') {
      lastAttemptKeyRef.current = ''
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
    if (state.status !== 'idle') return

    const heroToken = state.heroId || ''
    const attemptKey = `${preferredRole}:${heroToken}`
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
  }, [actions, gameId, preferredRole, state.heroId, state.status])

  useEffect(() => {
    const message = state.error || localError
    if (!message) return
    if (!gameId) return
    if (!/캐릭터|영웅/.test(message)) return
    router.replace(`/rank/${gameId}`)
  }, [gameId, localError, router, state.error])

  useEffect(() => {
    if (state.status !== 'matched' || !state.match) return
    if (navigationLockRef.current) return
    navigationLockRef.current = true
    router.replace({ pathname: `/rank/${gameId}/start`, query: { mode } })
  }, [gameId, mode, router, state.match, state.status])

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
      <div className={styles.loader}>
        <div className={styles.spinner} aria-hidden />
        <p className={styles.primaryText}>매칭 중…</p>
        {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
      </div>
    </div>
  )
}
