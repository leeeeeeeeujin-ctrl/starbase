import React from 'react'
import AuthButton from '../components/AuthButton'

export default function Home() {
  return (
    <main
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '64px 24px 120px',
        backgroundImage: 'url(/landing/fox-night.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        color: '#fff',
        textAlign: 'center',
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 700,
          marginBottom: 32,
          textShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
          letterSpacing: '0.04em',
        }}
      >
        그 때의 영광 속으로
      </h1>
      <div style={{ marginTop: 'auto' }}>
        <AuthButton />
      </div>
    </main>
  )
}
