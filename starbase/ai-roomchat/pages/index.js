import React, { useEffect } from 'react'
import { useRouter } from 'next/router'

import AuthButton from '../components/AuthButton'
import { AUTH_STATUS, useAuth } from '../modules/auth'

export default function Home() {
  const router = useRouter()
  const { status, user } = useAuth()

  useEffect(() => {
    if (status === AUTH_STATUS.READY && user) {
      router.replace('/roster')
    }
  }, [router, status, user])

  return (
    <main
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '64px 24px 120px',
        backgroundImage: 'url(/landing/celestial-frontline.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        color: '#fff',
        textAlign: 'center',
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 700,
          marginBottom: 32,
          textShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
          letterSpacing: '0.04em',
        }}
      >
        천계전선
      </h1>
      <div style={{ marginTop: 'auto' }}>
        <AuthButton />
      </div>
    </main>
  )
}
