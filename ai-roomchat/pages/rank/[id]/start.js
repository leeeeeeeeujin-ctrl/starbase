import Link from 'next/link';

export default function RankStartPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Start Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 전투 시작 화면은 비활성화되었습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          이 경로는 `StartClient` 기반의 구식 실행 흐름에 묶여 있어 더 이상 사용하지 않습니다.
          새 텍스트 배틀 실행기가 준비되면 다시 연결합니다.
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
