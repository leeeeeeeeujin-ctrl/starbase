import React, { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'

import AuthButton from '../components/AuthButton'
import { useAuth } from '../hooks/useAuth'
import styles from '../styles/LandingPage.module.css'

export default function Home() {
  const router = useRouter()
  const { status, user, error } = useAuth()

  useEffect(() => {
    if (status === 'ready' && user) {
      router.replace('/roster')
    }
  }, [router, status, user])

  const statusBlock = useMemo(() => {
    if (status === 'error') {
      return (
        <p className={`${styles.statusMessage} ${styles.statusMessageError}`}>
          {error || '로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'}
        </p>
      )
    }

    if (status === 'loading') {
      return <p className={styles.statusMessage}>접속 상태를 확인하고 있습니다…</p>
    }

    return null
  }, [error, status])

  return (
    <main className={styles.landing}>
      <h1 className={styles.title}>천계전선</h1>
      <div className={styles.cta}>
        <AuthButton />
      </div>
      {statusBlock}
    </main>
  )
}
