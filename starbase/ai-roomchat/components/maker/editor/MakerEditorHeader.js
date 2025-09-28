'use client'

import { useEffect, useMemo, useState } from 'react'
import TutorialHint from './TutorialHint'

export default function MakerEditorHeader({ setName, busy, onBack, onSave, onExport, onImport, onGoLobby }) {
  const title = useMemo(() => setName || '이름 없는 세트', [setName])

  const [isCompact, setIsCompact] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return () => {}

    const media = window.matchMedia('(max-width: 768px)')
    const applyMatch = (matches) => {
      setIsCompact(matches)
      if (!matches) {
        setCollapsed(false)
      } else {
        setCollapsed(true)
      }
    }

    applyMatch(media.matches)

    const handleChange = (event) => {
      applyMatch(event.matches)
    }

    if (media.addEventListener) {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  const renderActions = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        justifyContent: isCompact ? 'flex-start' : 'flex-end',
      }}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        style={{
          padding: '10px 18px',
          borderRadius: 999,
          background: busy
            ? 'linear-gradient(135deg, rgba(147, 197, 253, 0.6), rgba(96, 165, 250, 0.6))'
            : 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          boxShadow: '0 12px 30px -18px rgba(37, 99, 235, 0.55)',
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
          background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(203, 213, 225, 0.85))',
          color: '#0f172a',
          fontWeight: 600,
          border: '1px solid rgba(148, 163, 184, 0.4)',
        }}
      >
        내보내기
      </button>
      <label
        style={{
          padding: '9px 16px',
          borderRadius: 999,
          border: '1px dashed rgba(148, 163, 184, 0.45)',
          background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.92), rgba(226, 232, 240, 0.88))',
          color: '#0f172a',
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
          background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.95), rgba(191, 219, 254, 0.9))',
          color: '#0f172a',
          fontWeight: 600,
          border: '1px solid rgba(148, 163, 184, 0.4)',
        }}
      >
        로비로
      </button>
    </div>
  )

  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 24px 12px',
        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.92), rgba(226, 232, 240, 0.9))',
        borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(148, 163, 184, 0.4)',
              background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.95), rgba(226, 232, 240, 0.9))',
              color: '#0f172a',
              fontWeight: 600,
              boxShadow: '0 10px 24px -20px rgba(15, 23, 42, 0.35)',
            }}
          >
            ← 목록
          </button>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 18, letterSpacing: '-0.01em' }}>{title}</strong>
            <span style={{ fontSize: 12, color: '#334155' }}>프롬프트 세트를 구성하고 저장하세요.</span>
          </div>
          <TutorialHint
            label="편집기 도움말"
            description="프롬프트를 구성하고 노드를 연결해 대화 흐름을 만듭니다. 필요 시 위 도구를 열어 저장·가져오기 작업을 진행하세요."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isCompact ? (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'linear-gradient(135deg, rgba(226, 232, 240, 0.92), rgba(203, 213, 225, 0.88))',
                color: '#0f172a',
                fontWeight: 600,
                boxShadow: '0 12px 24px -22px rgba(15, 23, 42, 0.4)',
              }}
            >
              {collapsed ? '도구 열기' : '도구 접기'}
            </button>
          ) : (
            renderActions()
          )}
        </div>
      </div>

      {isCompact && !collapsed && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{renderActions()}</div>
      )}
    </header>
  )
}

//
