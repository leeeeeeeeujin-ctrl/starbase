export default function ManualConsolePage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Console Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>수동 콘솔 경로를 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          비실시간 콘솔은 새 실행환경 기준선에 포함하지 않습니다.
        </p>
      </div>
    </div>
  );
}
