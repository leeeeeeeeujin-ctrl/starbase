export default function HeaderControls({
  onBack,
  title,
  description,
  preflight,
  onStart,
  onAdvance,
  isAdvancing,
  canAdvance,
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        borderRadius: 20,
        padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        color: '#e2e8f0',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '10px 16px',
          borderRadius: 999,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.45)',
          color: '#e2e8f0',
          cursor: 'pointer',
        }}
      >
        ← 로비로
      </button>
      <div style={{ flex: '1 1 240px' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title || '랭킹 게임'}</h2>
        <div style={{ fontSize: 13, color: 'rgba(226, 232, 240, 0.7)' }}>
          {description || '등록된 설명이 없습니다.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onStart}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background: '#111827',
            color: '#f8fafc',
            fontWeight: 700,
            border: 'none',
          }}
        >
          {preflight ? '게임 시작' : '다시 시작'}
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={isAdvancing || !canAdvance}
          style={{
            padding: '10px 16px',
            borderRadius: 999,
            background:
              isAdvancing || !canAdvance ? 'rgba(37, 99, 235, 0.35)' : '#2563eb',
            color: '#f8fafc',
            fontWeight: 700,
            border: 'none',
            cursor: isAdvancing || !canAdvance ? 'not-allowed' : 'pointer',
          }}
        >
          {isAdvancing ? '진행 중…' : '다음 턴'}
        </button>
      </div>
    </header>
  )
}

//
