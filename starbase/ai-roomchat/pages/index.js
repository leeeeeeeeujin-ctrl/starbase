import React from 'react'

import AuthButton from '../components/AuthButton'
import { useTitleTheme } from '@/hooks/title/TitleThemeContext'

function TitleBgmPlayer({ src }) {
  const audioRef = React.useRef(null)

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || !src) return

    const tryPlay = async () => {
      try {
        await audio.play()
      } catch (error) {
        console.warn('BGM autoplay was blocked by the browser.', error)
      }
    }

    audio.pause()
    audio.currentTime = 0
    audio.load()
    tryPlay()

    return () => {
      audio.pause()
    }
  }, [src])

  if (!src) return null

  return (
    <audio
      ref={audioRef}
      src={src}
      loop
      controls
      style={{
        position: 'fixed',
        left: 20,
        bottom: 20,
        width: 220,
        maxWidth: '60vw',
        opacity: 0.85,
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
      }}
    />
  )
}

export default function Home() {
  const theme = useTitleTheme()
  const titleText = theme.titleText || '천계전선'
  const subtitleText = theme.subtitleText || ''
  const backgroundImage = theme.backgroundImage || '/landing/celestial-frontline.svg'
  const overlayColor = theme.backgroundOverlay || 'rgba(0, 0, 0, 0.45)'

  return (
    <main style={styles.host}>
      <div
        aria-hidden="true"
        style={{
          ...styles.backdrop,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundSize: theme.backgroundSize || 'cover',
          backgroundPosition: theme.backgroundPosition || 'center',
        }}
      />
      <div aria-hidden="true" style={{ ...styles.overlay, backgroundColor: overlayColor }} />
      <section style={styles.content}>
        <h1 style={styles.title}>{titleText}</h1>
        {subtitleText ? <p style={styles.subtitle}>{subtitleText}</p> : null}
        <div style={styles.actionRow}>
          <AuthButton />
        </div>
      </section>
      <TitleBgmPlayer src={theme.bgmSource} />
    </main>
  )
}

const styles = {
  host: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '64px 24px 120px',
    overflow: 'hidden',
    fontFamily: '"Noto Sans KR", sans-serif',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundRepeat: 'no-repeat',
    transform: 'scale(1.02)',
    filter: 'brightness(0.95)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
  },
  content: {
    position: 'relative',
    zIndex: 2,
    display: 'grid',
    gap: 24,
    textAlign: 'center',
    color: '#fff',
    maxWidth: 560,
  },
  title: {
    fontSize: 'clamp(32px, 6vw, 64px)',
    fontWeight: 800,
    margin: 0,
    letterSpacing: '0.04em',
    textShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
  },
  subtitle: {
    margin: 0,
    fontSize: 'clamp(16px, 3vw, 22px)',
    color: 'rgba(255, 255, 255, 0.85)',
    textShadow: '0 6px 22px rgba(0, 0, 0, 0.35)',
  },
  actionRow: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'center',
  },
}

