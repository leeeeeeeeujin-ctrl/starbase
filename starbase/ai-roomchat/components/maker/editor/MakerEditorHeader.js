'use client'

const baseButton = {
  padding: '5px 10px',
  borderRadius: 10,
  border: '1px solid transparent',
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.2,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

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
  collapsed,
  onToggleCollapse,
  onOpenVariables,
  quickActions = [],
}) {
  if (collapsed) {
    return (
      <header
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '10px 14px',
          boxShadow: '0 12px 28px -22px rgba(15, 23, 42, 0.42)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{ ...baseButton, borderColor: '#dbeafe', background: '#eff6ff', color: '#1d4ed8' }}
        >
          ← 목록
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{ ...baseButton, borderColor: '#dbeafe', background: '#eff6ff', color: '#1d4ed8' }}
        >
          ▼ 펼치기
        </button>
        <strong style={{ fontSize: 14, color: '#0f172a', flex: '0 1 auto' }}>{setName || '이름 없는 세트'}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              style={{
                ...baseButton,
                padding: '5px 9px',
                background: '#0f172a',
                color: '#fff',
                opacity: action.disabled ? 0.55 : 1,
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenVariables}
            style={{ ...baseButton, background: '#f8fafc', borderColor: '#cbd5f5', color: '#0f172a' }}
          >
            변수
          </button>
          <button
            type="button"
            onClick={onGoLobby}
            style={{ ...baseButton, background: '#0f172a', color: '#fff' }}
          >
            허브
          </button>
        </div>
      </header>
    )
  }

  return (
    <header
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '12px 16px',
        boxShadow: '0 16px 40px -34px rgba(15, 23, 42, 0.38)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ ...baseButton, borderColor: '#dbeafe', background: '#eff6ff', color: '#1d4ed8' }}
        >
          ← 목록
        </button>
        <strong style={{ fontSize: 18, color: '#0f172a', flex: '1 1 auto' }}>{setName || '이름 없는 세트'}</strong>
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{ ...baseButton, borderColor: '#e2e8f0', background: '#f8fafc', color: '#334155' }}
        >
          ▲ 접기
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={onAddPrompt}
          style={{ ...baseButton, background: '#1f2937', color: '#fff' }}
        >
          + 프롬프트
        </button>
        <button
          onClick={onAddUserAction}
          style={{ ...baseButton, background: '#0ea5e9', color: '#fff' }}
        >
          + 유저
        </button>
        <button
          onClick={onAddSystem}
          style={{ ...baseButton, background: '#475569', color: '#fff' }}
        >
          + 시스템
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            ...baseButton,
            background: '#111827',
            color: '#fff',
            opacity: busy ? 0.55 : 1,
          }}
        >
          {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
        </button>
        <button
          type="button"
          onClick={onOpenVariables}
          style={{ ...baseButton, borderColor: '#cbd5f5', background: '#f8fafc', color: '#0f172a' }}
        >
          변수 설정
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={onExport}
          style={{ ...baseButton, background: '#e0f2fe', color: '#0369a1' }}
        >
          내보내기
        </button>
        <label
          style={{
            ...baseButton,
            border: '1px dashed #94a3b8',
            background: '#f8fafc',
            color: '#0f172a',
            cursor: 'pointer',
          }}
        >
          가져오기
          <input type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
        </label>
        <button
          onClick={onGoLobby}
          style={{ ...baseButton, background: '#0f172a', color: '#fff' }}
        >
          랭킹 허브
        </button>
      </div>
    </header>
  )
}
