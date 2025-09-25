'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'

function HeroDetailCard({ hero, onBack }) {
  const abilityEntries = useMemo(() => {
    const entries = []
    for (let idx = 1; idx <= 4; idx += 1) {
      const value = hero[`ability${idx}`]
      if (value) {
        entries.push({ key: `ability${idx}`, label: `능력 ${idx}`, value })
      }
    }
    return entries
  }, [hero])

  const containerStyle = {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '64px 16px',
    position: 'relative',
    backgroundColor: '#020617',
    backgroundImage: hero.background_url ? `url(${hero.background_url})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }

  const overlayStyle = {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 960,
    background: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 24,
    padding: '32px 28px',
    boxShadow: '0 24px 60px rgba(2, 6, 23, 0.65)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    color: '#e2e8f0',
    backdropFilter: 'blur(12px)',
  }

  const headerStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 32,
  }

  const portraitStyle = {
    width: 200,
    height: 200,
    flexShrink: 0,
    borderRadius: 20,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(30, 41, 59, 0.6)',
  }

  const metaStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    flex: 1,
  }

  const abilityListStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginTop: 24,
  }

  const backButtonStyle = {
    marginBottom: 24,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  }

  return (
    <div style={containerStyle}>
      <div style={overlayStyle}>
        <button type="button" onClick={onBack} style={backButtonStyle}>
          ← 로스터로 돌아가기
        </button>

        <div style={headerStyle}>
          <div style={portraitStyle}>
            {hero.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.image_url}
                alt={`${hero.name} 초상화`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: 14,
                }}
              >
                이미지 없음
              </div>
            )}
          </div>

          <div style={metaStyle}>
            <div style={{ fontSize: 13, letterSpacing: '0.08em', color: '#94a3b8' }}>영웅 프로필</div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>{hero.name}</h1>
            {hero.description ? (
              <p style={{ margin: 0, lineHeight: 1.6, color: '#cbd5f5', whiteSpace: 'pre-line' }}>
                {hero.description}
              </p>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>설명이 등록되지 않았습니다.</p>
            )}
          </div>
        </div>

        <section>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>주요 능력</h2>
          {abilityEntries.length ? (
            <div style={abilityListStyle}>
              {abilityEntries.map(({ key, label, value }) => (
                <div
                  key={key}
                  style={{
                    borderRadius: 16,
                    padding: '18px 16px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(71, 85, 105, 0.45)',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: 12, color: '#64748b' }}>등록된 능력이 없습니다.</p>
          )}
        </section>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0.92))',
        }}
      />
    </div>
  )
}

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [hero, setHero] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!id) return undefined

    let cancelled = false
    setLoaded(false)
    setError(null)
    setHero(null)

    async function loadHero(heroId) {
      const { data, error: fetchError } = await supabase
        .from('heroes')
        .select(
          [
            'id',
            'name',
            'description',
            'ability1',
            'ability2',
            'ability3',
            'ability4',
            'image_url',
            'background_url',
          ].join(', ')
        )
        .eq('id', heroId)
        .maybeSingle()

      if (cancelled) return

      if (fetchError) {
        setError(fetchError)
        setHero(null)
      } else {
        setHero(data || null)
        setError(null)
      }
      setLoaded(true)
    }

    loadHero(id)

    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 24px',
          background: '#020617',
          color: '#e2e8f0',
          textAlign: 'center',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>캐릭터 정보를 불러오지 못했습니다.</h1>
        <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/roster')}
          style={{
            padding: '10px 20px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.7)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          로스터로 이동
        </button>
      </div>
    )
  }

  if (!hero && loaded) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 24px',
          background: '#020617',
          color: '#e2e8f0',
          textAlign: 'center',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>캐릭터를 찾을 수 없습니다.</h1>
        <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>
          연결된 영웅 정보를 확인할 수 없어요. 목록으로 돌아가 다시 선택해 주세요.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/roster')}
          style={{
            padding: '10px 20px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.7)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          로스터로 이동
        </button>
      </div>
    )
  }

  if (!hero) {
    return null
  }

  return <HeroDetailCard hero={hero} onBack={() => router.push('/roster')} />
}

// Simplified character detail page: fetch hero data and render the basic profile view without
// dashboard overlays or loading spinners.
