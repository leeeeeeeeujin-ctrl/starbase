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
  onCreateWithAI,
  onOpenCodeEditor,
  quickActions = [],
}) {
  if (collapsed) {
    return (
      <header
        style={{
          background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)',
          borderRadius: 16,
          padding: '12px 16px',
          boxShadow: '0 15px 35px -10px rgba(30, 27, 75, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{ 
            ...baseButton, 
            background: 'rgba(255,255,255,0.15)', 
            color: '#e0e7ff',
            border: '1px solid rgba(255,255,255,0.2)'
          }}
        >
          ← 목록
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{ 
            ...baseButton, 
            background: 'rgba(255,255,255,0.2)', 
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.3)',
            fontWeight: 700
          }}
        >
          ▼ 🎮 게임 제작 도구 펼치기
        </button>
        <strong style={{ 
          fontSize: 16, 
          color: '#ffffff', 
          flex: '1 1 auto',
          textShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }}>
          {setName || '새로운 게임'}
        </strong>
        
        {/* 🚀 접혀있어도 AI 버튼은 보이게! */}
        <button
          onClick={onCreateWithAI}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
            fontSize: 14
          }}
        >
          🤖 AI 게임
        </button>
        <button
          onClick={onOpenCodeEditor}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
            fontSize: 14
          }}
        >
          ⚡ 코드
        </button>
        
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
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#fff',
                opacity: action.disabled ? 0.55 : 1,
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)'
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenVariables}
            style={{ 
              ...baseButton, 
              background: 'rgba(248, 250, 252, 0.15)', 
              color: '#e0e7ff',
              border: '1px solid rgba(255,255,255,0.2)'
            }}
          >
            변수
          </button>
          <button
            type="button"
            onClick={onGoLobby}
            style={{ 
              ...baseButton, 
              background: 'rgba(15, 23, 42, 0.8)', 
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)'
            }}
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
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
        borderRadius: 20,
        padding: '16px 20px',
        boxShadow: '0 25px 50px -12px rgba(30, 27, 75, 0.6)',
        display: 'grid',
        gap: 16,
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ 
            ...baseButton, 
            background: 'rgba(255,255,255,0.15)', 
            color: '#e0e7ff',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)'
          }}
        >
          ← 목록
        </button>
        <strong style={{ 
          fontSize: 20, 
          color: '#ffffff', 
          flex: '1 1 auto',
          textShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          🎮 {setName || '새로운 게임 제작'}
        </strong>
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{ 
            ...baseButton, 
            background: 'rgba(255,255,255,0.1)', 
            color: '#cbd5e1',
            border: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          ▲ 접기
        </button>
      </div>

      {/* 🚀 메인 AI 액션 버튼들 - 매우 크고 눈에 띄게! */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        flexWrap: 'wrap',
        marginBottom: 8
      }}>
        <button
          onClick={onCreateWithAI}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 50%, #10b981 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: 'translateY(-1px)',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            minWidth: 200,
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 15px 35px -5px rgba(139, 92, 246, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🤖 <span>AI로 게임 만들기</span>
          </span>
        </button>
        
        <button
          onClick={onOpenCodeEditor}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #dc2626 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: 'translateY(-1px)',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            minWidth: 180,
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 15px 35px -5px rgba(245, 158, 11, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(245, 158, 11, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            ⚡ <span>JavaScript 코드 실행</span>
          </span>
        </button>
      </div>

      {/* 기본 프롬프트 추가 버튼들 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onAddPrompt}
          style={{ 
            ...baseButton, 
            background: 'rgba(31, 41, 55, 0.8)', 
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)'
          }}
        >
          + AI 프롬프트
        </button>
        <button
          onClick={onAddUserAction}
          style={{ 
            ...baseButton, 
            background: 'rgba(14, 165, 233, 0.8)', 
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)'
          }}
        >
          + 유저 액션
        </button>
        <button
          onClick={onAddSystem}
          style={{ 
            ...baseButton, 
            background: 'rgba(71, 85, 105, 0.8)', 
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)'
          }}
        >
          + 시스템
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{
            ...baseButton,
            background: busy ? 'rgba(17, 24, 39, 0.5)' : 'rgba(17, 24, 39, 0.9)',
            color: '#ffffff',
            opacity: busy ? 0.6 : 1,
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)',
            fontWeight: 700
          }}
        >
          {busy ? '💾 저장 중…' : '💾 저장'}
        </button>
        <button
          type="button"
          onClick={onOpenVariables}
          style={{ 
            ...baseButton, 
            background: 'rgba(248, 250, 252, 0.15)', 
            color: '#e0e7ff',
            border: '1px solid rgba(255,255,255,0.3)',
            backdropFilter: 'blur(8px)'
          }}
        >
          🎛️ 변수 설정
        </button>
      </div>

      {/* 유틸리티 버튼들 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onExport}
          style={{ 
            ...baseButton, 
            background: 'rgba(224, 242, 254, 0.15)', 
            color: '#bfdbfe',
            border: '1px solid rgba(191, 219, 254, 0.3)'
          }}
        >
          📤 내보내기
        </button>
        <label
          style={{
            ...baseButton,
            border: '1px dashed rgba(148, 163, 184, 0.5)',
            background: 'rgba(248, 250, 252, 0.1)',
            color: '#e2e8f0',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)'
          }}
        >
          📥 가져오기
          <input type="file" accept="application/json" onChange={onImport} style={{ display: 'none' }} />
        </label>
        <button
          onClick={onGoLobby}
          style={{ 
            ...baseButton, 
            background: 'rgba(15, 23, 42, 0.8)', 
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)'
          }}
        >
          🏆 랭킹 허브
        </button>
      </div>
    </header>
  )
}
