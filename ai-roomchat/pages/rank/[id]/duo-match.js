import Link from 'next/link';

export default function DuoRankMatchPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Match Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>듀오 랭크 매칭 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          구식 듀오 매칭 클라이언트는 새 기준선에 맞지 않아 더 이상 열지 않습니다.
        </p>
        <Link href="/match" style={{ color: '#93c5fd' }}>
          매치 화면으로 이동
        </Link>
      </div>
    </div>
  );
}
