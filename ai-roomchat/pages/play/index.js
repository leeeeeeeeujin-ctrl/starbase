import Link from 'next/link';

export default function PlayHomePage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#020617', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Play Hub Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 플레이 허브는 정리 중입니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          레거시 랭크 허브 대신 메이커 중심 흐름으로 새 게임 진입 구조를 다시 만들고 있습니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/maker" style={{ color: '#f8fafc' }}>
            메이커로 이동
          </Link>
          <Link href="/match" style={{ color: '#93c5fd' }}>
            매치 화면으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
