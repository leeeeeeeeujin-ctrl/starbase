'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const overlayButtons = [
  { key: 'search', label: '방 검색' },
  { key: 'ranking', label: '랭킹' },
  { key: 'settings', label: '설정' },
]

const overlayCopy = {
  character: '이미지를 터치하면 설명과 능력이 순서대로 나타납니다.',
  search: '빠른 매칭과 커스텀 방 탐색 기능이 곧 추가됩니다.',
  ranking: '시즌별 팀 랭킹과 개인 순위를 준비 중이에요.',
  settings: '사운드, 그래픽, 단축키 등을 한자리에서 조정할 수 있도록 준비하고 있어요.',
}

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 120px',
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
    padding: '40px 18px 120px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const styles = {
  stage: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 48,
  },
  heroSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
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
    outline: 'none',
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
  heroInfoOverlay: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '12%',
    padding: '18px 22px',
    borderRadius: 28,
    background: 'rgba(15,23,42,0.78)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'none',
    boxShadow: '0 24px 60px -42px rgba(15,23,42,0.88)',
  },
  heroInfoTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#e0f2fe',
    letterSpacing: 0.2,
  },
  heroInfoText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.8,
    color: 'rgba(226,232,240,0.94)',
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
  overlayPanel: {
    position: 'fixed',
    left: '50%',
    bottom: 28,
    transform: 'translateX(-50%)',
    width: 'min(92vw, 720px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'rgba(15,23,42,0.72)',
    borderRadius: 26,
    padding: '20px 22px',
    boxShadow: '0 24px 60px -40px rgba(15,23,42,0.9)',
    border: '1px solid rgba(96,165,250,0.35)',
  },
  overlayHeaderRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  battleButton: {
    padding: '12px 20px',
    borderRadius: 999,
    border: 'none',
    background:
      'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(56,189,248,0.88) 100%)',
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: 'pointer',
    boxShadow: '0 18px 40px -28px rgba(37,99,235,0.8)',
    outline: 'none',
  },
  overlayButtonsRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  overlayButton: (active) => ({
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: active ? 'rgba(125,211,252,0.9)' : 'rgba(148,163,184,0.4)',
    background: active ? 'rgba(56,189,248,0.22)' : 'rgba(15,23,42,0.42)',
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
  }),
  overlayCopy: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(226,232,240,0.9)',
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

  const abilityGroups = useMemo(() => {
    if (!hero) {
      return []
    }

    const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
    const firstPair = [normalize(hero.ability1), normalize(hero.ability2)].filter(Boolean)
    const secondPair = [normalize(hero.ability3), normalize(hero.ability4)].filter(Boolean)

    const groups = []
    if (firstPair.length) {
      groups.push({ label: '능력 1 & 2', entries: firstPair })
    }
    if (secondPair.length) {
      groups.push({ label: '능력 3 & 4', entries: secondPair })
    }

    return groups
  }, [hero])

  const infoSequence = useMemo(() => {
    const sequence = []

    if (description) {
      sequence.push({ key: 'description', title: '설명', lines: [description] })
    }

    abilityGroups.forEach((group) => {
      sequence.push({ key: group.label, title: group.label, lines: group.entries })
    })

    return sequence
  }, [abilityGroups, description])

  const infoCount = infoSequence.length

  const [viewMode, setViewMode] = useState(0)
  const [activeOverlay, setActiveOverlay] = useState('character')

  useEffect(() => {
    setViewMode(0)
    setActiveOverlay('character')
  }, [hero?.id])

  useEffect(() => {
    if (activeOverlay !== 'character') {
      setViewMode(0)
    }
  }, [activeOverlay])

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
    filter: viewMode === 0 ? 'none' : 'brightness(0.72)',
  }

  const currentInfo = viewMode > 0 ? infoSequence[viewMode - 1] : null

  const handleTap = useCallback(() => {
    if (activeOverlay !== 'character') return
    if (infoCount === 0) return

    setViewMode((prev) => (prev + 1) % (infoCount + 1))
  }, [activeOverlay, infoCount])

  const handleKeyUp = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleTap()
      }
    },
    [handleTap],
  )

  const handleOverlayButton = useCallback((key) => {
    setActiveOverlay((prev) => (prev === key ? 'character' : key))
  }, [])

  const overlayDescription = overlayCopy[activeOverlay] ?? ''

  return (
    <>
      <div style={backgroundStyle}>
        <div style={styles.stage}>
          <div style={styles.heroSection}>
            <div style={styles.heroCardShell}>
              <div
                role="button"
                tabIndex={0}
                style={styles.heroCard}
                onClick={handleTap}
                onKeyUp={handleKeyUp}
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

                {currentInfo ? (
                  <div style={styles.heroInfoOverlay}>
                    <p style={styles.heroInfoTitle}>{currentInfo.title}</p>
                    <p style={styles.heroInfoText}>{currentInfo.lines.join('\n')}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={styles.overlayPanel}>
        {activeOverlay === 'character' ? (
          <div style={styles.overlayHeaderRow}>
            <button type="button" style={styles.battleButton}>
              전투 시작
            </button>
          </div>
        ) : null}

        <div style={styles.overlayButtonsRow}>
          {overlayButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              style={styles.overlayButton(activeOverlay === button.key)}
              onClick={() => handleOverlayButton(button.key)}
            >
              {button.label}
            </button>
          ))}
        </div>

        <p style={styles.overlayCopy}>{overlayDescription}</p>
      </div>
    </>
  )
}
