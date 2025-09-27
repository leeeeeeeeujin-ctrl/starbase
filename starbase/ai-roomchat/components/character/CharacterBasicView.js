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
    padding: '36px 18px 48px',
    boxSizing: 'border-box',
    background:
      'radial-gradient(circle at top, rgba(59,130,246,0.28) 0%, rgba(15,23,42,0.78) 45%, rgba(2,6,23,0.94) 100%)',
    color: '#e2e8f0',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '36px 18px 48px',
    boxSizing: 'border-box',
    color: '#e2e8f0',
    backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.75) 0%, rgba(2,6,23,0.88) 55%, rgba(2,6,23,0.96) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const styles = {
  layout: {
    width: '100%',
    maxWidth: 920,
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  topMessage: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  backChip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'linear-gradient(135deg, rgba(30,64,175,0.35) 0%, rgba(30,41,59,0.85) 100%)',
    color: '#e2e8f0',
    textDecoration: 'none',
    fontSize: 20,
    fontWeight: 700,
    boxShadow: '0 18px 42px -32px rgba(15,23,42,0.85)',
  },
  carouselShell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  sliderViewport: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 32,
    border: '1px solid rgba(96,165,250,0.25)',
    background: 'rgba(15,23,42,0.65)',
    boxShadow: '0 44px 110px -58px rgba(37,99,235,0.65)',
    minHeight: '72vh',
    display: 'flex',
  },
  sliderTrack: {
    display: 'flex',
    width: '100%',
    height: '100%',
    transition: 'transform 0.45s ease',
  },
  slide: {
    position: 'relative',
    minWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCard: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '48px 36px',
    boxSizing: 'border-box',
    textAlign: 'center',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.75) 0%, rgba(2,6,23,0.92) 100%)',
  },
  placeholderTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  placeholderSubtitle: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: '#94a3b8',
  },
  heroFrame: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.4s ease, filter 0.3s ease',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 72,
    fontWeight: 800,
    background: 'linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.9) 100%)',
  },
  heroNameOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '22px 26px',
    background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.92) 100%)',
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
  },
  overlaySurface: {
    position: 'absolute',
    inset: '10% 9% 16%',
    background: 'rgba(2,6,23,0.78)',
    borderRadius: 28,
    padding: '28px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    overflowY: 'auto',
  },
  overlayTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  overlayText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.8,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
  abilityList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  abilityItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 16px',
    borderRadius: 16,
    background: 'rgba(15,23,42,0.55)',
  },
  abilityLabel: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: '#93c5fd',
    letterSpacing: 0.4,
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.7)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 18,
    boxShadow: '0 20px 50px -36px rgba(15,23,42,0.95)',
  },
  indicatorDots: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  indicatorDot: (active) => ({
    width: active ? 18 : 10,
    height: 10,
    borderRadius: 999,
    background: active ? '#38bdf8' : 'rgba(148,163,184,0.45)',
    transition: 'all 0.25s ease',
  }),
}

export default function CharacterBasicView({ hero }) {
  const heroName = useMemo(() => {
    if (!hero) return DEFAULT_HERO_NAME
    const trimmed = typeof hero.name === 'string' ? hero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [hero])

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

  const [mode, setMode] = useState(0)
  const [activeSlide, setActiveSlide] = useState(1)

  useEffect(() => {
    setMode(0)
    setActiveSlide(1)
  }, [hero?.id])

  const slides = useMemo(
    () => [
      {
        key: 'ranking',
        title: '커뮤니티 랭킹을 준비 중이에요',
        subtitle: '다른 플레이어들이 사랑하는 영웅을 곧 한눈에 살펴볼 수 있어요.',
      },
      { key: 'hero' },
      {
        key: 'search',
        title: '게임 찾기 기능이 곧 열립니다',
        subtitle: '함께할 세션을 빠르게 탐색할 수 있도록 편리한 검색을 붙일 예정이에요.',
      },
    ],
    [],
  )

  const handleTap = () => {
    if (activeSlide !== 1) return
    setMode((prev) => (prev + 1) % 3)
  }

  const handlePrev = () => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }

  const handleNext = () => {
    setActiveSlide((prev) => (prev + 1) % slides.length)
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

  const slideWidth = `${100 / slides.length}%`
  const trackOffset = `translateX(-${activeSlide * (100 / slides.length)}%)`

  const imageStyle = {
    ...styles.heroImage,
    filter: mode === 0 ? 'none' : 'brightness(0.55)',
    transform: mode === 0 ? 'scale(1.02)' : 'scale(1)',
  }

  return (
    <div style={backgroundStyle}>
      <div style={styles.layout}>
        <div style={styles.topBar}>
          <p style={styles.topMessage}>좌우로 밀어 캐릭터, 랭킹, 게임 찾기를 오갈 수 있어요.</p>
          <Link href="/roster" style={styles.backChip} aria-label="로스터로 돌아가기">
            ☰
          </Link>
        </div>

        <div style={styles.carouselShell}>
          <div style={styles.sliderViewport}>
            <div
              style={{
                ...styles.sliderTrack,
                width: `${slides.length * 100}%`,
                transform: trackOffset,
              }}
            >
              {slides.map((slide) => (
                <div key={slide.key} style={{ ...styles.slide, width: slideWidth }}>
                  {slide.key === 'hero' ? (
                    <div
                      role="button"
                      tabIndex={0}
                      style={styles.heroFrame}
                      onClick={handleTap}
                      onKeyUp={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          handleTap()
                        }
                      }}
                    >
                      {hero?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hero.image_url} alt={heroName} style={imageStyle} />
                      ) : (
                        <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
                      )}

                      <div style={styles.heroNameOverlay}>
                        <p style={styles.heroNameBadge}>{heroName}</p>
                      </div>

                      {mode === 1 ? (
                        <div style={styles.overlaySurface}>
                          <p style={styles.overlayTitle}>소개</p>
                          <p style={styles.overlayText}>{description}</p>
                        </div>
                      ) : null}

                      {mode === 2 ? (
                        <div style={styles.overlaySurface}>
                          <p style={styles.overlayTitle}>능력</p>
                          {abilityTexts.length ? (
                            <ul style={styles.abilityList}>
                              {abilityTexts.map((text, index) => (
                                <li key={`ability-${index}`} style={styles.abilityItem}>
                                  <p style={styles.abilityLabel}>능력 {index + 1}</p>
                                  <p style={styles.overlayText}>{text}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p style={styles.overlayText}>등록된 능력이 없습니다.</p>
                          )}
                        </div>
                      ) : null}

                      <div style={styles.tapHint}>이미지를 탭하면 정보가 바뀌어요</div>
                    </div>
                  ) : (
                    <div style={styles.placeholderCard}>
                      <p style={styles.placeholderTitle}>{slide.title}</p>
                      <p style={styles.placeholderSubtitle}>{slide.subtitle}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={styles.controlsRow}>
            <button type="button" onClick={handlePrev} style={styles.circleButton} aria-label="이전">
              ←
            </button>
            <div style={styles.indicatorDots}>
              {slides.map((slide, index) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={`${slide.key}-${index}`}
                  style={styles.indicatorDot(activeSlide === index)}
                />
              ))}
            </div>
            <button type="button" onClick={handleNext} style={styles.circleButton} aria-label="다음">
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
