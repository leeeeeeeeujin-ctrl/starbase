import React from 'react'
import AuthButton from '../components/AuthButton'

export default function Home() {
  return (
    <main className="landing">
      <div className="content">
        <h1 className="title">천계전선</h1>
        <AuthButton variant="landing" label="신경망 연결" showGlyph={false} />
      </div>
      <style jsx>{`
        .landing {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: clamp(48px, 14vh, 160px) 16px clamp(40px, 12vh, 120px);
          color: #f8fafc;
          background-color: transparent;
          background-image: var(--landing-background-image, none);
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }

        .content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          text-align: center;
        }

        .title {
          margin: 0;
          font-size: clamp(3rem, 8vw, 5.5rem);
          letter-spacing: 0.18em;
          font-weight: 700;
          text-transform: uppercase;
          text-shadow: 0 10px 40px rgba(0, 0, 0, 0.65);
        }

        @media (max-width: 640px) {
          .landing {
            align-items: center;
          }

          .content {
            gap: 1.75rem;
          }

          .title {
            letter-spacing: 0.12em;
          }
        }
      `}</style>
    </main>
  )
}

//
