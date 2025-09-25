import React from 'react'
import AuthButton from '../components/AuthButton'

export default function Home() {
  return (
    <main className="landing">
      <div className="overlay">
        <h1>천계전선</h1>
        <p className="tagline">별빛 아래에서 펼쳐지는 전선에 합류하세요.</p>
        <div className="action">
          <AuthButton variant="landing" label="Google로 로그인" />
        </div>
      </div>
      <style jsx>{`
        .landing {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background-image: url('/landing/celestial-frontline.svg');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          color: #f8fafc;
          padding: 12vh 16px 10vh;
        }

        .overlay {
          width: min(480px, 100%);
          background: linear-gradient(180deg, rgba(7, 11, 26, 0.4) 0%, rgba(7, 11, 26, 0.85) 100%);
          border-radius: 24px;
          padding: 32px 28px;
          backdrop-filter: blur(10px);
          box-shadow: 0 24px 60px rgba(4, 8, 20, 0.45);
          text-align: center;
        }

        h1 {
          margin: 0 0 12px;
          font-size: clamp(40px, 6vw, 72px);
          letter-spacing: 0.12em;
          font-weight: 700;
          text-shadow: 0 6px 24px rgba(12, 20, 44, 0.65);
        }

        .tagline {
          margin: 0 0 32px;
          font-size: clamp(16px, 2.2vw, 20px);
          color: rgba(229, 237, 255, 0.9);
          line-height: 1.6;
        }

        .action {
          display: flex;
          justify-content: center;
        }

        @media (max-width: 640px) {
          .landing {
            align-items: center;
            padding: 16vh 16px 12vh;
          }

          .overlay {
            padding: 28px 20px;
            background: linear-gradient(180deg, rgba(7, 11, 26, 0.55) 0%, rgba(7, 11, 26, 0.92) 100%);
          }

          .tagline {
            margin-bottom: 28px;
          }
        }
      `}</style>
    </main>
  )
}

//
