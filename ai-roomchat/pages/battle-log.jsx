'use client';

import Link from 'next/link';

export default function BattleLogPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '40px 24px 80px',
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(8,47,73,0.9) 60%, rgba(2,6,23,0.95) 100%)',
        color: '#e2e8f0',
      }}
    >
      <section
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'grid',
          gap: 18,
          borderRadius: 24,
          border: '1px solid rgba(94,234,212,0.28)',
          padding: '24px 26px',
          background: 'rgba(15,23,42,0.8)',
          boxShadow: '0 32px 96px -72px rgba(8,47,73,0.9)',
        }}
      >
        <header style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', letterSpacing: 0.6 }}>Battle Log</p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>
            커스텀 베틀로그 페이지
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#cbd5f5', lineHeight: 1.7 }}>
            전투 기록을 확장/커스텀하기 위한 전용 페이지입니다. 현재는 캐릭터 패널과 동일한 데이터를
            표시하지만, 향후에는 베틀로그 포맷, 필터, 정렬, 강조 스타일 등을 이곳에서 실험/구성할 수 있도록
            확장할 예정입니다.
          </p>
        </header>

        <div
          style={{
            padding: '16px 18px',
            borderRadius: 16,
            border: '1px dashed rgba(148,163,184,0.45)',
            background: 'rgba(15,23,42,0.65)',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#cbd5f5', lineHeight: 1.6 }}>
            커스텀 뷰/필터/하이라이트 설정은 아직 구현되지 않았습니다. 추가 요구사항이 정해지면 이 페이지에
            필터 UI와 전투 로그 뷰어를 붙여 드리겠습니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(94,234,212,0.45)',
              background: 'rgba(8,47,73,0.75)',
              color: '#e2e8f0',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            홈으로
          </Link>
          <Link
            href="/roster"
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.72)',
              color: '#e2e8f0',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            로스터 보기
          </Link>
        </div>
      </section>
    </main>
  );
}
