export default function ArenaStagingPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Arena Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>아레나 준비 투표 화면을 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#cbd5e1' }}>
          별도 준비 투표 경로는 새 세션 흐름으로 대체할 예정입니다.
        </p>
      </div>
    </div>
  );
}
