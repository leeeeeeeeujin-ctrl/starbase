'use client'

export default function MakerHomeHeader({ listHeader, errorMessage, onGoBack }) {
  return (
    <header
      style={{
        background: '#111827',
        color: '#f8fafc',
        borderRadius: 20,
        padding: '18px 20px',
        boxShadow: '0 30px 60px -38px rgba(15, 23, 42, 0.75)',
        display: 'grid',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onGoBack}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            color: '#f8fafc',
            fontWeight: 600,
          }}
        >
          ← 로비로
        </button>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>프롬프트 메이커</h1>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#cbd5f5' }}>
            터치 기반 워크플로우에 맞게 세트 목록을 중앙에 배치했어요. 빠른 작업은 우측 하단 버튼을 눌러 열 수 있습니다.
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{listHeader}</span>
        {errorMessage && <span style={{ fontSize: 12, color: '#fca5a5' }}>{errorMessage}</span>}
      </div>
    </header>
  )
}
