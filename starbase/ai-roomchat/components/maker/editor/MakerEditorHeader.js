'use client'

export default function MakerEditorHeader({
  setName,
  busy,
  onBack,
  onAddPrompt,
  onAddUserAction,
  onAddSystem,
  onSave,
  onExport,
  onImport,
  onGoLobby,
}) {
  return (
    <header
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 16px 40px -34px rgba(15, 23, 42, 0.45)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: '1px solid #cbd5f5',
            background: '#f1f5f9',
            color: '#0f172a',
            fontWeight: 600,
          }}
        >
          ← 목록
        </button>
        <strong style={{ fontSize: 16, color: '#0f172a' }}>{setName || '이름 없는 세트'}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onAddPrompt}
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          + 프롬프트
        </button>
        <button
          onClick={onAddUserAction}
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          + 유저 행동
        </button>
        <button
          onClick={onAddSystem}
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            background: '#6b7280',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          + 시스템
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            background: '#111827',
            color: '#fff',
            fontWeight: 600,
            opacity: busy ? 0.65 : 1,
          }}
        >
          {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onExport}
          style={{ padding: '8px 14px', borderRadius: 12, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}
        >
          내보내기
        </button>
        <label
          style={{
            padding: '8px 14px',
            borderRadius: 12,
            border: '1px dashed #94a3b8',
            background: '#f8fafc',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          가져오기
          <input type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
        </label>
        <button
          onClick={onGoLobby}
          style={{ padding: '8px 14px', borderRadius: 12, background: '#0f172a', color: '#fff', fontWeight: 600 }}
        >
          로비로
        </button>
      </div>
    </header>
  )
}

//
