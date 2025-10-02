import React, { useEffect } from 'react'
import { useRouter } from 'next/router'

import AuthButton from '../components/AuthButton'
import { supabase } from '../lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function ensureSession() {
      try {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data?.session?.user) {
          router.replace('/roster')
        }
      } catch (error) {
        console.error('Failed to resolve auth session on landing:', error)
      }
    }

    ensureSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session?.user) {
        router.replace('/roster')
      }
      if (event === 'SIGNED_OUT') {
        router.replace('/')
      }
    })

    return () => {
      cancelled = true
      subscription?.subscription?.unsubscribe?.()
    }
  }, [router])

  return (
    <main
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '72px 24px 96px',
        backgroundImage:
          'linear-gradient(180deg, rgba(6, 10, 28, 0.82) 0%, rgba(6, 10, 28, 0.92) 70%, rgba(6, 10, 28, 0.98) 100%), url(/landing/celestial-frontline.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        color: '#f3f6ff',
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          margin: '0 auto',
          padding: '40px 36px 48px',
          borderRadius: 28,
          background:
            'linear-gradient(145deg, rgba(27, 36, 78, 0.72), rgba(9, 13, 32, 0.92))',
          border: '1px solid rgba(126, 149, 255, 0.28)',
          boxShadow:
            '0 22px 48px rgba(2, 6, 18, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
          textAlign: 'left',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            marginBottom: 18,
            borderRadius: 999,
            backgroundColor: 'rgba(114, 153, 255, 0.16)',
            color: '#bcd3ff',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Neural Frontier
        </span>
        <h1
          style={{
            fontSize: 'clamp(36px, 5vw, 58px)',
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: 20,
            color: '#ffffff',
            textShadow: '0 12px 38px rgba(0, 0, 0, 0.55)',
            letterSpacing: '-0.01em',
          }}
        >
          천계전선에 합류할 준비가 되셨나요?
        </h1>
        <p
          style={{
            fontSize: '18px',
            lineHeight: 1.66,
            color: 'rgba(226, 233, 255, 0.82)',
            marginBottom: 32,
            letterSpacing: '0.01em',
          }}
        >
          위태로운 전선에 투입될 영웅을 설계하고, 인공지능 참모와 함께 전략을 수립해 보세요.
          지금 접속하면 실시간 랭킹과 공개 채널에서 다른 지휘관들과 맞붙을 수 있습니다.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <AuthButton />
          <span
            style={{
              fontSize: 13,
              color: 'rgba(202, 214, 255, 0.7)',
              letterSpacing: '0.04em',
            }}
          >
            Google 계정으로 즉시 접속
          </span>
        </div>
      </div>
      <footer
        style={{
          marginTop: 'auto',
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '32px 8px 0',
          color: 'rgba(190, 205, 255, 0.55)',
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>Beta Access</span>
        <span style={{ color: 'rgba(190, 205, 255, 0.32)' }}>ver. 0.1.0</span>
      </footer>
    </main>
  )
}
