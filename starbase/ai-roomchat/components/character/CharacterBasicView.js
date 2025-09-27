'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 60px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 60px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const slideConfigs = [
  { key: 'character', label: '캐릭터' },
  { key: 'ranking', label: '랭킹', description: '랭킹 기능이 준비되는 대로 이곳에서 확인할 수 있어요.' },
  { key: 'search', label: '게임 검색', description: '게임 검색과 추천이 곧 추가됩니다.' },
  { key: 'friends', label: '친구', description: '친구와 길드를 관리할 수 있는 메뉴가 준비 중이에요.' },
  { key: 'guild', label: '길드', description: '길드 관리 기능이 곧 찾아옵니다.' },
  { key: 'settings', label: '설정', description: '환경 설정과 맞춤 기능이 준비되고 있어요.' },
]

const styles = {
  stage: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  topMessage: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: 'rgba(190, 227, 248, 0.9)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  sliderViewport: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 40,
  },
  sliderTrack: (index) => ({
    display: 'flex',
    width: `${slideConfigs.length * 100}%`,
    transform: `translateX(-${index * (100 / slideConfigs.length)}%)`,
    transition: 'transform 0.45s ease',
  }),
  slide: {
    flex: `0 0 ${100 / slideConfigs.length}%`,
    width: `${100 / slideConfigs.length}%`,
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 14px 46px',
    boxSizing: 'border-box',
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '160%',
    borderRadius: 36,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
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
    background: 'linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.92) 100%)',
  },
  heroNameOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    padding: '30px 32px 36px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
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
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlaySurface: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '10%',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    pointerEvents: 'none',
  },
  overlayTextBlock: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.7,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
    whiteSpace: 'pre-line',
  },
  cornerIcon: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 14,
    background: 'rgba(15,23,42,0.58)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: 3,
    padding: 6,
    boxShadow: '0 14px 30px -22px rgba(15,23,42,0.8)',
  },
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'rgba(226,232,240,0.78)',
  },
  placeholderCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 36,
    padding: '40px 36px',
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(96,165,250,0.24)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow: '0 44px 120px -60px rgba(37,99,235,0.5)',
  },
  placeholderLabel: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    color: '#e2e8f0',
    letterSpacing: '-0.02em',
  },
  placeholderCopy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: '#cbd5f5',
  },
  pagination: {
    display: 'flex',
    gap: 8,
  },
  paginationDot: (active) => ({
    width: active ? 14 : 8,
    height: 8,
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

  const abilityPairs = useMemo(() => {
    if (!hero) {
      return []
    }

    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(hero.ability1), normalize(hero.ability2)].filter(Boolean)
    const secondPair = [normalize(hero.ability3), normalize(hero.ability4)].filter(Boolean)

    return [
      { label: '능력 1 & 2', entries: firstPair },
      { label: '능력 3 & 4', entries: secondPair },
    ].filter((pair) => pair.entries.length > 0)
  }, [hero])

  const [viewMode, setViewMode] = useState(0)
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    setViewMode(0)
    setActiveSlide(0)
  }, [hero?.id])

  useEffect(() => {
    if (activeSlide !== 0) {
      setViewMode(0)
    }
  }, [activeSlide])

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
    filter: viewMode === 0 ? 'none' : 'brightness(0.82)',
  }

  const clampIndex = useCallback((value) => {
    if (value < 0) return 0
    if (value > slideConfigs.length - 1) return slideConfigs.length - 1
    return value
  }, [])

  const goToSlide = useCallback(
    (index) => {
      setActiveSlide(clampIndex(index))
    },
    [clampIndex],
  )

  const pointerStartX = useRef(null)
  const pointerLastX = useRef(null)
  const pointerIdRef = useRef(null)
  const pointerSwipePreventTapRef = useRef(false)

  const finishSwipe = useCallback(
    (deltaX) => {
      if (Math.abs(deltaX) < 40) return
      if (deltaX > 0) {
        goToSlide(activeSlide + 1)
      } else {
        goToSlide(activeSlide - 1)
      }
    },
    [activeSlide, goToSlide],
  )

  const clearPointer = useCallback((event, shouldComplete = false) => {
    const pointerId = pointerIdRef.current
    if (pointerId == null) return

    if (shouldComplete && pointerStartX.current != null) {
      const lastX = pointerLastX.current ?? pointerStartX.current
      const delta = pointerStartX.current - lastX
      finishSwipe(delta)
    }

    if (pointerId != null && event?.currentTarget?.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(pointerId)
      } catch (error) {
        // ignore
      }
    }

    pointerIdRef.current = null
    pointerStartX.current = null
    pointerLastX.current = null
    if (!shouldComplete) {
      pointerSwipePreventTapRef.current = false
    }
  }, [finishSwipe])

  const shouldIgnoreSwipe = useCallback((target, container) => {
    if (!target || !container) return false
    let node = target
    while (node && node !== container) {
      if (node.dataset?.swipeIgnore === 'true') {
        return true
      }
      node = node.parentElement
    }
    return false
  }, [])

  const handlePointerDown = useCallback(
    (event) => {
      if (shouldIgnoreSwipe(event.target, event.currentTarget)) return
      pointerIdRef.current = event.pointerId
      pointerSwipePreventTapRef.current = false
      pointerStartX.current = event.clientX
      pointerLastX.current = event.clientX
      if (event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch (error) {
          // ignore capture errors
        }
      }
    },
    [shouldIgnoreSwipe],
  )

  const handlePointerMove = useCallback(
    (event) => {
      if (pointerIdRef.current !== event.pointerId) return
      pointerLastX.current = event.clientX
      if (
        pointerStartX.current != null &&
        Math.abs(pointerStartX.current - event.clientX) > 24
      ) {
        pointerSwipePreventTapRef.current = true
      }
    },
    [],
  )

  const handlePointerUp = useCallback(
    (event) => {
      if (pointerIdRef.current !== event.pointerId) return
      clearPointer(event, true)
    },
    [clearPointer],
  )

  const handlePointerCancel = useCallback(
    (event) => {
      if (pointerIdRef.current !== event.pointerId) return
      clearPointer(event, false)
    },
    [clearPointer],
  )

  const cycleViewMode = useCallback(() => {
    setViewMode((prev) => (prev + 1) % 3)
  }, [])

  const handleTap = useCallback(
    (options = {}) => {
      const skipSwipeCheck = options.skipSwipeCheck === true
      if (!skipSwipeCheck && pointerSwipePreventTapRef.current) {
        pointerSwipePreventTapRef.current = false
        return
      }

      pointerSwipePreventTapRef.current = false
      cycleViewMode()
    },
    [cycleViewMode],
  )

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToSlide(activeSlide - 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToSlide(activeSlide + 1)
      }
    },
    [activeSlide, goToSlide],
  )

  const heroSlide = (
    <div style={styles.heroCardShell}>
      <div
        role="button"
        tabIndex={0}
        style={styles.heroCard}
        data-swipe-ignore="true"
        onClick={() => handleTap()}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleTap({ skipSwipeCheck: true })
          }
        }}
      >
        <div style={styles.cornerIcon} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={`dot-${index}`} style={styles.cornerDot} />
          ))}
        </div>

        {hero?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.image_url} alt={heroName} style={imageStyle} />
        ) : (
          <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
        )}

        {viewMode === 0 ? (
          <div style={styles.heroNameOverlay}>
            <p style={styles.heroNameBadge}>{heroName}</p>
          </div>
        ) : null}

        {viewMode === 1 ? (
          <div style={styles.overlaySurface}>
            <p style={styles.overlayTextBlock}>{description}</p>
          </div>
        ) : null}

        {viewMode === 2 ? (
          <div style={styles.overlaySurface}>
            {abilityPairs.length ? (
              abilityPairs.map((pair) => (
                <p key={pair.label} style={styles.overlayTextBlock}>
                  {`${pair.label}:\n${pair.entries.join('\n')}`}
                </p>
              ))
            ) : (
              <p style={styles.overlayTextBlock}>등록된 능력이 없습니다.</p>
            )}
          </div>
        ) : null}

        <div style={styles.tapHint} aria-hidden="true">
          탭해서 정보 보기
        </div>
      </div>
    </div>
  )

  const placeholderSlides = useMemo(
    () => slideConfigs.slice(1),
    [],
  )

  return (
    <div style={backgroundStyle}>
      <div style={styles.stage}>
        <p style={styles.topMessage}>좌우로 밀어 캐릭터, 랭킹, 게임 찾기를 오갈 수 있어요.</p>

        <div
          role="region"
          aria-label="캐릭터 상세 슬라이더"
          style={styles.sliderViewport}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={(event) => {
            if (pointerIdRef.current != null) {
              clearPointer(event, false)
            }
          }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div style={styles.sliderTrack(activeSlide)}>
            <div style={styles.slide}>{heroSlide}</div>
            {placeholderSlides.map((slide) => (
              <div key={slide.key} style={styles.slide}>
                <div style={styles.placeholderCard}>
                  <p style={styles.placeholderLabel}>{slide.label}</p>
                  <p style={styles.placeholderCopy}>{slide.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.pagination} aria-hidden="true">
          {slideConfigs.map((slide, index) => (
            <span key={slide.key} style={styles.paginationDot(index === activeSlide)} />
          ))}
        </div>
      </div>
    </div>
  )
}
