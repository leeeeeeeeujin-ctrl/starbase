import Link from 'next/link';

export default function RankHubPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#020617', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Rank Hub Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 랭크 허브는 정리 중입니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          이 화면은 구식 등록, 대기열, 세션 조합 로직을 중심으로 짜여 있어 더 이상 기준선으로 두지 않습니다.
          새 매칭 구조는 메이커 중심 텍스트 배틀 흐름에 맞춰 다시 연결합니다.
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
