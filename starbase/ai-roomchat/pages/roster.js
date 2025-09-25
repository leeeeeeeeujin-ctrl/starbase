'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import LogoutButton from '../components/LogoutButton'
import { supabase } from '../lib/supabase'
import { withTable } from '@/lib/supabaseTables'

export default function Roster() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (!active) return

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (!user) {
        router.replace('/')
        return
      }

      const metadata = user.user_metadata || {}
      const derivedName =
        metadata.full_name ||
        metadata.name ||
        metadata.nickname ||
        (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
        '사용자'
      const derivedAvatar = metadata.avatar_url || metadata.picture || metadata.avatar || null

      setDisplayName(derivedName)
      setAvatarUrl(derivedAvatar)

      const { data, error: heroesError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id,name,image_url,created_at')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      )

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
    const createCard = (
      <Link href="/create" passHref>
        <a
          style={{
            display: 'block',
            borderRadius: 22,
            overflow: 'hidden',
            border: '1px solid rgba(96, 165, 250, 0.55)',
            background: 'linear-gradient(135deg, rgba(2,6,23,0.92) 0%, rgba(15,23,42,0.92) 100%)',
            boxShadow: '0 18px 45px -32px rgba(56, 189, 248, 0.65)',
            textDecoration: 'none',
            color: '#60a5fa',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingTop: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background:
                  'radial-gradient(circle at top, rgba(96,165,250,0.18) 0%, rgba(15,23,42,0.96) 65%)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  border: '1px solid rgba(96,165,250,0.65)',
                  background: 'rgba(30,64,175,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor" />
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.6 }}>영웅 생성</span>
                <span style={{ fontSize: 13, color: '#bfdbfe' }}>지금 영웅을 소환해보세요</span>
              </div>
            </div>
          </div>
        </a>
      </Link>
    )

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
        <>
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
          {createCard}
        </>
      )
    }

    if (rows.length === 0) {
      return (
        <>
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
            아래의 <span style={{ color: '#38bdf8' }}>영웅 생성</span> 카드를 눌러 첫 캐릭터를 만들어보세요.
          </div>
          {createCard}
        </>
      )
    }

    return (
      <>
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
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: '50%',
                  background: '#0f172a',
                }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDeleteTarget(row)
                  }}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.35)',
                    background: 'rgba(15,23,42,0.55)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 24px -16px rgba(15,23,42,0.9)',
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, background 0.15s ease',
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-label={`${row.name} 삭제`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9Z" fill="currentColor" />
                  </svg>
                </button>
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
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      textShadow: '0 6px 18px rgba(15,23,42,0.75)',
                      letterSpacing: 0.4,
                    }}
                  >
                    {row.name}
                  </div>
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
        {createCard}
      </>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #030712 0%, #0f172a 35%, #020617 100%)',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '32px 18px 120px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(59,130,246,0.35)',
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(15,23,42,0.75) 100%)',
                  color: '#bfdbfe',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                Tale of Heroes
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: -0.2,
                }}
              >
                나의 영웅 도감
              </h1>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                영웅들을 관리하고 로비에서 곧바로 자랑해 보세요.
              </p>
            </div>
            <LogoutButton
              avatarUrl={avatarUrl}
              displayName={displayName}
              onAfter={() => router.replace('/')}
            />
          </div>

          <div
            style={{
              borderRadius: 20,
              border: '1px solid rgba(96,165,250,0.25)',
              background: 'linear-gradient(135deg, rgba(30,64,175,0.32) 0%, rgba(15,23,42,0.78) 100%)',
              padding: '18px 20px',
              boxShadow: '0 22px 60px -38px rgba(30, 64, 175, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: '#e0f2fe', fontWeight: 700 }}>공식 커뮤니티 오픈!</span>
            <p style={{ margin: 0, color: '#bfdbfe', lineHeight: 1.6, fontSize: 13 }}>
              캐릭터 자랑, 설정 공유, 팬아트까지 모두 환영합니다. 지금 바로 커뮤니티에서 첫 인사를 남겨보세요.
            </p>
          </div>

          <div
            style={{
              position: 'relative',
              borderRadius: 28,
              overflow: 'hidden',
              border: '1px solid rgba(59,130,246,0.28)',
              background: 'linear-gradient(135deg, rgba(30,64,175,0.6) 0%, rgba(12,74,110,0.65) 45%, rgba(15,23,42,0.9) 100%)',
              padding: '28px 24px 36px',
              color: '#e0f2fe',
              boxShadow: '0 40px 95px -60px rgba(37, 99, 235, 0.8)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 20% 20%, rgba(165,243,252,0.32) 0%, rgba(13,148,136,0) 45%), radial-gradient(circle at 80% 0%, rgba(59,130,246,0.45) 0%, rgba(59,130,246,0) 55%)',
                opacity: 0.9,
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>영웅을 생성하고</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                }}
              >
                전설을 시작하세요
              </h2>
              <p style={{ margin: 0, color: '#bfdbfe', fontSize: 14, lineHeight: 1.7 }}>
                새로운 영웅을 만들고 스토리를 기록하면 플레이어들이 당신의 세계를 함께 즐기게 됩니다.
              </p>
            </div>
          </div>
        </header>

        <section
          style={{
            borderRadius: 24,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(2,6,23,0.55)',
            padding: '20px 18px 26px',
            boxShadow: '0 26px 65px -48px rgba(15,23,42,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>내 영웅 목록</h2>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{rows.length}명</span>
          </div>
          <div
            style={{
              maxHeight: '55vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              paddingRight: 4,
            }}
          >
            {renderBody()}
          </div>
        </section>
      </div>

      {deleteTarget ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: '90%',
              maxWidth: 320,
              borderRadius: 20,
              background: '#0f172a',
              border: '1px solid rgba(248,250,252,0.14)',
              boxShadow: '0 32px 80px -40px rgba(15,23,42,0.95)',
              padding: '26px 24px 24px',
              color: '#f8fafc',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                margin: '0 auto',
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9Z" fill="currentColor" />
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>영원히 삭제할까요?</h2>
              <p style={{ margin: 0, color: '#cbd5f5', lineHeight: 1.5, fontSize: 14 }}>
                삭제하면 3분간 새로 생성할 수 없습니다.
                <br />
                <strong>{deleteTarget.name}</strong> 영웅을 삭제하시겠습니까?
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  if (deleting) return
                  setDeleteTarget(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.4)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#f8fafc',
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!deleteTarget || deleting) return
                  setDeleting(true)
                  const { error: deleteError } = await withTable(supabase, 'heroes', (table) =>
                    supabase.from(table).delete().eq('id', deleteTarget.id),
                  )
                  if (deleteError) {
                    alert(deleteError.message)
                    setDeleting(false)
                    return
                  }
                  setRows((prev) => prev.filter((row) => row.id !== deleteTarget.id))
                  setDeleting(false)
                  setDeleteTarget(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 999,
                  border: 'none',
                  background: deleting ? 'rgba(248,113,113,0.5)' : 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 18px 48px -28px rgba(248,113,113,0.95)',
                  opacity: deleting ? 0.7 : 1,
                }}
                disabled={deleting}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

// 
