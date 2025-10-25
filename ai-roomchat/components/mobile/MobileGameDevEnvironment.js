/**
 * 📱 Mobile-First Game Development Environment
 * 모바일 환경에 최적화된 게임 개발 인터페이스
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const MobileGameDevEnvironment = ({ children, onOptimizationChange }) => {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [optimizationSettings, setOptimizationSettings] = useState(null);
  const [touchMode, setTouchMode] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  const [performance, setPerformance] = useState({ fps: 60, memory: 0 });

  // 모바일 최적화 매니저 참조
  const optimizationManager = useMemo(() => {
    return typeof window !== 'undefined' ? window.mobileOptimizationManager : null;
  }, []);

  useEffect(() => {
    if (optimizationManager) {
      // 디바이스 정보 로드
      setDeviceInfo(optimizationManager.deviceInfo);
      setOptimizationSettings(optimizationManager.optimizationSettings);
      setTouchMode(optimizationManager.deviceInfo.isMobile);

      // 성능 모니터링 시작
      const performanceInterval = setInterval(() => {
        const status = optimizationManager.getOptimizationStatus();
        setPerformance({
          fps: status.rendering.fps,
          memory: status.memory.usage?.used || 0,
        });
      }, 2000);

      // 화면 방향 감지
      const handleOrientationChange = () => {
        const angle = window.orientation || 0;
        setOrientation(Math.abs(angle) === 90 ? 'landscape' : 'portrait');
      };

      handleOrientationChange();
      window.addEventListener('orientationchange', handleOrientationChange);

      return () => {
        clearInterval(performanceInterval);
        window.removeEventListener('orientationchange', handleOrientationChange);
      };
    }
  }, [optimizationManager]);

  // 터치 이벤트 처리
  const handleOptimizedTouch = useCallback(
    event => {
      const detail = event.detail;

      // 터치 좌표를 부모에게 전달
      if (onOptimizationChange) {
        onOptimizationChange({
          type: 'touch',
          data: {
            touches: detail.touches,
            timestamp: detail.timestamp,
          },
        });
      }
    },
    [onOptimizationChange]
  );

  useEffect(() => {
    document.addEventListener('optimizedTouch', handleOptimizedTouch);
    return () => document.removeEventListener('optimizedTouch', handleOptimizedTouch);
  }, [handleOptimizedTouch]);

  // 동적 스타일 계산
  const containerStyle = useMemo(() => {
    if (!deviceInfo) return {};

    return {
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',

      // 모바일 최적화
      WebkitOverflowScrolling: 'touch',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',

      // 성능 최적화
      transform: 'translateZ(0)', // 하드웨어 가속
      willChange: 'transform',

      // 반응형 디자인
      fontSize: deviceInfo.isMobile ? (deviceInfo.isTablet ? '16px' : '14px') : '16px',

      // 다크모드 (배터리 절약)
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      color: '#f1f5f9',
    };
  }, [deviceInfo]);

  // 적응형 레이아웃 컴포넌트
  const AdaptiveLayout = ({ children }) => {
    if (!deviceInfo) return <div>{children}</div>;

    const isMobile = deviceInfo.isMobile;
    const isLandscape = orientation === 'landscape';

    if (isMobile) {
      return (
        <MobileLayout isLandscape={isLandscape} deviceTier={deviceInfo.tier} touchMode={touchMode}>
          {children}
        </MobileLayout>
      );
    }

    return <DesktopLayout deviceTier={deviceInfo.tier}>{children}</DesktopLayout>;
  };

  if (!deviceInfo) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#0f172a',
          color: '#f1f5f9',
        }}
      >
        <div>
          <div style={{ fontSize: 24, marginBottom: 10 }}>📱</div>
          <div>환경 최적화 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* 성능 모니터 (개발 모드에서만) */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor
          performance={performance}
          deviceInfo={deviceInfo}
          position="top-right"
        />
      )}

      {/* 모바일 최적화 알림 */}
      {deviceInfo.tier === 'low' && <OptimizationNotice deviceInfo={deviceInfo} />}

      {/* 적응형 레이아웃으로 감싸진 컨텐츠 */}
      <AdaptiveLayout>{children}</AdaptiveLayout>
    </div>
  );
};

// 모바일 레이아웃 컴포넌트
const MobileLayout = ({ children, isLandscape, deviceTier, touchMode }) => {
  const [activePanel, setActivePanel] = useState('main');
  const [panelHistory, setPanelHistory] = useState(['main']);

  const navigateToPanel = panelId => {
    setActivePanel(panelId);
    setPanelHistory(prev => [...prev, panelId]);
  };

  const navigateBack = () => {
    if (panelHistory.length > 1) {
      const newHistory = panelHistory.slice(0, -1);
      setPanelHistory(newHistory);
      setActivePanel(newHistory[newHistory.length - 1]);
    }
  };

  const layoutStyle = {
    display: 'flex',
    flexDirection: isLandscape ? 'row' : 'column',
    height: '100%',
    position: 'relative',
  };

  const mainContentStyle = {
    flex: 1,
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: deviceTier === 'low' ? '8px' : '16px',

    // 성능 최적화
    transform: 'translateZ(0)',
    willChange: 'scroll-position',
  };

  return (
    <div style={layoutStyle}>
      {/* 모바일 네비게이션 바 */}
      <MobileNavigation
        activePanel={activePanel}
        onNavigate={navigateToPanel}
        onBack={navigateBack}
        canGoBack={panelHistory.length > 1}
        isLandscape={isLandscape}
        deviceTier={deviceTier}
      />

      {/* 메인 컨텐츠 영역 */}
      <div style={mainContentStyle}>
        <MobilePanelContainer
          activePanel={activePanel}
          deviceTier={deviceTier}
          touchMode={touchMode}
        >
          {children}
        </MobilePanelContainer>
      </div>

      {/* 모바일 FAB (Floating Action Button) */}
      <MobileFloatingActions
        deviceTier={deviceTier}
        onAction={action => {
          console.log('Mobile FAB action:', action);
        }}
      />
    </div>
  );
};

// 데스크톱 레이아웃
const DesktopLayout = ({ children, deviceTier }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gridTemplateRows: 'auto 1fr',
        height: '100%',
        gap: deviceTier === 'high' ? '16px' : '8px',
        padding: deviceTier === 'high' ? '20px' : '12px',
      }}
    >
      {children}
    </div>
  );
};

// 모바일 네비게이션
const MobileNavigation = ({
  activePanel,
  onNavigate,
  onBack,
  canGoBack,
  isLandscape,
  deviceTier,
}) => {
  const navStyle = {
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(10px)',
    borderTop: isLandscape ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
    borderRight: isLandscape ? '1px solid rgba(148, 163, 184, 0.2)' : 'none',
    padding: '8px',
    display: 'flex',
    flexDirection: isLandscape ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: isLandscape ? 'auto' : '60px',
    minWidth: isLandscape ? '60px' : 'auto',
    order: isLandscape ? 0 : 2,

    // 성능 최적화
    willChange: 'transform',
    transform: 'translateZ(0)',
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    color: '#cbd5e1',
    fontSize: deviceTier === 'low' ? '12px' : '14px',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    minHeight: '44px', // 터치 타겟 최소 크기
    minWidth: '44px',
    transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
  };

  const activeButtonStyle = {
    ...buttonStyle,
    color: '#3b82f6',
    background: 'rgba(59, 130, 246, 0.1)',
  };

  const navItems = [
    { id: 'main', icon: '🏠', label: '홈' },
    { id: 'code', icon: '💻', label: '코드' },
    { id: 'resources', icon: '🎭', label: '리소스' },
    { id: 'test', icon: '🎮', label: '테스트' },
    { id: 'settings', icon: '⚙️', label: '설정' },
  ];

  return (
    <nav style={navStyle}>
      {canGoBack && (
        <button onClick={onBack} style={buttonStyle} aria-label="뒤로 가기">
          <span style={{ fontSize: '18px' }}>←</span>
          {deviceTier !== 'low' && <span style={{ fontSize: '10px' }}>뒤로</span>}
        </button>
      )}

      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={activePanel === item.id ? activeButtonStyle : buttonStyle}
          aria-label={item.label}
        >
          <span style={{ fontSize: '18px' }}>{item.icon}</span>
          {deviceTier !== 'low' && <span style={{ fontSize: '10px' }}>{item.label}</span>}
        </button>
      ))}
    </nav>
  );
};

// 모바일 패널 컨테이너
const MobilePanelContainer = ({ activePanel, children, deviceTier, touchMode }) => {
  const containerStyle = {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  };

  const panelStyle = {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: deviceTier === 'low' ? '4px' : '8px',

    // 성능 최적화
    transform: 'translateZ(0)',
    willChange: 'scroll-position',
  };

  return (
    <div style={containerStyle}>
      <div style={panelStyle} data-panel={activePanel}>
        {children}
      </div>
    </div>
  );
};

// 플로팅 액션 버튼
const MobileFloatingActions = ({ deviceTier, onAction }) => {
  const [expanded, setExpanded] = useState(false);

  const fabContainerStyle = {
    position: 'fixed',
    bottom: '80px', // 네비게이션 바 위
    right: '16px',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column-reverse',
    alignItems: 'flex-end',
    gap: '12px',
  };

  const fabStyle = {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
    border: 'none',
    color: '#ffffff',
    fontSize: '24px',
    cursor: 'pointer',
    boxShadow: '0 8px 25px -8px rgba(139, 92, 246, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: deviceTier === 'high' ? 'all 0.3s ease' : 'all 0.1s ease',
    transform: 'translateZ(0)',
  };

  const secondaryFabStyle = {
    ...fabStyle,
    width: '48px',
    height: '48px',
    fontSize: '18px',
    background: 'rgba(15, 23, 42, 0.9)',
    backdropFilter: 'blur(10px)',
  };

  const actions = [
    { id: 'ai', icon: '🤖', label: 'AI 개발' },
    { id: 'add', icon: '➕', label: '추가' },
    { id: 'save', icon: '💾', label: '저장' },
  ];

  return (
    <div style={fabContainerStyle}>
      {/* 보조 액션 버튼들 */}
      {expanded &&
        actions.map((action, index) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            style={{
              ...secondaryFabStyle,
              opacity: expanded ? 1 : 0,
              transform: expanded ? 'scale(1)' : 'scale(0.8)',
              transitionDelay: `${index * 0.05}s`,
            }}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}

      {/* 메인 FAB */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          ...fabStyle,
          transform: expanded ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
        aria-label={expanded ? '닫기' : '메뉴 열기'}
      >
        {expanded ? '✕' : '🚀'}
      </button>
    </div>
  );
};

// 성능 모니터
const PerformanceMonitor = ({ performance, deviceInfo, position = 'top-right' }) => {
  const monitorStyle = {
    position: 'fixed',
    top: position.includes('top') ? '10px' : 'auto',
    bottom: position.includes('bottom') ? '10px' : 'auto',
    left: position.includes('left') ? '10px' : 'auto',
    right: position.includes('right') ? '10px' : 'auto',
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#00ff00',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: 'monospace',
    zIndex: 9999,
    minWidth: '150px',
  };

  const getPerformanceColor = fps => {
    if (fps >= 50) return '#00ff00';
    if (fps >= 30) return '#ffaa00';
    return '#ff0000';
  };

  const getMemoryColor = memory => {
    if (memory < 50) return '#00ff00';
    if (memory < 100) return '#ffaa00';
    return '#ff0000';
  };

  return (
    <div style={monitorStyle}>
      <div style={{ color: getPerformanceColor(performance.fps) }}>FPS: {performance.fps}</div>
      <div style={{ color: getMemoryColor(performance.memory) }}>RAM: {performance.memory}MB</div>
      <div style={{ color: '#888' }}>Tier: {deviceInfo.tier}</div>
      <div style={{ color: '#888' }}>
        {deviceInfo.isMobile ? '📱' : '🖥️'} {deviceInfo.screenWidth}x{deviceInfo.screenHeight}
      </div>
    </div>
  );
};

// 최적화 안내
const OptimizationNotice = ({ deviceInfo }) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(245, 158, 11, 0.9)',
        color: '#000',
        padding: '12px 16px',
        borderRadius: '12px',
        zIndex: 9998,
        maxWidth: '90%',
        textAlign: 'center',
        fontSize: '14px',
        boxShadow: '0 8px 25px -8px rgba(245, 158, 11, 0.5)',
      }}
    >
      <div style={{ marginBottom: '8px' }}>⚡ 성능 최적화 모드</div>
      <div style={{ fontSize: '12px', opacity: 0.8 }}>
        저사양 환경이 감지되어 최적화를 적용했습니다
      </div>
      <button
        onClick={() => setVisible(false)}
        style={{
          marginTop: '8px',
          background: 'rgba(0,0,0,0.2)',
          border: 'none',
          borderRadius: '6px',
          color: '#000',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
      >
        확인
      </button>
    </div>
  );
};

export default MobileGameDevEnvironment;
