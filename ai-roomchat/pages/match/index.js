import Link from 'next/link';

export default function MatchPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#020617', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 18 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Match Rebuild Pending
        </p>
        <h1 style={{ margin: 0, fontSize: 34 }}>매칭 화면을 재구성하는 중입니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          기존 매칭은 `MatchQueueClient`, `MatchReadyClient`, `StartClient`, Realtime 세션 조합 로직에 깊게 묶여 있어
          새 텍스트 배틀 구조의 기준선으로 쓰지 않습니다.
        </p>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          다음 단계에서 메이커가 만드는 턴 정의를 기준으로 새 매칭과 세션 흐름을 다시 연결합니다.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/maker" style={{ color: '#f8fafc' }}>
            메이커로 이동
          </Link>
          <Link href="/lobby" style={{ color: '#93c5fd' }}>
            로비로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
