/**
 * 호환성 매니저 테스트
 * IE11+, Safari 12+, Chrome 70+, Firefox 65+ 호환성 검증
 */

import { CompatibilityManager } from '../../utils/compatibilityManager';

// 모킹된 브라우저 환경들
const mockBrowserEnvironments = {
  ie11: {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
    },
    window: {
      fetch: undefined,
      Promise: undefined,
      AbortController: undefined,
      IntersectionObserver: undefined,
      ResizeObserver: undefined,
    },
  },
  safari12: {
    navigator: {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Safari/605.1.15',
    },
    window: {
      fetch: jest.fn(),
      Promise: Promise,
      AbortController: undefined,
      IntersectionObserver: jest.fn(),
      ResizeObserver: undefined,
    },
  },
  chrome70: {
    navigator: {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36',
    },
    window: {
      fetch: jest.fn(),
      Promise: Promise,
      AbortController: jest.fn(),
      IntersectionObserver: jest.fn(),
      ResizeObserver: jest.fn(),
    },
  },
  firefox65: {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:65.0) Gecko/20100101 Firefox/65.0',
    },
    window: {
      fetch: jest.fn(),
      Promise: Promise,
      AbortController: jest.fn(),
      IntersectionObserver: jest.fn(),
      ResizeObserver: jest.fn(),
    },
  },
};

describe('CompatibilityManager', () => {
  let originalNavigator;
  let originalWindow;

  beforeEach(() => {
    originalNavigator = global.navigator;
    originalWindow = global.window;
  });

  afterEach(() => {
    global.navigator = originalNavigator;
    global.window = originalWindow;
    jest.clearAllMocks();
  });

  function mockBrowserEnvironment(browserType) {
    const env = mockBrowserEnvironments[browserType];
    global.navigator = { ...global.navigator, ...env.navigator };
    Object.assign(global.window, env.window);
  }

  describe('브라우저 감지', () => {
    test('IE11 감지', () => {
      mockBrowserEnvironment('ie11');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.browser.name).toBe('Internet Explorer');
      expect(info.browser.version).toBe('11.0');
      expect(info.level).toBe(1); // 최소 호환성 레벨
    });

    test('Safari 12 감지', () => {
      mockBrowserEnvironment('safari12');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.browser.name).toBe('Safari');
      expect(info.browser.version).toBe('12.1.2');
      expect(info.level).toBeGreaterThan(1);
    });

    test('Chrome 70 감지', () => {
      mockBrowserEnvironment('chrome70');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.browser.name).toBe('Chrome');
      expect(info.browser.version).toBe('70.0.3538');
      expect(info.level).toBeGreaterThan(2);
    });

    test('Firefox 65 감지', () => {
      mockBrowserEnvironment('firefox65');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.browser.name).toBe('Firefox');
      expect(info.browser.version).toBe('65.0');
      expect(info.level).toBeGreaterThan(2);
    });
  });

  describe('기능 감지', () => {
    test('IE11 기능 감지', () => {
      mockBrowserEnvironment('ie11');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.features.fetch).toBe(false);
      expect(info.features.promise).toBe(false);
      expect(info.features.abortController).toBe(false);
      expect(info.features.intersectionObserver).toBe(false);
      expect(info.features.resizeObserver).toBe(false);
    });

    test('Safari 12 기능 감지', () => {
      mockBrowserEnvironment('safari12');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.features.fetch).toBe(true);
      expect(info.features.promise).toBe(true);
      expect(info.features.abortController).toBe(false);
      expect(info.features.intersectionObserver).toBe(true);
      expect(info.features.resizeObserver).toBe(false);
    });

    test('Chrome 70 기능 감지', () => {
      mockBrowserEnvironment('chrome70');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.features.fetch).toBe(true);
      expect(info.features.promise).toBe(true);
      expect(info.features.abortController).toBe(true);
      expect(info.features.intersectionObserver).toBe(true);
      expect(info.features.resizeObserver).toBe(true);
    });
  });

  describe('폴리필 로딩', () => {
    test('IE11에서 필수 폴리필 로딩', async () => {
      mockBrowserEnvironment('ie11');

      await CompatibilityManager.initialize();

      // 폴리필이 로딩되었는지 확인
      expect(global.window.Promise).toBeDefined();
      expect(global.window.fetch).toBeDefined();
    });

    test('Safari 12에서 선택적 폴리필 로딩', async () => {
      mockBrowserEnvironment('safari12');

      await CompatibilityManager.initialize();

      // 이미 지원하는 기능은 폴리필하지 않음
      expect(global.window.fetch).toBe(mockBrowserEnvironments.safari12.window.fetch);
    });
  });

  describe('성능 등급 계산', () => {
    test('IE11 성능 등급', () => {
      mockBrowserEnvironment('ie11');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.performanceTier).toBe('low');
    });

    test('Chrome 70 성능 등급', () => {
      mockBrowserEnvironment('chrome70');

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.performanceTier).toBe('high');
    });
  });

  describe('적응형 기능', () => {
    test('저사양 환경에서 기능 제한', () => {
      mockBrowserEnvironment('ie11');

      const info = CompatibilityManager.getCompatibilityInfo();
      const adaptations = CompatibilityManager.getAdaptations();

      expect(adaptations.disableAnimations).toBe(true);
      expect(adaptations.reduceEffects).toBe(true);
      expect(adaptations.simplifyLayout).toBe(true);
    });

    test('고사양 환경에서 모든 기능 활성화', () => {
      mockBrowserEnvironment('chrome70');

      const info = CompatibilityManager.getCompatibilityInfo();
      const adaptations = CompatibilityManager.getAdaptations();

      expect(adaptations.disableAnimations).toBe(false);
      expect(adaptations.reduceEffects).toBe(false);
      expect(adaptations.simplifyLayout).toBe(false);
    });
  });

  describe('에러 처리', () => {
    test('브라우저 감지 실패 시 안전한 폴백', () => {
      // 비정상적인 userAgent
      global.navigator = { userAgent: '' };

      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info.browser.name).toBe('Unknown');
      expect(info.level).toBe(1); // 최소 호환성 레벨
    });

    test('초기화 실패 시에도 기본 기능 작동', async () => {
      // 초기화 중 에러 발생 시뮬레이션
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // 잘못된 환경 설정
      global.window = undefined;

      try {
        await CompatibilityManager.initialize();
        expect(console.error).toHaveBeenCalled();
      } catch (error) {
        // 에러가 발생해도 기본 기능은 사용 가능해야 함
        expect(CompatibilityManager.getCompatibilityInfo).toBeDefined();
      }

      console.error = originalConsoleError;
    });
  });

  describe('실제 브라우저 환경 테스트', () => {
    test('현재 브라우저 환경에서 호환성 정보 반환', () => {
      const info = CompatibilityManager.getCompatibilityInfo();

      expect(info).toBeDefined();
      expect(info.browser).toBeDefined();
      expect(info.browser.name).toBeDefined();
      expect(info.level).toBeGreaterThan(0);
      expect(info.features).toBeDefined();
      expect(info.device).toBeDefined();
    });

    test('초기화 성공', async () => {
      await expect(CompatibilityManager.initialize()).resolves.not.toThrow();
    });
  });
});
