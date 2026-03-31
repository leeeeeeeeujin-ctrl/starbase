import Link from 'next/link';

export default function RankMatchReadyPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Match Ready Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 매치 준비 화면을 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          `MatchReadyClient`와 `StartClient` 기반 흐름은 새 매칭/세션 설계로 교체할 예정입니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/match" style={{ color: '#93c5fd' }}>
            매치 화면으로 이동
          </Link>
          <Link href="/maker" style={{ color: '#f8fafc' }}>
            메이커로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
