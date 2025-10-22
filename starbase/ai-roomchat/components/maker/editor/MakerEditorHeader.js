'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Dynamic import로 큰 컴포넌트 지연 로딩
const NaturalLanguageGameDeveloper = dynamic(
  () => import('../ai/NaturalLanguageGameDeveloper'),
  { ssr: false }
)

const GameTemplateLibrary = dynamic(
  () => import('../template/GameTemplateLibrary'),
  { ssr: false }
)

const ImageToUIGenerator = dynamic(
  () => import('../ui/ImageToUIGenerator'),
  { ssr: false }
)

const GameResourceEditor = dynamic(
  () => import('../resource/GameResourceEditor'),
  { ssr: false }
)

const MobileGameDevEnvironment = dynamic(
  () => import('../../mobile/MobileGameDevEnvironment'),
  { ssr: false }
)

const VisualNodeEditor = dynamic(
  () => import('../visual/VisualNodeEditor'),
  { ssr: false }
)

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
  onOpenMultiLanguageEditor,
  onStartSimulation,
  quickActions = [],
  gameData = {},
  onGameUpdate,
  existingCode = ''
}) {
  const [showNLDeveloper, setShowNLDeveloper] = useState(false)
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
  const [showImageToUI, setShowImageToUI] = useState(false)
  const [showResourceEditor, setShowResourceEditor] = useState(false)
  const [showVisualNodeEditor, setShowVisualNodeEditor] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [deviceTier, setDeviceTier] = useState('medium')
  
  // 모바일 환경 감지 및 최적화 설정
  useEffect(() => {
    const optimizationManager = typeof window !== 'undefined' ? window.mobileOptimizationManager : null;
    
    if (optimizationManager) {
      setIsMobile(optimizationManager.deviceInfo.isMobile);
      setDeviceTier(optimizationManager.deviceInfo.tier);
      
      console.log('📱 Device detected:', {
        isMobile: optimizationManager.deviceInfo.isMobile,
        tier: optimizationManager.deviceInfo.tier,
        screen: `${optimizationManager.deviceInfo.screenWidth}x${optimizationManager.deviceInfo.screenHeight}`
      });
    }
  }, [])

  // 템플릿 선택 핸들러
  const handleTemplateSelect = (template) => {
    if (onGameUpdate) {
      onGameUpdate({
        type: 'template_selected',
        template: template,
        code: template.code,
        name: template.name,
        description: template.description
      })
    }
    setShowTemplateLibrary(false)
  }

  // 모바일 최적화된 렌더링
  if (isMobile) {
    return (
      <MobileGameDevEnvironment
        onOptimizationChange={(optimization) => {
          console.log('📱 Mobile optimization event:', optimization);
        }}
      >
        <MobileMakerHeader
          setName={setName}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onBack={onBack}
          busy={busy}
          deviceTier={deviceTier}
          
          // 액션 핸들러들
          onShowNLDeveloper={() => setShowNLDeveloper(true)}
          onShowTemplateLibrary={() => setShowTemplateLibrary(true)}
          onShowImageToUI={() => setShowImageToUI(true)}
          onShowResourceEditor={() => setShowResourceEditor(true)}
          onShowVisualNodeEditor={() => setShowVisualNodeEditor(true)}
          onOpenCodeEditor={onOpenCodeEditor}
          onStartSimulation={onStartSimulation}
          onSave={onSave}
          
          // 모달 상태 및 핸들러
          showNLDeveloper={showNLDeveloper}
          showTemplateLibrary={showTemplateLibrary}
          showImageToUI={showImageToUI}
          showResourceEditor={showResourceEditor}
          showVisualNodeEditor={showVisualNodeEditor}
          
          onCloseNLDeveloper={() => setShowNLDeveloper(false)}
          onCloseTemplateLibrary={() => setShowTemplateLibrary(false)}
          onCloseImageToUI={() => setShowImageToUI(false)}
          onCloseResourceEditor={() => setShowResourceEditor(false)}
          onCloseVisualNodeEditor={() => setShowVisualNodeEditor(false)}
          
          // 게임 데이터
          gameData={gameData}
          onGameUpdate={onGameUpdate}
          handleTemplateSelect={handleTemplateSelect}
          existingCode={existingCode}
        />
      </MobileGameDevEnvironment>
    );
  }

  // UI 생성 핸들러
  const handleUIGenerated = (uiData) => {
    if (onGameUpdate) {
      onGameUpdate({
        type: 'ui_generated',
        code: uiData.code,
        source: uiData.source,
        imageAnalysis: uiData.imageAnalysis,
        originalImage: uiData.originalImage
      })
    }
    setShowImageToUI(false)
  }
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
          onClick={() => setShowNLDeveloper(true)}
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
          🤖 AI 개발
        </button>
        
        <button
          onClick={() => setShowTemplateLibrary(true)}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
            fontSize: 14
          }}
        >
          🎮 템플릿
        </button>
        
        <button
          onClick={() => setShowImageToUI(true)}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
            fontSize: 14
          }}
        >
          🎨 이미지UI
        </button>
        
        <button
          onClick={() => setShowResourceEditor(true)}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
            fontSize: 14
          }}
        >
          🎭 리소스
        </button>
        
        <button
          onClick={() => setShowVisualNodeEditor(true)}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
            fontSize: 14
          }}
        >
          🧩 노드
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
          ⚡ JS
        </button>
        
        <button
          onClick={onOpenMultiLanguageEditor}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            fontSize: 14
          }}
        >
          🚀 AI개발
        </button>
        <button
          onClick={onStartSimulation}
          style={{ 
            ...baseButton,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
            fontSize: 14
          }}
        >
          🎮 시뮬
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
          onClick={() => setShowNLDeveloper(true)}
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
            🤖 <span>자연어로 게임 개발</span>
          </span>
        </button>

        <button
          onClick={() => setShowTemplateLibrary(true)}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #059669 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
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
            e.target.style.boxShadow = '0 15px 35px -5px rgba(34, 197, 94, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(34, 197, 94, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🎮 <span>게임 템플릿 선택</span>
          </span>
        </button>

        <button
          onClick={() => setShowImageToUI(true)}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
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
            🎨 <span>이미지로 UI 생성</span>
          </span>
        </button>

        <button
          onClick={() => setShowResourceEditor(true)}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #ec4899 0%, #be185d 50%, #9d174d 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(236, 72, 153, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
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
            e.target.style.boxShadow = '0 15px 35px -5px rgba(236, 72, 153, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(236, 72, 153, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🎭 <span>게임 리소스 편집</span>
          </span>
        </button>

        <button
          onClick={() => setShowVisualNodeEditor(true)}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(6, 182, 212, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
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
            e.target.style.boxShadow = '0 15px 35px -5px rgba(6, 182, 212, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(6, 182, 212, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🧩 <span>비주얼 노드 에디터</span>
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

        <button
          onClick={onStartSimulation}
          style={{ 
            padding: '16px 32px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 16,
            border: 'none',
            boxShadow: '0 10px 25px -5px rgba(6, 182, 212, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
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
            e.target.style.boxShadow = '0 15px 35px -5px rgba(6, 182, 212, 0.7), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(-1px)'
            e.target.style.boxShadow = '0 10px 25px -5px rgba(6, 182, 212, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🎮 <span>게임 시뮬레이션</span>
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
      
      {/* 🤖 자연어 AI 게임 개발자 */}
      {showNLDeveloper && (
        <NaturalLanguageGameDeveloper
          gameData={gameData}
          onGameUpdate={onGameUpdate}
          onClose={() => setShowNLDeveloper(false)}
          existingCode={existingCode}
          gameContext={{
            gameType: gameData?.gameType || 'unknown',
            players: gameData?.maxPlayers || 1,
            currentLevel: gameData?.currentLevel || 1,
            score: gameData?.score || 0
          }}
        />
      )}

      {/* 🎮 게임 템플릿 라이브러리 */}
      {showTemplateLibrary && (
        <GameTemplateLibrary
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplateLibrary(false)}
        />
      )}

      {/* 🎨 이미지로 UI 생성 */}
      {showImageToUI && (
        <ImageToUIGenerator
          onClose={() => setShowImageToUI(false)}
          onGenerateUI={(uiCode) => {
            console.log('Generated UI code:', uiCode)
            setShowImageToUI(false)
            // TODO: Apply UI code to game - integrate with game engine
            if (onGameUpdate) {
              onGameUpdate({
                ...gameData,
                generatedUI: uiCode,
                lastModified: new Date().toISOString()
              })
            }
          }}
        />
      )}

      {/* 🎭 게임 리소스 편집기 */}
      {showResourceEditor && (
        <GameResourceEditor
          onClose={() => setShowResourceEditor(false)}
          gameData={gameData}
          onGameUpdate={onGameUpdate}
        />
      )}

      {/* 🧩 비주얼 노드 에디터 */}
      {showVisualNodeEditor && (
        <VisualNodeEditor
          onClose={() => setShowVisualNodeEditor(false)}
          onCodeGenerated={(code) => {
            console.log('Generated visual node code:', code);
            if (onGameUpdate) {
              onGameUpdate({
                ...gameData,
                visualNodeCode: code,
                lastModified: new Date().toISOString()
              });
            }
          }}
          gameData={gameData}
          existingNodes={gameData?.visualNodes || []}
          isMobile={isMobile}
          deviceTier={deviceTier}
        />
      )}
    </header>
  )
}

// 📱 모바일 최적화된 메이커 헤더
const MobileMakerHeader = ({
  setName,
  collapsed,
  onToggleCollapse,
  onBack,
  busy,
  deviceTier,
  
  // 액션 핸들러들
  onShowNLDeveloper,
  onShowTemplateLibrary,
  onShowImageToUI,
  onShowResourceEditor,
  onShowVisualNodeEditor,
  onOpenCodeEditor,
  onStartSimulation,
  onSave,
  
  // 모달 상태
  showNLDeveloper,
  showTemplateLibrary,
  showImageToUI,
  showResourceEditor,
  showVisualNodeEditor,
  
  // 모달 닫기 핸들러
  onCloseNLDeveloper,
  onCloseTemplateLibrary,
  onCloseImageToUI,
  onCloseResourceEditor,
  onCloseVisualNodeEditor,
  
  // 게임 데이터
  gameData,
  onGameUpdate,
  handleTemplateSelect,
  existingCode
}) => {
  const [activeQuickAction, setActiveQuickAction] = useState(null);
  
  // 모바일 최적화된 버튼 스타일
  const mobileButtonStyle = {
    padding: deviceTier === 'low' ? '8px 12px' : '12px 16px',
    borderRadius: '12px',
    border: 'none',
    color: '#ffffff',
    fontSize: deviceTier === 'low' ? '14px' : '16px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '44px', // 터치 타겟 최소 크기
    boxShadow: deviceTier === 'high' ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
    transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
    transform: 'translateZ(0)', // 하드웨어 가속
  };

  if (collapsed) {
    return (
      <header style={{
        background: 'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRadius: '12px',
        margin: '8px',
        boxShadow: deviceTier === 'high' ? '0 8px 25px -8px rgba(30, 27, 75, 0.4)' : 'none'
      }}>
        <button
          onClick={onBack}
          style={{
            ...mobileButtonStyle,
            background: 'rgba(255,255,255,0.1)',
            flex: 'none',
            minWidth: '44px',
            padding: '12px'
          }}
        >
          ←
        </button>
        
        <div style={{
          flex: 1,
          textAlign: 'center',
          color: '#ffffff',
          fontSize: deviceTier === 'low' ? '14px' : '16px',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {setName || '새로운 게임'}
        </div>
        
        <button
          onClick={onToggleCollapse}
          style={{
            ...mobileButtonStyle,
            background: 'rgba(59, 130, 246, 0.8)',
            flex: 'none',
            minWidth: '44px',
            padding: '12px'
          }}
        >
          ⬇
        </button>
      </header>
    );
  }

  return (
    <header style={{
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
      padding: '12px',
      borderRadius: '16px',
      margin: '8px',
      boxShadow: deviceTier === 'high' ? '0 15px 35px -10px rgba(30, 27, 75, 0.5)' : 'none'
    }}>
      {/* 상단 네비게이션 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <button
          onClick={onBack}
          style={{
            ...mobileButtonStyle,
            background: 'rgba(255,255,255,0.1)',
            fontSize: '18px',
            minWidth: '48px'
          }}
        >
          ←
        </button>
        
        <div style={{
          flex: 1,
          textAlign: 'center',
          margin: '0 12px'
        }}>
          <h1 style={{
            margin: 0,
            color: '#ffffff',
            fontSize: deviceTier === 'low' ? '16px' : '18px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            🎮 {setName || '새로운 게임 제작'}
          </h1>
        </div>
        
        <button
          onClick={onToggleCollapse}
          style={{
            ...mobileButtonStyle,
            background: 'rgba(255,255,255,0.1)',
            fontSize: '18px',
            minWidth: '48px'
          }}
        >
          ▲
        </button>
      </div>
      
      {/* 주요 액션 버튼들 - 그리드 레이아웃 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <button
          onClick={onShowNLDeveloper}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
            gridColumn: '1 / -1' // 전체 너비
          }}
        >
          <span>🤖</span>
          <span>AI로 게임 개발</span>
        </button>
        
        <button
          onClick={onShowTemplateLibrary}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
          }}
        >
          <span>🎮</span>
          <span>템플릿</span>
        </button>
        
        <button
          onClick={onShowImageToUI}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
          }}
        >
          <span>🎨</span>
          <span>이미지UI</span>
        </button>
        
        <button
          onClick={onShowResourceEditor}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
          }}
        >
          <span>🎭</span>
          <span>리소스</span>
        </button>
        
        <button
          onClick={onShowVisualNodeEditor}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
          }}
        >
          <span>🧩</span>
          <span>노드</span>
        </button>
        
        <button
          onClick={onOpenCodeEditor}
          style={{
            ...mobileButtonStyle,
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
          }}
        >
          <span>⚡</span>
          <span>코드 실행</span>
        </button>
      </div>
      
      {/* 보조 액션 버튼들 */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={onStartSimulation}
          style={{
            ...mobileButtonStyle,
            background: 'rgba(59, 130, 246, 0.8)',
            fontSize: deviceTier === 'low' ? '12px' : '14px',
            padding: '8px 12px',
            flex: 1,
            minWidth: '80px'
          }}
        >
          🎮 테스트
        </button>
        
        <button
          onClick={onSave}
          disabled={busy}
          style={{
            ...mobileButtonStyle,
            background: busy ? 'rgba(107, 114, 128, 0.5)' : 'rgba(34, 197, 94, 0.8)',
            fontSize: deviceTier === 'low' ? '12px' : '14px',
            padding: '8px 12px',
            flex: 1,
            minWidth: '80px',
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? '💾 저장 중...' : '💾 저장'}
        </button>
      </div>
      
      {/* 모달들 - 모바일 최적화 */}
      {showNLDeveloper && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)'
        }}>
          <NaturalLanguageGameDeveloper
            gameData={gameData}
            onGameUpdate={onGameUpdate}
            onClose={onCloseNLDeveloper}
            existingCode={existingCode}
            gameContext={{
              gameType: gameData?.gameType || 'unknown',
              players: gameData?.maxPlayers || 1,
              currentLevel: gameData?.currentLevel || 1,
              score: gameData?.score || 0
            }}
            isMobile={true}
            deviceTier={deviceTier}
          />
        </div>
      )}

      {showTemplateLibrary && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)'
        }}>
          <GameTemplateLibrary
            onSelectTemplate={handleTemplateSelect}
            onClose={onCloseTemplateLibrary}
            isMobile={true}
            deviceTier={deviceTier}
          />
        </div>
      )}

      {showImageToUI && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)'
        }}>
          <ImageToUIGenerator
            onClose={onCloseImageToUI}
            onGenerateUI={(uiCode) => {
              console.log('Generated UI code:', uiCode)
              onCloseImageToUI()
              if (onGameUpdate) {
                onGameUpdate({
                  ...gameData,
                  generatedUI: uiCode,
                  lastModified: new Date().toISOString()
                })
              }
            }}
            isMobile={true}
            deviceTier={deviceTier}
          />
        </div>
      )}

      {showResourceEditor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)'
        }}>
          <GameResourceEditor
            onClose={onCloseResourceEditor}
            gameData={gameData}
            onGameUpdate={onGameUpdate}
            isMobile={true}
            deviceTier={deviceTier}
          />
        </div>
      )}

      {showVisualNodeEditor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)'
        }}>
          <VisualNodeEditor
            onClose={onCloseVisualNodeEditor}
            onCodeGenerated={(code) => {
              console.log('Generated visual node code:', code);
              if (onGameUpdate) {
                onGameUpdate({
                  ...gameData,
                  visualNodeCode: code,
                  lastModified: new Date().toISOString()
                });
              }
            }}
            gameData={gameData}
            existingNodes={gameData?.visualNodes || []}
            isMobile={true}
            deviceTier={deviceTier}
          />
        </div>
      )}
    </header>
  );
};
