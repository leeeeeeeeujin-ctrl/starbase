import Link from 'next/link';

export default function ArenaSessionPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Arena Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>아레나 세션 화면을 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          기존 아레나 세션 뷰는 새 텍스트 배틀 세션 모델로 대체할 예정입니다.
        </p>
        <Link href="/match" style={{ color: '#93c5fd' }}>
          매치 화면으로 이동
        </Link>
      </div>
    </div>
  );
}
