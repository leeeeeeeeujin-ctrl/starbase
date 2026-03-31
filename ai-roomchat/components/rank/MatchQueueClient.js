'use client';

export default function MatchQueueClient() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Match Disabled
        </div>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 매치 큐 클라이언트는 비활성화되었습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          구식 대기열과 세션 조합 로직은 새 매칭 시스템으로 다시 구현할 예정입니다.
        </p>
      </div>
    </div>
  );
}
