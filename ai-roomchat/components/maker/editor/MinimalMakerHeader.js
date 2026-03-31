"use client";

export default function MinimalMakerHeader({
  busy,
  onBack,
  onSave,
}) {
  const btn = (label, onClick, style = {}) => (
    <button
      type="button"
      onClick={onClick}
      disabled={label === '저장' && busy}
      style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid rgba(148,163,184,.35)',
        background: 'rgba(255,255,255,.06)',
        color: '#e2e8f0',
        fontSize: 12,
        fontWeight: 700,
        ...style,
      }}
    >
      {label}
    </button>
  );

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)',
        borderRadius: 18,
        padding: '10px 12px',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {btn('← 목록', onBack)}
        <strong style={{ fontSize: 14 }}>실행 플로우 메이커</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {btn('저장', onSave, {
          background: busy ? 'rgba(148,163,184,0.2)' : '#16a34a',
          color: '#fff',
          borderColor: busy ? '#64748b' : '#16a34a',
        })}
      </div>
    </header>
  );
}
