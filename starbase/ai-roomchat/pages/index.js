import React from 'react'
import AuthButton from '../components/AuthButton'

export default function Home() {
  return (
    <main className="landing">
      <div className="visualLayer" aria-hidden="true">
        <div className="backdrop" />
        <div className="leftPortrait" />
        <div className="rightBackdrop" />
        <div className="fog" />
        <div className="stars" />
      </div>
      <div className="buttonArea">
        <AuthButton variant="landing" label="Google로 로그인" />
      </div>
      <style jsx>{`
        .landing {
          position: relative;
          min-height: 100vh;
          margin: 0;
          background: radial-gradient(circle at 20% 20%, rgba(122, 162, 255, 0.32) 0%, rgba(11, 16, 38, 0.92) 55%, rgba(4, 6, 15, 0.98) 100%);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0 0 6vh;
          color: #f8fafc;
          overflow: hidden;
        }

        .visualLayer {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .backdrop {
          position: absolute;
          inset: 0;
          background: linear-gradient(145deg, rgba(6, 9, 24, 0.95) 0%, rgba(9, 12, 31, 0.92) 45%, rgba(9, 11, 20, 0.98) 70%, rgba(3, 5, 15, 1) 100%);
        }

        .leftPortrait,
        .rightBackdrop {
          position: absolute;
          bottom: 0;
          width: 60%;
          height: 105%;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          mix-blend-mode: lighten;
          filter: saturate(1.05) brightness(1.05);
        }

        .leftPortrait {
          left: -6%;
          background-image: var(--landing-left-art);
          mix-blend-mode: screen;
        }

        .rightBackdrop {
          right: -18%;
          background-image: var(--landing-right-art);
          filter: saturate(0.95) brightness(0.9) contrast(1.05);
          opacity: 0.82;
        }

        .fog {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 120%, rgba(83, 199, 255, 0.28), transparent 55%),
            radial-gradient(circle at 5% 40%, rgba(164, 205, 255, 0.24), transparent 50%),
            radial-gradient(circle at 75% 0%, rgba(255, 186, 220, 0.14), transparent 55%);
          opacity: 0.7;
        }

        .stars {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(1px 1px at 20% 10%, rgba(255, 255, 255, 0.9) 0%, transparent 60%),
            radial-gradient(1px 1px at 40% 35%, rgba(151, 197, 255, 0.9) 0%, transparent 55%),
            radial-gradient(1px 1px at 70% 25%, rgba(255, 255, 255, 0.8) 0%, transparent 60%),
            radial-gradient(1px 1px at 85% 60%, rgba(179, 226, 255, 0.8) 0%, transparent 65%);
          opacity: 0.35;
        }

        .buttonArea {
          position: relative;
          display: flex;
          justify-content: center;
          width: 100%;
          z-index: 10;
        }

        @media (max-width: 720px) {
          .leftPortrait,
          .rightBackdrop {
            width: 90%;
          }

          .leftPortrait {
            left: -18%;
          }

          .rightBackdrop {
            right: -30%;
            opacity: 0.68;
          }

          .landing {
            padding-bottom: 8vh;
          }
        }
      `}</style>
      <style jsx global>{`
        :root {
          --landing-left-art: url('/landing/left-portrait.svg');
          --landing-right-art: url('/landing/right-backdrop.svg');
        }
      `}</style>
    </main>
  )
}

//
