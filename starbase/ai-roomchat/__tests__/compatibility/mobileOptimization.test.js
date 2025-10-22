/**
 * 모바일 최적화 매니저 호환성 테스트
 * 터치 이벤트, 오리엔테이션 변경, 네트워크 감지 등
 */

import { MobileOptimizationManager } from '../../utils/mobileOptimizationManager';

// 모바일 환경 모킹
const mockMobileEnvironments = {
  ios12Safari: {
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5
    },
    window: {
      ontouchstart: {},
      orientation: 0,
      devicePixelRatio: 2
    },
    screen: {
      orientation: {
        type: 'portrait-primary'
      }
    }
  },
  android70Chrome: {
    navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 7.0; SM-G930V Build/NRD90M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Mobile Safari/537.36',
      maxTouchPoints: 5
    },
    window: {
      ontouchstart: {},
      orientation: 0,
      devicePixelRatio: 2
    },
    screen: {
      orientation: {
        type: 'portrait-primary'
      }
    }
  },
  desktopChrome: {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36',
      maxTouchPoints: 0
    },
    window: {
      orientation: undefined,
      devicePixelRatio: 1
    },
    screen: {}
  }
};

describe('MobileOptimizationManager', () => {
  let manager;
  let mockElement;

  beforeEach(() => {
    // 모킹된 DOM 엘리먼트
    mockElement = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: {},
      querySelectorAll: jest.fn(() => []),
      dispatchEvent: jest.fn()
    };

    // DOM 메서드 모킹
    global.CustomEvent = jest.fn((type, options) => ({
      type,
      detail: options?.detail,
      bubbles: options?.bubbles,
      cancelable: options?.cancelable
    }));

    global.ResizeObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));

    manager = new MobileOptimizationManager();
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    jest.clearAllMocks();
  });

  function mockMobileEnvironment(envType) {
    const env = mockMobileEnvironments[envType];
    Object.assign(global.navigator, env.navigator);
    Object.assign(global.window, env.window);
    if (env.screen) {
      global.screen = { ...global.screen, ...env.screen };
    }
  }

  describe('기능 감지', () => {
    test('iOS Safari 터치 지원 감지', () => {
      mockMobileEnvironment('ios12Safari');
      
      manager.detectFeatureSupport();
      
      expect(manager.supportsTouchEvents).toBe(true);
      expect(manager.supportsPointerEvents).toBeDefined();
    });

    test('Android Chrome 터치 지원 감지', () => {
      mockMobileEnvironment('android70Chrome');
      
      manager.detectFeatureSupport();
      
      expect(manager.supportsTouchEvents).toBe(true);
    });

    test('데스크톱 Chrome 터치 미지원', () => {
      mockMobileEnvironment('desktopChrome');
      
      manager.detectFeatureSupport();
      
      expect(manager.supportsTouchEvents).toBe(false);
    });
  });

  describe('초기화', () => {
    test('모바일 환경에서 정상 초기화', async () => {
      mockMobileEnvironment('ios12Safari');
      
      await expect(manager.initialize({
        element: mockElement,
        enableTouchOptimization: true,
        compatibilityLevel: 3
      })).resolves.not.toThrow();
      
      expect(manager.isInitialized).toBe(true);
    });

    test('데스크톱 환경에서도 정상 초기화', async () => {
      mockMobileEnvironment('desktopChrome');
      
      await expect(manager.initialize({
        element: mockElement,
        enableTouchOptimization: false,
        compatibilityLevel: 4
      })).resolves.not.toThrow();
      
      expect(manager.isInitialized).toBe(true);
    });
  });

  describe('터치 이벤트 처리', () => {
    beforeEach(async () => {
      mockMobileEnvironment('ios12Safari');
      await manager.initialize({
        element: mockElement,
        enableTouchOptimization: true
      });
    });

    test('터치 시작 이벤트 처리', () => {
      const touchEvent = {
        touches: [{
          clientX: 100,
          clientY: 200
        }],
        preventDefault: jest.fn()
      };
      
      manager.handleTouchStart(touchEvent);
      
      expect(manager.touchState.isActive).toBe(true);
      expect(manager.touchState.startPosition).toEqual({ x: 100, y: 200 });
    });

    test('터치 이동 제스처 감지', () => {
      // 터치 시작
      manager.handleTouchStart({
        touches: [{ clientX: 100, clientY: 200 }]
      });
      
      // 터치 이동 (스와이프)
      manager.handleTouchMove({
        touches: [{ clientX: 200, clientY: 200 }],
        preventDefault: jest.fn()
      });
      
      expect(manager.touchState.gestureType).toBe('swipe-horizontal');
    });

    test('탭 제스처 감지', () => {
      const startTime = Date.now();
      
      // 터치 시작
      manager.handleTouchStart({
        touches: [{ clientX: 100, clientY: 200 }]
      });
      
      // 즉시 터치 종료 (탭)
      manager.handleTouchEnd({});
      
      expect(manager.touchState.gestureType).toBe('tap');
    });

    test('롱 프레스 제스처 감지', async () => {
      // 터치 시작
      manager.handleTouchStart({
        touches: [{ clientX: 100, clientY: 200 }]
      });
      
      // 롱 프레스 시간 시뮬레이션
      jest.advanceTimersByTime(600);
      
      manager.handleTouchEnd({});
      
      expect(manager.touchState.gestureType).toBe('long-press');
    });
  });

  describe('마우스 이벤트 폴백', () => {
    beforeEach(async () => {
      mockMobileEnvironment('desktopChrome');
      await manager.initialize({
        element: mockElement,
        enableTouchOptimization: true
      });
    });

    test('마우스 다운 이벤트를 터치 시작으로 처리', () => {
      const mouseEvent = {
        clientX: 150,
        clientY: 250
      };
      
      manager.handleMouseDown(mouseEvent);
      
      expect(manager.touchState.isActive).toBe(true);
      expect(manager.touchState.startPosition).toEqual({ x: 150, y: 250 });
    });
  });

  describe('오리엔테이션 변경', () => {
    beforeEach(async () => {
      mockMobileEnvironment('ios12Safari');
      await manager.initialize({
        element: mockElement
      });
    });

    test('오리엔테이션 감지', () => {
      expect(manager.getOrientation()).toBe('portrait');
      
      // 가로 모드로 변경
      global.window.orientation = 90;
      expect(manager.getOrientation()).toBe('landscape');
    });

    test('오리엔테이션 변경 이벤트 처리', () => {
      const handleOrientationChange = jest.spyOn(manager, 'handleOrientationChange');
      
      // 오리엔테이션 변경 이벤트 발생
      const orientationEvent = new Event('orientationchange');
      window.dispatchEvent(orientationEvent);
      
      // iOS Safari의 지연 처리를 고려하여 타이머 진행
      jest.advanceTimersByTime(500);
      
      expect(handleOrientationChange).toHaveBeenCalled();
    });
  });

  describe('키보드 네비게이션', () => {
    beforeEach(async () => {
      mockMobileEnvironment('desktopChrome');
      
      // 포커스 가능한 엘리먼트들 모킹
      mockElement.querySelectorAll.mockReturnValue([
        { hasAttribute: () => false, setAttribute: jest.fn(), addEventListener: jest.fn() },
        { hasAttribute: () => true, setAttribute: jest.fn(), addEventListener: jest.fn() }
      ]);
      
      await manager.initialize({
        element: mockElement,
        enableKeyboardNavigation: true
      });
    });

    test('포커스 가능한 엘리먼트에 tabindex 설정', () => {
      const elements = mockElement.querySelectorAll();
      
      expect(elements[0].setAttribute).toHaveBeenCalledWith('tabindex', '0');
      expect(elements[1].setAttribute).not.toHaveBeenCalled(); // 이미 tabindex가 있음
    });
  });

  describe('반응형 레이아웃', () => {
    test('ResizeObserver 지원 환경에서 설정', async () => {
      mockMobileEnvironment('android70Chrome');
      
      await manager.initialize({
        element: mockElement,
        enableResponsiveLayout: true
      });
      
      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(manager.resizeObserver.observe).toHaveBeenCalledWith(mockElement);
    });

    test('ResizeObserver 미지원 환경에서 폴백', async () => {
      mockMobileEnvironment('ios12Safari');
      
      // ResizeObserver 미지원으로 설정
      global.ResizeObserver = undefined;
      
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      
      await manager.initialize({
        element: mockElement,
        enableResponsiveLayout: true
      });
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', manager.handleResize);
    });
  });

  describe('CSS 최적화', () => {
    test('터치 액션 설정', async () => {
      mockMobileEnvironment('ios12Safari');
      
      await manager.initialize({
        element: mockElement,
        enableTouchOptimization: true
      });
      
      expect(mockElement.style.touchAction).toBe('manipulation');
      expect(mockElement.style.webkitUserSelect).toBe('none');
      expect(mockElement.style.webkitTapHighlightColor).toBe('transparent');
    });

    test('IE11에서 MS 프리픽스 사용', async () => {
      // IE11 환경 모킹
      mockMobileEnvironment('desktopChrome');
      global.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko';
      
      await manager.initialize({
        element: mockElement,
        enableTouchOptimization: true
      });
      
      // touchAction이 지원되지 않으면 msTouchAction 사용
      delete mockElement.style.touchAction;
      manager.applyTouchCSS();
      
      expect(mockElement.style.msTouchAction).toBe('manipulation');
    });
  });

  describe('정리 작업', () => {
    test('리스너 제거 및 리소스 정리', async () => {
      mockMobileEnvironment('ios12Safari');
      
      await manager.initialize({
        element: mockElement,
        enableTouchOptimization: true
      });
      
      expect(manager.isInitialized).toBe(true);
      
      manager.cleanup();
      
      expect(manager.isInitialized).toBe(false);
      expect(mockElement.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('에러 처리', () => {
    test('초기화 중 에러 발생 시 안전한 처리', async () => {
      // 에러 발생 시뮬레이션
      mockElement.addEventListener.mockImplementation(() => {
        throw new Error('DOM error');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(manager.initialize({
        element: mockElement
      })).rejects.toThrow();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});