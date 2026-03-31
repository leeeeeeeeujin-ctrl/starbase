'use client';

export default function StartClient() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#020617', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Runtime Disabled
        </div>
        <h1 style={{ margin: 0, fontSize: 32 }}>기존 전투 시작 클라이언트는 비활성화되었습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          `StartClient`는 새 메이커 기준의 텍스트 배틀 실행기로 교체할 예정입니다.
        </p>
      </div>
    </div>
  );
}
