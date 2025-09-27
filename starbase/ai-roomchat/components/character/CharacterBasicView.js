'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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

const styles = {
  layout: {
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 28,
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

  useEffect(() => {
    setMode(0)
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

  return (
    <div style={backgroundStyle}>
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
    </div>
  )
}
