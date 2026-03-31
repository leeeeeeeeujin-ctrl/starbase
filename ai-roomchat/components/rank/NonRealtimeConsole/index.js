'use client';

export default function NonRealtimeConsole() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Console Disabled
        </div>
        <h1 style={{ margin: 0, fontSize: 32 }}>비실시간 콘솔은 비활성화되었습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          새 텍스트 배틀 세션/실행 구조로 교체하기 전까지는 사용하지 않습니다.
        </p>
      </div>
    </div>
  );
}
