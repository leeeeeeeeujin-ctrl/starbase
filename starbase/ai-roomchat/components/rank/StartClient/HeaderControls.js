export default function HeaderControls({
  onBack,
  title,
  description,
  preflight,
  onStart,
  onAdvance,
  isAdvancing,
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <button type="button" onClick={onBack} style={{ padding: '8px 12px' }}>
        ← 뒤로가기
      </button>
      <div style={{ flex: '1 1 240px' }}>
        <h2 style={{ margin: 0 }}>{title || '랭킹 게임'}</h2>
        <div style={{ fontSize: 13, color: '#475569' }}>
          {description || '등록된 설명이 없습니다.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onStart}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#111827',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          {preflight ? '게임 시작' : '다시 시작'}
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={isAdvancing}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: isAdvancing ? '#94a3b8' : '#2563eb',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          {isAdvancing ? '진행 중…' : '다음 턴'}
        </button>
      </div>
    </header>
  )
}

//
