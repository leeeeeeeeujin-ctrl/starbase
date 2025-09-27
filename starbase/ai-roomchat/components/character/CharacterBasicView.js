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
    padding: '32px 16px',
    boxSizing: 'border-box',
    background: 'radial-gradient(circle at top, rgba(30,64,175,0.35) 0%, rgba(2,6,23,0.92) 65%)',
    color: '#e2e8f0',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 16px',
    boxSizing: 'border-box',
    color: '#e2e8f0',
    backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.62) 0%, rgba(2,6,23,0.78) 55%, rgba(2,6,23,0.92) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
}

const styles = {
  layout: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  sliderRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  navButton: {
    border: 'none',
    borderRadius: 18,
    padding: '14px 18px',
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 18px 52px -40px rgba(15,23,42,0.9)',
  },
  sliderViewport: {
    position: 'relative',
    flex: '1 1 auto',
    overflow: 'hidden',
    borderRadius: 28,
    border: '1px solid rgba(59,130,246,0.35)',
    background: 'rgba(15,23,42,0.55)',
    boxShadow: '0 32px 110px -60px rgba(56,189,248,0.45)',
    minHeight: '72vh',
    maxHeight: '82vh',
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
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(2,6,23,0.82) 100%)',
  },
  placeholderInner: {
    maxWidth: 320,
    padding: '0 28px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  placeholderTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  placeholderSubtitle: {
    margin: 0,
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  heroFrame: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 0.3s ease',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 72,
    fontWeight: 800,
    background: 'rgba(30,64,175,0.45)',
  },
  infoOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.85) 100%)',
  },
  heroName: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  descriptionOverlay: {
    position: 'absolute',
    inset: '12% 10% 18%',
    background: 'rgba(15,23,42,0.7)',
    borderRadius: 24,
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflowY: 'auto',
  },
  overlayTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  overlayText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: '#e2e8f0',
  },
  abilityList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  abilityItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'rgba(15,23,42,0.4)',
    borderRadius: 16,
    padding: '16px 18px',
  },
  abilityLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#93c5fd',
  },
  tapHint: {
    position: 'absolute',
    top: 20,
    right: 20,
    fontSize: 12,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
  },
  backOverlay: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    padding: '12px 18px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.78)',
    color: '#e2e8f0',
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 18px 52px -40px rgba(15,23,42,0.95)',
  },
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
      { key: 'ranking', title: '커뮤니티 랭킹', subtitle: '다른 플레이어들이 주목하는 영웅 소식을 준비 중입니다.' },
      { key: 'hero' },
      { key: 'search', title: '게임 검색', subtitle: '진행 중인 게임을 빠르게 찾아볼 수 있도록 곧 연결할 예정입니다.' },
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
  }

  return (
    <div style={backgroundStyle}>
      <div style={styles.layout}>
        <div style={styles.sliderRow}>
          <button type="button" onClick={handlePrev} style={styles.navButton}>
            ←
          </button>

          <div style={styles.sliderViewport}>
            <div
              style={{
                ...styles.sliderTrack,
                width: `${slides.length * 100}%`,
                transform: trackOffset,
              }}
            >
              {slides.map((slide) => (
                <div
                  key={slide.key}
                  style={{
                    ...styles.slide,
                    width: slideWidth,
                    minWidth: slideWidth,
                  }}
                >
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

                      <div style={styles.infoOverlay}>
                        <p style={styles.heroName}>{heroName}</p>
                      </div>

                      {mode === 1 ? (
                        <div style={styles.descriptionOverlay}>
                          <p style={styles.overlayTitle}>소개</p>
                          <p style={styles.overlayText}>{description}</p>
                        </div>
                      ) : null}

                      {mode === 2 ? (
                        <div style={styles.descriptionOverlay}>
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

                      <div style={styles.tapHint}>탭하여 정보 확인</div>

                      <Link href="/roster" style={styles.backOverlay}>
                        로스터로
                      </Link>
                    </div>
                  ) : (
                    <div style={styles.placeholderInner}>
                      <p style={styles.placeholderTitle}>{slide.title}</p>
                      <p style={styles.placeholderSubtitle}>{slide.subtitle}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={handleNext} style={styles.navButton}>
            →
          </button>
        </div>
      </div>
    </div>
  )
}
