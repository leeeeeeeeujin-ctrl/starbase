/**
 * 🔧 호환성 관리자 - 통합 호환성 시스템
 * 
 * 브라우저 감지, 폴리필 로드, 기능 대체를 통합 관리하는 시스템
 */

import { browserCompat } from './browserCompatibility.js';
import { polyfillLoader } from './polyfills.js';
import { universalAdapter } from './universalEnvironmentAdapter.js';

class CompatibilityManager {
  constructor() {
    this.browser = null;
    this.features = {};
    this.compatibilityLevel = 'unknown';
    this.isInitialized = false;
    this.adaptations = new Map();
    
    // 환경 정보
    this.environment = universalAdapter.getEnvironmentInfo();
    this.universalConfig = universalAdapter.getConfig();
    
    // 초기화 완료 콜백들
    this.onReadyCallbacks = [];
  }
  
  /**
   * 호환성 시스템 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return this.getCompatibilityInfo();
    }
    
    console.log('🔧 Initializing Compatibility Manager...');
    
    try {
      // 0. 환경 감지 및 설정
      this.environment = universalAdapter.getEnvironmentInfo();
      this.universalConfig = universalAdapter.getConfig();
      
      // 1. 브라우저 및 기능 감지 (브라우저 환경에서만)
      if (this.environment.isBrowser) {
        const compatInfo = browserCompat.getCompatibilityInfo();
        this.browser = compatInfo.browser;
        this.features = { ...compatInfo.features, ...this.environment.features };
        this.compatibilityLevel = compatInfo.level;
      } else {
        // Node.js 환경
        this.browser = { name: 'Node.js', version: this.environment.userAgent };
        this.features = this.environment.features;
        this.compatibilityLevel = 5; // Node.js는 최고 호환성
      }
      
      // 2. 필수 폴리필 로드 (브라우저 환경에서만)
      if (this.environment.isBrowser) {
        await polyfillLoader.loadEssentialPolyfills();
      }
      
      // 3. 호환성 레벨에 따른 적응 설정
      this.setupAdaptations();
      
      // 4. CSS 호환성 클래스 추가 (브라우저 환경에서만)
      if (this.environment.isBrowser) {
        this.applyCSSCompatibility();
      }
      
      // 5. 성능 최적화 적용
      this.applyPerformanceOptimizations();
      
      this.isInitialized = true;
      
      console.log('✅ Compatibility Manager initialized:', {
        browser: `${this.browser.name} ${this.browser.version}`,
        level: this.compatibilityLevel,
        adaptations: Array.from(this.adaptations.keys())
      });
      
      // 초기화 완료 콜백 실행
      this.onReadyCallbacks.forEach(callback => callback(this.getCompatibilityInfo()));
      
      return this.getCompatibilityInfo();
      
    } catch (error) {
      console.error('❌ Compatibility Manager initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * 호환성 적응 설정
   */
  setupAdaptations() {
    const level = this.compatibilityLevel;
    
    // 최소/제한 지원 레벨
    if (level === 'minimal' || level === 'limited') {
      this.adaptations.set('disableAnimations', true);
      this.adaptations.set('useBasicComponents', true);
      this.adaptations.set('reducedPolyfills', true);
    }
    
    // IE 전용 적응
    if (this.browser.name === 'ie') {
      this.adaptations.set('useFlexboxFallbacks', true);
      this.adaptations.set('disableCSSGrid', true);
      this.adaptations.set('useXHRInsteadOfFetch', true);
      this.adaptations.set('simplifyEventHandlers', true);
    }
    
    // 구형 Safari 적응
    if (this.browser.name === 'safari' && this.browser.version < 14) {
      this.adaptations.set('disableWebWorkers', true);
      this.adaptations.set('useIntersectionObserverPolyfill', true);
    }
    
    // 모바일 저사양 디바이스 적응
    if (this.isLowEndDevice()) {
      this.adaptations.set('reducedAnimations', true);
      this.adaptations.set('lazyLoadImages', true);
      this.adaptations.set('minimizeMemoryUsage', true);
    }
    
    console.log('🔧 Applied adaptations:', Array.from(this.adaptations.entries()));
  }
  
  /**
   * CSS 호환성 클래스 적용 (브라우저 환경에서만)
   */
  applyCSSCompatibility() {
    if (!this.environment.isBrowser || typeof document === 'undefined') return;
    
    const html = document.documentElement;
    
    // 환경 클래스
    html.classList.add(`env-${this.environment.type}`);
    
    // 브라우저별 클래스 (브라우저 환경에서만)
    if (this.browser.name !== 'Node.js') {
      html.classList.add(`browser-${this.browser.name.toLowerCase().replace(/\s+/g, '-')}`);
      const majorVersion = Math.floor(parseFloat(this.browser.version));
      if (!isNaN(majorVersion)) {
        html.classList.add(`browser-${this.browser.name.toLowerCase().replace(/\s+/g, '-')}-${majorVersion}`);
      }
    }
    
    // 호환성 레벨 클래스
    html.classList.add(`compat-${this.compatibilityLevel}`);
    
    // 기능 지원 클래스
    Object.entries(this.features).forEach(([feature, supported]) => {
      html.classList.add(supported ? `has-${feature}` : `no-${feature}`);
    });
    
    // 적응 클래스
    this.adaptations.forEach((value, key) => {
      if (value) {
        html.classList.add(`adapt-${key}`);
      }
    });
    
    // IE 전용 처리
    if (this.browser.name === 'ie') {
      html.classList.add('ie11-fallback');
      
      // CSS 변수 JavaScript 대체
      this.setupCSSVariableFallback();
    }
  }
  
  /**
   * CSS 변수 JavaScript 대체 (IE용)
   */
  setupCSSVariableFallback() {
    if (typeof document === 'undefined' || this.features.cssCustomProperties) return;
    
    // CSS 변수 값 정의
    const cssVariables = {
      '--color-primary': '#3b82f6',
      '--color-white': '#ffffff',
      '--font-size-base': '16px',
      '--spacing-4': '16px',
      // 더 많은 변수들...
    };
    
    // 스타일시트에 직접 값 주입
    const style = document.createElement('style');
    let css = '';
    
    Object.entries(cssVariables).forEach(([variable, value]) => {
      const className = variable.replace('--', '').replace(/-/g, '_');
      css += `.ie-var-${className} { /* ${variable}: ${value} */ }\n`;
    });
    
    style.textContent = css;
    document.head.appendChild(style);
  }
  
  /**
   * 성능 최적화 적용
   */
  applyPerformanceOptimizations() {
    // Node.js 환경에서는 브라우저 최적화 스킵
    if (this.environment.type === 'node') {
      console.log('🔧 Node.js 환경에서 성능 최적화 스킵');
      return;
    }
    
    // 저사양 디바이스 최적화
    if (this.isLowEndDevice()) {
      // 이미지 지연 로딩 활성화
      this.enableImageLazyLoading();
      
      // 애니메이션 감소
      if (this.adaptations.get('reducedAnimations')) {
        this.reduceAnimations();
      }
    }
    
    // IE 최적화
    if (this.browser.name === 'ie') {
      // 메모리 누수 방지
      this.preventIEMemoryLeaks();
    }
  }
  
  /**
   * 저사양 디바이스 감지
   */
  isLowEndDevice() {
    if (typeof navigator === 'undefined') return false;
    
    // 메모리 기반 판단
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
      return true;
    }
    
    // CPU 코어 수 기반 판단
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
      return true;
    }
    
    // 연결 속도 기반 판단
    if (navigator.connection) {
      const slowConnections = ['slow-2g', '2g', '3g'];
      if (slowConnections.includes(navigator.connection.effectiveType)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 이미지 지연 로딩 활성화
   */
  enableImageLazyLoading() {
    if (typeof document === 'undefined') return;
    
    // IntersectionObserver 사용 (폴리필 포함)
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
          }
        }
      });
    });
    
    // 기존 이미지에 적용
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
    
    // 새로 추가되는 이미지 감시
    const mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // ELEMENT_NODE
            const images = node.querySelectorAll ? node.querySelectorAll('img[data-src]') : [];
            images.forEach(img => imageObserver.observe(img));
          }
        });
      });
    });
    
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  /**
   * 애니메이션 감소
   */
  reduceAnimations() {
    if (typeof document === 'undefined') return;
    
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.1s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.1s !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * IE 메모리 누수 방지
   */
  preventIEMemoryLeaks() {
    if (typeof window === 'undefined') return;
    
    // 페이지 언로드시 이벤트 리스너 정리
    window.addEventListener('beforeunload', () => {
      // DOM 요소 참조 정리
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        if (el.removeEventListener) {
          // 모든 이벤트 리스너 제거 (IE에서 중요)
          el.onclick = null;
          el.onmouseover = null;
          el.onmouseout = null;
        }
      });
    });
  }
  
  /**
   * 기능별 호환성 체크 메서드들
   */
  
  // Fetch API 사용 가능 여부
  canUseFetch() {
    return this.features.fetch && !this.adaptations.get('useXHRInsteadOfFetch');
  }
  
  // Web Workers 사용 가능 여부
  canUseWebWorkers() {
    return this.features.webWorkers && !this.adaptations.get('disableWebWorkers');
  }
  
  // CSS Grid 사용 가능 여부
  canUseCSSGrid() {
    return this.features.cssGrid && !this.adaptations.get('disableCSSGrid');
  }
  
  // 고급 애니메이션 사용 가능 여부
  canUseAdvancedAnimations() {
    return !this.adaptations.get('disableAnimations') && 
           !this.adaptations.get('reducedAnimations');
  }
  
  /**
   * 호환성 정보 반환 (환경 정보 포함)
   */
  getCompatibilityInfo() {
    return {
      browser: this.browser,
      features: this.features,
      level: this.compatibilityLevel,
      adaptations: Object.fromEntries(this.adaptations),
      environment: this.environment,
      universalConfig: this.universalConfig,
      recommendations: this.getRecommendations(),
      capabilities: {
        canUseFetch: this.canUseFetch(),
        canUseWebWorkers: this.canUseWebWorkers(),
        canUseCSSGrid: this.canUseCSSGrid(),
        canUseAdvancedAnimations: this.canUseAdvancedAnimations()
      }
    };
  }
  
  /**
   * 권장 사항 제공
   */
  getRecommendations() {
    const recommendations = [];
    
    if (this.compatibilityLevel === 'minimal') {
      recommendations.push('기본 기능만 사용하세요');
      recommendations.push('JavaScript 사용을 최소화하세요');
    }
    
    if (this.browser.name === 'ie') {
      recommendations.push('최신 브라우저로 업그레이드를 권장합니다');
      recommendations.push('일부 고급 기능이 제한될 수 있습니다');
    }
    
    if (this.isLowEndDevice()) {
      recommendations.push('데이터 사용량을 줄이기 위해 이미지 품질이 낮아질 수 있습니다');
      recommendations.push('부드러운 경험을 위해 애니메이션이 단순화됩니다');
    }
    
    return recommendations;
  }
  
  /**
   * 초기화 완료시 실행할 콜백 등록
   */
  onReady(callback) {
    if (this.isInitialized) {
      callback(this.getCompatibilityInfo());
    } else {
      this.onReadyCallbacks.push(callback);
    }
  }
}

// 전역 호환성 관리자 인스턴스
const compatibilityManager = new CompatibilityManager();

// 자동 초기화 (환경별)
if (typeof window !== 'undefined') {
  // 브라우저 환경
  const initCompatibility = () => {
    compatibilityManager.initialize().catch(error => {
      console.error('Compatibility initialization failed:', error);
    });
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompatibility);
  } else {
    initCompatibility();
  }
  
  // 디버깅용 전역 노출
  window.compatibilityManager = compatibilityManager;
} else if (typeof global !== 'undefined') {
  // Node.js 환경
  compatibilityManager.initialize().catch(error => {
    console.error('Node.js compatibility initialization failed:', error);
  });
  
  // 디버깅용 전역 노출
  global.compatibilityManager = compatibilityManager;
}

export default CompatibilityManager;
export { compatibilityManager };