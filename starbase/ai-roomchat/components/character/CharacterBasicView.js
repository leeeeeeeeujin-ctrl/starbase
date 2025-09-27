'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

const styles = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    background: '#020617',
    color: '#e2e8f0',
    overflow: 'hidden',
  },
  backgroundLayer: {
    position: 'absolute',
    inset: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(18px)',
    transform: 'scale(1.08)',
    opacity: 0.35,
  },
  backgroundFallback: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at top, rgba(30,64,175,0.4), rgba(2,6,23,0.95))',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.45), rgba(2,6,23,0.85) 40%, rgba(2,6,23,0.95))',
  },
  content: {
    position: 'relative',
    maxWidth: 1280,
    margin: '0 auto',
    padding: '72px 32px 120px',
    display: 'flex',
    flexDirection: 'column',
    gap: 32,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
    flexWrap: 'wrap',
  },
  heroTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroEyebrow: {
    margin: 0,
    fontSize: 13,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: '#a5b4fc',
  },
  heroName: {
    fontSize: 44,
    margin: 0,
    fontWeight: 900,
    letterSpacing: '-0.04em',
  },
  heroSubtitle: {
    margin: 0,
    fontSize: 15,
    color: '#94a3b8',
    lineHeight: 1.7,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    color: '#e2e8f0',
    textDecoration: 'none',
    fontSize: 14,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr) 320px',
    gap: 32,
    alignItems: 'start',
  },
  columnCard: {
    borderRadius: 24,
    border: '1px solid rgba(148,163,184,0.22)',
    background: 'rgba(15,23,42,0.68)',
    boxShadow: '0 36px 90px -58px rgba(15,23,42,0.9)',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  columnTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 1,
  },
  columnText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: '#cbd5f5',
  },
  heroShowcase: {
    position: 'relative',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148,163,184,0.28)',
    minHeight: 520,
    background: 'rgba(15,23,42,0.85)',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 220ms ease',
  },
  heroImageFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 64,
    fontWeight: 800,
    color: '#0f172a',
    background: 'linear-gradient(135deg, rgba(56,189,248,0.65), rgba(129,140,248,0.65))',
  },
  heroShowcaseOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.15) 0%, rgba(2,6,23,0.75) 75%, rgba(2,6,23,0.95))',
    transition: 'background 160ms ease',
  },
  heroNameRibbon: {
    position: 'absolute',
    left: 24,
    bottom: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '18px 22px',
    borderRadius: 18,
    background: 'rgba(2,6,23,0.62)',
    border: '1px solid rgba(148,163,184,0.4)',
    backdropFilter: 'blur(14px)',
    color: '#f8fafc',
  },
  heroRibbonName: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  heroRibbonMeta: {
    margin: 0,
    fontSize: 13,
    letterSpacing: 2,
    color: '#cbd5f5',
  },
  heroDescriptionCard: {
    marginTop: 24,
    borderRadius: 24,
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'rgba(15,23,42,0.68)',
    padding: '28px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  descriptionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  descriptionText: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.8,
    color: '#cbd5f5',
    whiteSpace: 'pre-wrap',
  },
  abilityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
  },
  abilityCard: {
    borderRadius: 20,
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(30,64,175,0.18)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 140,
  },
  abilityLabel: {
    fontSize: 12,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: '#93c5fd',
  },
  abilityText: {
    margin: 0,
    fontSize: 15,
    color: '#f8fafc',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  abilityEmpty: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sliderControls: {
    display: 'flex',
    gap: 8,
  },
  sliderButton: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.6)',
    color: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  sliderBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sliderCard: {
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sliderGameName: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  sliderMeta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  sliderDescription: {
    margin: 0,
    fontSize: 14,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  sliderEmpty: {
    margin: 0,
    fontSize: 14,
    color: '#cbd5f5',
    lineHeight: 1.7,
  },
  indicatorDots: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'rgba(148,163,184,0.4)',
  },
  indicatorDotActive: {
    background: '#60a5fa',
  },
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function AbilityCard({ label, value }) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return (
    <div style={styles.abilityCard}>
      <span style={styles.abilityLabel}>{label}</span>
      {trimmed ? <p style={styles.abilityText}>{trimmed}</p> : <p style={styles.abilityEmpty}>아직 작성되지 않았습니다.</p>}
    </div>
  )
}

function AppearanceSlider({ appearances }) {
  const [index, setIndex] = useState(0)
  const total = appearances.length
  const safeIndex = total ? Math.max(0, Math.min(index, total - 1)) : 0
  const current = total ? appearances[safeIndex] : null

  useEffect(() => {
    if (!total) {
      setIndex(0)
    } else if (index > total - 1) {
      setIndex(total - 1)
    }
  }, [total, index])

  return (
    <div style={styles.columnCard}>
      <div style={styles.sliderHeader}>
        <h3 style={styles.columnTitle}>최근 참가한 게임</h3>
        <div style={styles.sliderControls}>
          <button
            type="button"
            style={styles.sliderButton}
            disabled={!total}
            onClick={() => setIndex((value) => (value - 1 + total) % total)}
          >
            ‹
          </button>
          <button
            type="button"
            style={styles.sliderButton}
            disabled={!total}
            onClick={() => setIndex((value) => (value + 1) % total)}
          >
            ›
          </button>
        </div>
      </div>
      <div style={styles.sliderBody}>
        {current ? (
          <div style={styles.sliderCard}>
            <h4 style={styles.sliderGameName}>{current.gameName}</h4>
            <p style={styles.sliderMeta}>
              {current.slotNo !== null ? `참가 슬롯 #${current.slotNo}` : '슬롯 정보 없음'} · {formatDate(current.gameCreatedAt)}
            </p>
            {current.gameDescription ? <p style={styles.sliderDescription}>{current.gameDescription}</p> : null}
          </div>
        ) : (
          <p style={styles.sliderEmpty}>
            아직 이 영웅의 참가 기록이 없습니다.
            <br />
            게임을 만들고 영웅을 참전시켜 첫 전투를 기록해 보세요.
          </p>
        )}
        <div style={styles.indicatorDots}>
          {Array.from({ length: Math.max(total, 1) }).map((_, dotIndex) => {
            const active = dotIndex === safeIndex
            return (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={dotIndex}
                style={{
                  ...styles.indicatorDot,
                  ...(active ? styles.indicatorDotActive : null),
                  opacity: total ? 1 : 0.3,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function CharacterBasicView({ hero, appearances }) {
  const audioRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const abilityEntries = useMemo(
    () => [
      { label: '능력 1', value: hero?.ability1 },
      { label: '능력 2', value: hero?.ability2 },
      { label: '능력 3', value: hero?.ability3 },
      { label: '능력 4', value: hero?.ability4 },
    ],
    [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4],
  )

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    if (!hero?.bgm_url) return undefined

    audio.volume = 0.6
    const tryPlay = () => {
      const result = audio.play()
      if (result && typeof result.catch === 'function') {
        result.catch(() => {})
      }
    }

    tryPlay()

    const resumeOnInteraction = () => {
      if (audio.paused) {
        tryPlay()
      }
    }

    window.addEventListener('click', resumeOnInteraction, { once: true })

    return () => {
      window.removeEventListener('click', resumeOnInteraction)
      audio.pause()
      audio.currentTime = 0
    }
  }, [hero?.bgm_url])

  const backgroundStyle = hero?.background_url
    ? { ...styles.backgroundLayer, backgroundImage: `url(${hero.background_url})` }
    : styles.backgroundFallback

  const showcaseOverlayStyle = {
    ...styles.heroShowcaseOverlay,
    background: pressed
      ? 'linear-gradient(180deg, rgba(2,6,23,0.65) 0%, rgba(2,6,23,0.9) 85%)'
      : hovered
        ? 'linear-gradient(180deg, rgba(2,6,23,0.25) 0%, rgba(2,6,23,0.75) 85%)'
        : styles.heroShowcaseOverlay.background,
  }

  const imageStyle = {
    ...styles.heroImage,
    transform: hovered ? 'scale(1.04)' : 'scale(1)',
  }

  const heroName = hero?.name || '이름 없는 영웅'
  const heroInitial = heroName.slice(0, 2)

  return (
    <div style={styles.page}>
      <div style={backgroundStyle} />
      <div style={styles.overlay} />
      <div style={styles.content}>
        <header style={styles.header}>
          <div style={styles.heroTitleGroup}>
            <p style={styles.heroEyebrow}>Character Profile</p>
            <h1 style={styles.heroName}>{heroName}</h1>
            <p style={styles.heroSubtitle}>
              배경과 브금을 설정하고 능력 카드를 채워 다른 플레이어에게 영웅의 매력을 보여주세요.
            </p>
          </div>
          <Link href="/roster" style={styles.backLink}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            로스터로 돌아가기
          </Link>
        </header>

        <div style={styles.columns}>
          <div style={styles.columnCard}>
            <h3 style={styles.columnTitle}>프로필 정보</h3>
            <p style={styles.columnText}>생성일 · {formatDate(hero?.created_at)}</p>
            <p style={styles.columnText}>
              {hero?.bgm_url
                ? '페이지를 열면 자동으로 브금이 재생됩니다. 영웅 테마곡이 잘 들리는지 확인해 보세요.'
                : '브금을 업로드하면 캐릭터 페이지 입장 시 자동으로 재생됩니다.'}
            </p>
            {hero?.bgm_url ? (
              <audio ref={audioRef} src={hero.bgm_url} loop autoPlay preload="auto" />
            ) : null}
          </div>

          <div>
            <div
              style={styles.heroShowcase}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => {
                setHovered(false)
                setPressed(false)
              }}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              onTouchStart={() => setPressed(true)}
              onTouchEnd={() => setPressed(false)}
            >
              <div style={showcaseOverlayStyle} />
              {hero?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero.image_url} alt={heroName} style={imageStyle} />
              ) : (
                <div style={styles.heroImageFallback}>{heroInitial}</div>
              )}
              <div style={styles.heroNameRibbon}>
                <p style={styles.heroRibbonMeta}>HERO</p>
                <p style={styles.heroRibbonName}>{heroName}</p>
                <p style={styles.heroRibbonMeta}>{hero?.owner_id ? `ID · ${hero.owner_id.slice(0, 8)}` : '나의 영웅'}</p>
              </div>
            </div>

            <div style={styles.heroDescriptionCard}>
              <h2 style={styles.descriptionTitle}>설명</h2>
              <p style={styles.descriptionText}>
                {hero?.description?.trim() || '아직 영웅 설명이 작성되지 않았습니다. 설정과 세계관을 적어 팬들과 공유해 보세요!'}
              </p>
              <div style={styles.abilityGrid}>
                {abilityEntries.map((entry) => (
                  <AbilityCard key={entry.label} label={entry.label} value={entry.value} />
                ))}
              </div>
            </div>
          </div>

          <AppearanceSlider appearances={appearances} />
        </div>
      </div>
    </div>
  )
}
