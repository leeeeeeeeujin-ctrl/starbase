'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import LogoutButton from '../components/LogoutButton'
import { supabase } from '../lib/supabase'

export default function Roster() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        if (active) {
          setError(authError.message)
          setLoading(false)
        }
        return
      }

      if (!user) {
        router.replace('/')
        return
      }

      const { data, error: heroesError } = await supabase
        .from('heroes')
        .select('id,name,image_url,created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (!active) return

      if (heroesError) {
        setError(heroesError.message)
        setRows([])
      } else {
        setRows(data || [])
      }

      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [router])

  const renderBody = () => {
    if (loading) {
      return (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
            color: '#cbd5f5',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          로스터를 불러오는 중입니다…
        </div>
      )
    }

    if (error) {
      return (
        <div
          style={{
            padding: '18px 20px',
            borderRadius: 16,
            border: '1px solid rgba(239,68,68,0.45)',
            background: 'rgba(239,68,68,0.08)',
            color: '#fee2e2',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )
    }

    if (rows.length === 0) {
      return (
        <div
          style={{
            padding: '24px 20px',
            borderRadius: 18,
            background: 'rgba(15,23,42,0.45)',
            color: '#e2e8f0',
            textAlign: 'center',
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          아직 등록된 영웅이 없습니다.
          <br />
          상단의 <span style={{ color: '#38bdf8' }}>+ 영웅 만들기</span> 버튼으로 첫 캐릭터를 만들어보세요.
        </div>
      )
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          paddingBottom: 32,
        }}
      >
        {rows.map((row) => (
          <Link key={row.id} href={`/character/${row.id}`} passHref>
            <a
              style={{
                display: 'block',
                borderRadius: 22,
                overflow: 'hidden',
                background: 'rgba(15,23,42,0.65)',
                border: '1px solid rgba(148,163,184,0.3)',
                boxShadow: '0 18px 45px -28px rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(6px)',
                color: '#f8fafc',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: '70%',
                  background: '#0f172a',
                }}
              >
                {row.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image_url}
                    alt={row.name}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 28,
                      fontWeight: 700,
                      color: '#94a3b8',
                      letterSpacing: 2,
                    }}
                  >
                    {row.name?.slice(0, 2) ?? '??'}
                  </div>
                )}
                <div
                  style={{
                    position: 'absolute',
                    inset: 'auto 0 0 0',
                    padding: '20px 20px 18px',
                    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.85) 90%)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700, textShadow: '0 4px 12px rgba(15,23,42,0.6)' }}>{row.name}</div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#cbd5f5',
                      letterSpacing: 0.6,
                    }}
                  >
                    {formatDate(row.created_at)}
                  </span>
                </div>
              </div>
            </a>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 45%, #020617 100%)',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '28px 18px 120px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button
              type="button"
              onClick={() => router.push('/lobby')}
              style={{
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.65)',
                color: '#e2e8f0',
                padding: '8px 16px',
                borderRadius: 999,
                fontWeight: 600,
                boxShadow: '0 10px 22px -18px rgba(15, 23, 42, 1)',
              }}
            >
              ← 로비로
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/create" passHref>
                <a
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                    color: '#fff',
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxShadow: '0 16px 40px -22px rgba(56, 189, 248, 0.9)',
                  }}
                >
                  + 영웅 만들기
                </a>
              </Link>
              <LogoutButton onAfter={() => router.replace('/')} />
            </div>
          </div>

          <div
            style={{
              borderRadius: 24,
              overflow: 'hidden',
              background: 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(14,165,233,0.08) 100%)',
              border: '1px solid rgba(148,163,184,0.25)',
              padding: '24px 20px 28px',
              boxShadow: '0 30px 80px -46px rgba(14,165,233,0.55)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: '#bae6fd', letterSpacing: 1 }}>내 영웅 목록</span>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>영웅을 소환하고 전설을 시작하세요</h1>
            <p style={{ margin: 0, color: '#cbd5f5', lineHeight: 1.6 }}>
              아래 카드들을 눌러 능력을 확인하거나 수정할 수 있습니다. 새 영웅을 만들고 로비에서 동료들과 공유해
              보세요.
            </p>
          </div>
        </header>

        {renderBody()}
      </div>
    </div>
  )
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })
}
