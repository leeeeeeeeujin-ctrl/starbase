/**
 * 🔍 브라우저 감지 및 호환성 유틸리티
 *
 * 다양한 브라우저와 디바이스에서 안정적인 동작을 위한
 * 감지 및 폴백 시스템
 */

class BrowserCompatibilityDetector {
  constructor() {
    this.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    this.features = this.detectFeatures();
    this.browser = this.detectBrowser();
    this.device = this.detectDevice();

    // 호환성 레벨 결정
    this.compatibilityLevel = this.calculateCompatibilityLevel();
  }

  /**
   * 브라우저 감지
   */
  detectBrowser() {
    const ua = this.userAgent.toLowerCase();

    // IE 감지 (정확한 버전 포함)
    if (ua.indexOf('msie') !== -1 || ua.indexOf('trident') !== -1) {
      const version = this.getIEVersion();
      return {
        name: 'ie',
        version: version,
        isLegacy: version < 11,
        isSupported: version >= 9,
      };
    }

    // Edge 감지 (Legacy Edge vs Chromium Edge)
    if (ua.indexOf('edg') !== -1) {
      const isChromiumEdge = ua.indexOf('edg/') !== -1;
      return {
        name: 'edge',
        version: this.extractVersion(ua, isChromiumEdge ? 'edg/' : 'edge/'),
        isChromium: isChromiumEdge,
        isSupported: true,
      };
    }

    // Chrome 감지
    if (ua.indexOf('chrome') !== -1 && ua.indexOf('edg') === -1) {
      return {
        name: 'chrome',
        version: this.extractVersion(ua, 'chrome/'),
        isSupported: this.extractVersion(ua, 'chrome/') >= 70,
      };
    }

    // Safari 감지
    if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
      return {
        name: 'safari',
        version: this.extractVersion(ua, 'version/'),
        isSupported: this.extractVersion(ua, 'version/') >= 12,
      };
    }

    // Firefox 감지
    if (ua.indexOf('firefox') !== -1) {
      return {
        name: 'firefox',
        version: this.extractVersion(ua, 'firefox/'),
        isSupported: this.extractVersion(ua, 'firefox/') >= 65,
      };
    }

    return {
      name: 'unknown',
      version: 0,
      isSupported: false,
    };
  }

  /**
   * 디바이스 감지
   */
  detectDevice() {
    const ua = this.userAgent;

    return {
      // 모바일 감지
      isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
      isTablet: /iPad|Android(?!.*Mobile)|Tablet/i.test(ua),
      isDesktop: !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),

      // OS 감지
      os: this.detectOS(),

      // 터치 지원
      hasTouch:
        typeof window !== 'undefined' &&
        ('ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          navigator.msMaxTouchPoints > 0),

      // 화면 정보
      screen:
        typeof window !== 'undefined'
          ? {
              width: window.screen.width,
              height: window.screen.height,
              pixelRatio: window.devicePixelRatio || 1,
            }
          : { width: 1920, height: 1080, pixelRatio: 1 },
    };
  }

  /**
   * 기능 감지
   */
  detectFeatures() {
    if (typeof window === 'undefined') {
      return this.getServerSideFeatures();
    }

    return {
      // JavaScript 기능
      es6: this.checkES6Support(),
      optionalChaining: this.checkOptionalChaining(),
      nullishCoalescing: this.checkNullishCoalescing(),
      asyncAwait: this.checkAsyncAwait(),

      // Web API
      fetch: typeof fetch !== 'undefined',
      promises: typeof Promise !== 'undefined',
      webWorkers: typeof Worker !== 'undefined',
      localStorage: this.checkLocalStorage(),
      sessionStorage: this.checkSessionStorage(),

      // DOM API
      querySelector: typeof document !== 'undefined' && !!document.querySelector,
      addEventListener: typeof window.addEventListener === 'function',

      // 관찰자 API
      intersectionObserver: typeof IntersectionObserver !== 'undefined',
      resizeObserver: typeof ResizeObserver !== 'undefined',
      mutationObserver: typeof MutationObserver !== 'undefined',

      // CSS 기능
      cssCustomProperties: this.checkCSSCustomProperties(),
      cssGrid: this.checkCSSGrid(),
      flexbox: this.checkFlexbox(),

      // Canvas 및 Graphics
      canvas: this.checkCanvas(),
      webgl: this.checkWebGL(),
      svg: this.checkSVG(),

      // 오디오/비디오
      audio: this.checkAudio(),
      video: this.checkVideo(),

      // 네트워크
      online: navigator.onLine !== false,
      connection: navigator.connection || navigator.mozConnection || navigator.webkitConnection,
    };
  }

  /**
   * 호환성 레벨 계산
   */
  calculateCompatibilityLevel() {
    let score = 0;
    let maxScore = 0;

    // 브라우저 점수
    maxScore += 30;
    if (this.browser.isSupported) {
      score += 30;
    } else if (this.browser.name === 'ie' && this.browser.version >= 9) {
      score += 15; // 제한적 지원
    }

    // 필수 기능 점수
    maxScore += 40;
    if (this.features.es6) score += 10;
    if (this.features.fetch || this.features.promises) score += 10;
    if (this.features.querySelector) score += 10;
    if (this.features.localStorage) score += 10;

    // 고급 기능 점수
    maxScore += 30;
    if (this.features.intersectionObserver) score += 5;
    if (this.features.webWorkers) score += 5;
    if (this.features.cssCustomProperties) score += 5;
    if (this.features.cssGrid) score += 5;
    if (this.features.canvas) score += 5;
    if (this.features.webgl) score += 5;

    const percentage = (score / maxScore) * 100;

    if (percentage >= 90) return 'excellent';
    if (percentage >= 75) return 'good';
    if (percentage >= 50) return 'fair';
    if (percentage >= 25) return 'limited';
    return 'minimal';
  }

  /**
   * 유틸리티 메서드들
   */
  getIEVersion() {
    const ua = this.userAgent;
    if (ua.indexOf('msie') !== -1) {
      return parseInt(ua.substring(ua.indexOf('msie') + 5, ua.indexOf(';', ua.indexOf('msie'))));
    }
    if (ua.indexOf('trident') !== -1) {
      const rv = ua.indexOf('rv:');
      return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)));
    }
    return 0;
  }

  extractVersion(ua, prefix) {
    const index = ua.indexOf(prefix);
    if (index === -1) return 0;

    const versionString = ua.substring(index + prefix.length);
    const version = parseFloat(versionString);
    return isNaN(version) ? 0 : version;
  }

  detectOS() {
    const ua = this.userAgent;

    if (/Windows NT/i.test(ua)) return 'windows';
    if (/Mac OS X/i.test(ua)) return 'macos';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Linux/i.test(ua)) return 'linux';

    return 'unknown';
  }

  // 기능 검사 메서드들
  checkES6Support() {
    try {
      eval('const test = () => {}; let [a, b] = [1, 2];');
      return true;
    } catch (e) {
      return false;
    }
  }

  checkOptionalChaining() {
    try {
      eval('const test = {}; test?.property;');
      return true;
    } catch (e) {
      return false;
    }
  }

  checkNullishCoalescing() {
    try {
      eval('const test = null ?? "default";');
      return true;
    } catch (e) {
      return false;
    }
  }

  checkAsyncAwait() {
    try {
      eval('async function test() { await Promise.resolve(); }');
      return true;
    } catch (e) {
      return false;
    }
  }

  checkLocalStorage() {
    try {
      const test = 'test';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  checkSessionStorage() {
    try {
      const test = 'test';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  checkCSSCustomProperties() {
    if (typeof window === 'undefined') return false;
    return window.CSS && window.CSS.supports && window.CSS.supports('color', 'var(--test)');
  }

  checkCSSGrid() {
    if (typeof window === 'undefined') return false;
    return window.CSS && window.CSS.supports && window.CSS.supports('display', 'grid');
  }

  checkFlexbox() {
    if (typeof window === 'undefined') return false;
    return (
      window.CSS &&
      window.CSS.supports &&
      (window.CSS.supports('display', 'flex') ||
        window.CSS.supports('display', '-webkit-flex') ||
        window.CSS.supports('display', '-ms-flexbox'))
    );
  }

  checkCanvas() {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('2d'));
  }

  checkWebGL() {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  checkSVG() {
    return (
      typeof document !== 'undefined' &&
      document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1')
    );
  }

  checkAudio() {
    if (typeof document === 'undefined') return false;
    const audio = document.createElement('audio');
    return !!audio.canPlayType;
  }

  checkVideo() {
    if (typeof document === 'undefined') return false;
    const video = document.createElement('video');
    return !!video.canPlayType;
  }

  getServerSideFeatures() {
    // 서버 사이드에서는 기본 지원 가정
    return {
      es6: true,
      optionalChaining: true,
      nullishCoalescing: true,
      asyncAwait: true,
      fetch: true,
      promises: true,
      webWorkers: false,
      localStorage: false,
      sessionStorage: false,
      querySelector: true,
      addEventListener: true,
      intersectionObserver: false,
      resizeObserver: false,
      mutationObserver: false,
      cssCustomProperties: true,
      cssGrid: true,
      flexbox: true,
      canvas: false,
      webgl: false,
      svg: true,
      audio: false,
      video: false,
      online: true,
      connection: null,
    };
  }

  /**
   * 호환성 정보 요약 반환
   */
  getCompatibilityInfo() {
    return {
      browser: this.browser,
      device: this.device,
      features: this.features,
      level: this.compatibilityLevel,
      recommendations: this.getRecommendations(),
    };
  }

  getRecommendations() {
    const recommendations = [];

    if (this.compatibilityLevel === 'minimal' || this.compatibilityLevel === 'limited') {
      recommendations.push('기본 기능만 사용, 고급 기능 비활성화');
      recommendations.push('폴리필 로드 필요');
    }

    if (!this.features.fetch) {
      recommendations.push('fetch 폴리필 필요');
    }

    if (!this.features.promises) {
      recommendations.push('Promise 폴리필 필요');
    }

    if (!this.features.intersectionObserver) {
      recommendations.push('IntersectionObserver 폴리필 권장');
    }

    if (this.browser.name === 'ie') {
      recommendations.push('IE 전용 CSS 핫픽스 적용');
      recommendations.push('ES5 호환 모드 사용');
    }

    return recommendations;
  }
}

// 전역 인스턴스 생성
const browserCompat = new BrowserCompatibilityDetector();

// 호환성 정보를 전역으로 노출 (디버깅용)
if (typeof window !== 'undefined') {
  window.browserCompatibilityInfo = browserCompat.getCompatibilityInfo();

  // 개발 모드에서 호환성 정보 콘솔 출력
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Browser Compatibility Info:', window.browserCompatibilityInfo);
  }
}

export default BrowserCompatibilityDetector;
export { browserCompat };
