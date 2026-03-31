import Link from 'next/link';

export default function RankNewPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Match Page Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 랭크 등록 화면은 정리 중입니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          레거시 랭크 등록/허브 경로는 새 매칭 구조로 교체할 예정입니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/maker" style={{ color: '#f9fafb' }}>
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
