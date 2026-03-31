export default function ArenaSessionScorePage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', background: '#111827', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          Legacy Arena Disabled
        </p>
        <h1 style={{ margin: 0, fontSize: 32 }}>아레나 정산 화면을 비활성화했습니다.</h1>
        <p style={{ margin: 0, lineHeight: 1.7, color: '#d1d5db' }}>
          정산은 새 텍스트 배틀 세션 로그 구조에 맞춰 다시 구현할 예정입니다.
        </p>
      </div>
    </div>
  );
}
