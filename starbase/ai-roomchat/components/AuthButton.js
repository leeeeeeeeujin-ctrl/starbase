"use client"

import React, { useCallback, useMemo, useState } from 'react'

import { useAuth } from '../hooks/useAuth'
import { startGoogleOAuth } from '../lib/auth'
import styles from './AuthButton.module.css'

export default function AuthButton() {
  const { status } = useAuth()
  const [pending, setPending] = useState(false)

  const disabled = useMemo(() => status === 'loading' || pending, [status, pending])

  const signIn = useCallback(async () => {
    if (pending) return

    setPending(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const result = await startGoogleOAuth({ origin })

      if (result.status === 'redirect') {
        window.location.href = result.url
        return
      }

      alert(`로그인 실패: ${result.message}`)
    } catch (error) {
      console.error(error)
      alert('로그인 중 오류가 발생했습니다.')
    } finally {
      setPending(false)
    }
  }, [pending])

  const handleClick = useCallback(() => {
    if (!disabled) {
      void signIn()
    }
  }, [disabled, signIn])

  return (
    <button
      type="button"
      onClick={handleClick}
      className={styles.button}
      disabled={disabled}
      aria-busy={pending}
    >
      <span className={styles.label}>
        {pending ? <span className={styles.pendingIcon} aria-hidden="true" /> : null}
        {pending ? '접속 중…' : '신경망 접속'}
      </span>
    </button>
  )
}
