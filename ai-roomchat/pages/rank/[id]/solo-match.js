import Link from 'next/link';

export default function SoloRankMatchPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Match Route Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>솔로 랭크 매칭 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          구식 솔로 매칭 클라이언트는 더 이상 사용하지 않습니다.
          새 매칭 시스템은 이후 `/match` 기준으로 다시 붙일 예정입니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/match" style={{ color: '#93c5fd' }}>
            매치 화면으로 이동
          </Link>
          <Link href="/maker" style={{ color: '#f9fafb' }}>
            메이커로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
