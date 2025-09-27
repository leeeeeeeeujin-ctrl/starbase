'use client'

import { useMemo } from 'react'

export default function MakerEditorHeader({ setName, busy, onBack, onSave, onExport, onImport, onGoLobby }) {
  const title = useMemo(() => setName || '이름 없는 세트', [setName])

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '18px 28px 14px',
        color: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.45)',
            background: 'rgba(15, 23, 42, 0.65)',
            color: '#e2e8f0',
            fontWeight: 600,
            backdropFilter: 'blur(6px)',
          }}
        >
          ← 목록
        </button>
        <div style={{ display: 'grid' }}>
          <strong style={{ fontSize: 18, letterSpacing: '-0.01em' }}>{title}</strong>
          <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>프롬프트 세트를 구성하고 저장하세요.</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            padding: '10px 18px',
            borderRadius: 999,
            background: busy ? 'rgba(59, 130, 246, 0.4)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 12px 30px -18px rgba(37, 99, 235, 0.9)',
            transition: 'transform 0.2s ease',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
        </button>
        <button
          onClick={onExport}
          style={{
            padding: '9px 16px',
            borderRadius: 999,
            background: 'rgba(148, 163, 184, 0.16)',
            color: '#e2e8f0',
            fontWeight: 600,
            border: '1px solid rgba(148, 163, 184, 0.35)',
          }}
        >
          내보내기
        </button>
        <label
          style={{
            padding: '9px 16px',
            borderRadius: 999,
            border: '1px dashed rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#e2e8f0',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          가져오기
          <input type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
        </label>
        <button
          onClick={onGoLobby}
          style={{
            padding: '9px 16px',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#f8fafc',
            fontWeight: 600,
            border: '1px solid rgba(148, 163, 184, 0.35)',
          }}
        >
          로비로
        </button>
      </div>
    </header>
  )
}

//
