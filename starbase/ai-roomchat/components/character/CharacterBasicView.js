'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION = '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 18px 60px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.94) 55%, rgba(2,6,23,0.98) 100%)',
    color: '#e2e8f0',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 18px 60px',
    boxSizing: 'border-box',
    color: '#e2e8f0',
    backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.9) 60%, rgba(2,6,23,0.97) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const menuOrder = ['캐릭터', '랭킹', '게임 검색', '친구', '길드', '설정']

const styles = {
  sliderViewport: {
    width: '100%',
    maxWidth: 540,
    overflow: 'hidden',
    position: 'relative',
  },
  sliderTrack: (index) => ({
    display: 'flex',
    width: '100%',
    transform: `translateX(-${index * 100}%)`,
    transition: 'transform 0.4s ease',
  }),
  slide: {
    flex: '0 0 100%',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '42px 20px 56px',
    boxSizing: 'border-box',
  },
  layout: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 28,
  },
  placeholderLayout: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 18,
    padding: '36px 30px',
    boxSizing: 'border-box',
    background: 'rgba(15,23,42,0.72)',
    borderRadius: 28,
    border: '1px solid rgba(96,165,250,0.25)',
    boxShadow: '0 42px 110px -58px rgba(37,99,235,0.55)',
  },
  placeholderBadge: {
    alignSelf: 'flex-start',
    padding: '8px 16px',
    borderRadius: 999,
    background: 'rgba(30,64,175,0.4)',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  placeholderTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: '#e2e8f0',
  },
  placeholderCopy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: '#cbd5f5',
  },
  topMessage: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: 'rgba(190, 227, 248, 0.88)',
    textAlign: 'center',
  },
  heroCardShell: {
    width: '100%',
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '140%',
    borderRadius: 36,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(15,23,42,0.65)',
    boxShadow: '0 42px 110px -58px rgba(37,99,235,0.65)',
    cursor: 'pointer',
  },
  heroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 0.3s ease',
  },
  heroFallback: {
    position: 'absolute',
    inset: 0,
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
    width: '100%',
    padding: '28px 30px 34px',
    background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.9) 74%, rgba(2,6,23,0.98) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.75)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlaySurface: {
    position: 'absolute',
    inset: '12% 10% 18%',
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
  menuTabs: {
    marginTop: 28,
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuTab: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.55)',
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  activeMenuTab: {
    borderColor: 'rgba(96,165,250,0.65)',
    background: 'rgba(30,64,175,0.5)',
    color: '#e0f2fe',
    boxShadow: '0 12px 32px -24px rgba(59,130,246,0.85)',
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
  const [activeMenu, setActiveMenu] = useState(0)

  useEffect(() => {
    setMode(0)
    setActiveMenu(0)
  }, [hero?.id])

  const handleTap = () => {
    setMode((prev) => (prev + 1) % 3)
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

  const imageStyle = {
    ...styles.heroImage,
    filter: mode === 0 ? 'none' : 'brightness(0.52)',
  }

  const touchStartX = useRef(null)
  const lastTouchX = useRef(null)

  const clampMenu = useCallback((value) => {
    if (value < 0) return 0
    if (value > menuOrder.length - 1) return menuOrder.length - 1
    return value
  }, [])

  const goToMenu = useCallback(
    (index) => {
      setActiveMenu(clampMenu(index))
    },
    [clampMenu],
  )

  const handleSwipe = useCallback(
    (deltaX) => {
      if (Math.abs(deltaX) < 45) return
      if (deltaX > 0) {
        goToMenu(activeMenu + 1)
      } else {
        goToMenu(activeMenu - 1)
      }
    },
    [activeMenu, goToMenu],
  )

  const handleTouchStart = useCallback((event) => {
    if (event.touches.length !== 1) return
    const x = event.touches[0].clientX
    touchStartX.current = x
    lastTouchX.current = x
  }, [])

  const handleTouchMove = useCallback((event) => {
    if (!touchStartX.current) return
    if (event.touches.length !== 1) return
    lastTouchX.current = event.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current == null || lastTouchX.current == null) {
      touchStartX.current = null
      lastTouchX.current = null
      return
    }

    const deltaX = touchStartX.current - lastTouchX.current
    touchStartX.current = null
    lastTouchX.current = null
    handleSwipe(deltaX)
  }, [handleSwipe])

  const heroSlide = (
    <div style={styles.layout}>
      <p style={styles.topMessage}>이미지를 탭하면 소개와 능력을 순서대로 볼 수 있어요.</p>

      <div style={styles.heroCardShell}>
        <div
          role="button"
          tabIndex={0}
          style={styles.heroCard}
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

          {mode === 0 ? (
            <div style={styles.heroNameOverlay}>
              <p style={styles.heroNameBadge}>{heroName}</p>
            </div>
          ) : null}

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

          <div style={styles.tapHint} aria-hidden="true">
            탭해서 정보 보기
          </div>
        </div>
      </div>
    </div>
  )

  const placeholderSlides = useMemo(
    () =>
      menuOrder.slice(1).map((label) => ({
        label,
        description: `${label} 메뉴는 곧 추가될 예정입니다.`,
      })),
    [],
  )

  return (
    <div style={backgroundStyle}>
      <div
        style={styles.sliderViewport}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={styles.sliderTrack(activeMenu)}>
          <div style={styles.slide}>{heroSlide}</div>
          {placeholderSlides.map((slide) => (
            <div key={slide.label} style={styles.slide}>
              <div style={styles.placeholderLayout}>
                <span style={styles.placeholderBadge}>준비중</span>
                <p style={styles.placeholderTitle}>{slide.label}</p>
                <p style={styles.placeholderCopy}>{slide.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.menuTabs}>
        {menuOrder.map((label, index) => {
          const isActive = index === activeMenu
          return (
            <button
              key={label}
              type="button"
              onClick={() => goToMenu(index)}
              style={{
                ...styles.menuTab,
                ...(isActive ? styles.activeMenuTab : null),
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
