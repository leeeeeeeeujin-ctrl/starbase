'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION = '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 16px 48px',
    boxSizing: 'border-box',
    background: 'radial-gradient(circle at top, rgba(30,58,138,0.45) 0%, rgba(2,6,23,0.96) 65%)',
    color: '#e2e8f0',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 16px 48px',
    boxSizing: 'border-box',
    color: '#e2e8f0',
    backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.88) 0%, rgba(2,6,23,0.93) 55%, rgba(2,6,23,0.98) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
}

const styles = {
  layout: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  backLink: {
    alignSelf: 'flex-start',
    padding: '9px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.7)',
    color: '#cbd5f5',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 18px 48px -38px rgba(15,23,42,0.9)',
  },
  nameBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  heroName: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  heroMeta: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  imageShell: {
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    border: '1px solid rgba(59,130,246,0.35)',
    background: 'rgba(15,23,42,0.65)',
    minHeight: 540,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    boxShadow: '0 36px 120px -64px rgba(56,189,248,0.55)',
  },
  heroImage: {
    width: '100%',
    objectFit: 'cover',
  },
  overlayTint: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.15) 0%, rgba(2,6,23,0.75) 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '24px 24px 28px',
    gap: 12,
    pointerEvents: 'none',
  },
  overlayContent: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '32px 28px',
    textAlign: 'left',
    background: 'linear-gradient(180deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.85) 100%)',
    gap: 18,
    pointerEvents: 'none',
  },
  overlayTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#f8fafc',
  },
  overlayText: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
  abilityList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  abilityItem: {
    background: 'rgba(30,41,59,0.6)',
    borderRadius: 14,
    padding: '12px 14px',
    border: '1px solid rgba(148,163,184,0.25)',
  },
  abilityLabel: {
    margin: 0,
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#38bdf8',
    fontWeight: 700,
  },
  abilityText: {
    margin: '6px 0 0',
    fontSize: 14,
    lineHeight: 1.6,
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.68)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#bae6fd',
    pointerEvents: 'none',
  },
  appearances: {
    borderRadius: 24,
    border: '1px solid rgba(71,85,105,0.45)',
    background: 'rgba(2,6,23,0.78)',
    padding: '20px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 26px 72px -58px rgba(2,6,23,0.92)',
  },
  appearanceTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  appearanceList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  appearanceItem: {
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.6)',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  appearanceName: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  appearanceMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#94a3b8',
  },
}

function normaliseHeroName(hero) {
  if (!hero) return DEFAULT_HERO_NAME
  const name = typeof hero.name === 'string' ? hero.name.trim() : ''
  return name || DEFAULT_HERO_NAME
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function CharacterBasicView({ hero, appearances = [] }) {
  const heroName = useMemo(() => normaliseHeroName(hero), [hero])
  const createdAtText = useMemo(() => formatDate(hero?.created_at), [hero?.created_at])
  const description = useMemo(() => {
    if (!hero) return DEFAULT_DESCRIPTION
    const text = typeof hero.description === 'string' ? hero.description.trim() : ''
    return text || DEFAULT_DESCRIPTION
  }, [hero])

  const abilityTexts = useMemo(() => {
    if (!hero) return []
    return [hero.ability1, hero.ability2, hero.ability3, hero.ability4]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  }, [hero])

  const [panelIndex, setPanelIndex] = useState(0)
  useEffect(() => {
    setPanelIndex(0)
  }, [hero?.id])

  const mode = panelIndex % 3
  const handleTap = () => {
    setPanelIndex((prev) => (prev + 1) % 3)
  }

  const audioRef = useRef(null)
  useEffect(() => {
    if (!hero?.bgm_url) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      return
    }

    const audio = new Audio(hero.bgm_url)
    audio.loop = true
    audioRef.current = audio

    const tryPlay = async () => {
      try {
        await audio.play()
      } catch (error) {
        console.warn('Failed to autoplay character BGM', error)
      }
    }

    tryPlay()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
  }, [hero?.bgm_url])

  const backgroundStyle = hero?.background_url
    ? pageStyles.withBackground(hero.background_url)
    : pageStyles.base

  return (
    <div style={backgroundStyle}>
      <div style={styles.layout}>
        <header style={styles.header}>
          <Link href="/roster" style={styles.backLink}>
            ← 로스터로 돌아가기
          </Link>
          <div style={styles.nameBlock}>
            <h1 style={styles.heroName}>{heroName}</h1>
            <p style={styles.heroMeta}>
              {createdAtText ? `${createdAtText}에 생성됨` : '생성일 정보가 없습니다.'}
            </p>
          </div>
        </header>

        <section>
          <div
            style={styles.imageShell}
            role="button"
            tabIndex={0}
            onClick={handleTap}
            onKeyUp={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                handleTap()
              }
            }}
          >
            {hero?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.image_url}
                alt={heroName}
                style={{
                  ...styles.heroImage,
                  filter: mode === 0 ? 'none' : 'brightness(0.55)',
                }}
              />
            ) : (
              <div
                style={{
                  ...styles.heroImage,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(30,64,175,0.35)',
                  fontSize: 64,
                  fontWeight: 800,
                }}
              >
                {heroName.slice(0, 2)}
              </div>
            )}

            {mode === 0 ? (
              <div style={styles.overlayTint}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{heroName}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  이미지를 탭하면 캐릭터 정보가 순서대로 표시됩니다.
                </div>
              </div>
            ) : null}

            {mode === 1 ? (
              <div style={styles.overlayContent}>
                <p style={styles.overlayTitle}>소개</p>
                <p style={styles.overlayText}>{description}</p>
              </div>
            ) : null}

            {mode === 2 ? (
              <div style={styles.overlayContent}>
                <p style={styles.overlayTitle}>능력</p>
                {abilityTexts.length ? (
                  <ul style={styles.abilityList}>
                    {abilityTexts.map((text, index) => (
                      <li key={`ability-${index}`} style={styles.abilityItem}>
                        <p style={styles.abilityLabel}>능력 {index + 1}</p>
                        <p style={styles.abilityText}>{text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={styles.overlayText}>등록된 능력이 없습니다.</p>
                )}
              </div>
            ) : null}

            <div style={styles.tapHint}>탭해서 보기 전환</div>
          </div>
        </section>

        <section style={styles.appearances}>
          <h2 style={styles.appearanceTitle}>최근 등장 기록</h2>
          {appearances.length ? (
            <ul style={styles.appearanceList}>
              {appearances.map((entry) => (
                <li key={entry.id || `${entry.gameId}-${entry.slotNo || 'slot'}`} style={styles.appearanceItem}>
                  <p style={styles.appearanceName}>{entry.gameName || '비공개 게임'}</p>
                  <p style={styles.appearanceMeta}>
                    {entry.slotNo ? `${entry.slotNo}번 슬롯` : '슬롯 미지정'} ·{' '}
                    {entry.gameCreatedAt ? formatDate(entry.gameCreatedAt) : '최근 기록'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p style={styles.emptyText}>
              아직 등장 기록이 없습니다. 새로운 게임 세션에 참가하면 이곳에 기록이 표시됩니다.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
