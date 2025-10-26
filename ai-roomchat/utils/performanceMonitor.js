/**
 * 🚀 성능 모니터링 및 최적화 시스템
 * IE11+, 저사양 디바이스 성능 최적화 및 모니터링
 *
 * 🔧 기능:
 * - 메모리 사용량 모니터링
 * - 로딩 시간 측정
 * - 성능 병목 지점 감지
 * - 자동 최적화 적용
 *
 * @version 2.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { CompatibilityManager } from './compatibilityManager';

export class PerformanceMonitor {
  constructor() {
    this.isInitialized = false;
    this.compatibilityInfo = null;
    this.environment = null;

    // 성능 메트릭
    this.metrics = {
      memoryUsage: {
        current: 0,
        peak: 0,
        limit: 0,
        warnings: 0,
      },
      loadTimes: {
        total: 0,
        scripts: [],
        images: [],
        api: [],
      },
      fps: {
        current: 0,
        average: 0,
        drops: 0,
      },
      interactions: {
        inputDelay: [],
        responseTime: [],
      },
    };

    // 성능 통계
    this.statistics = {
      startTime: Date.now(),
      samplesCollected: 0,
      optimizationsApplied: 0,
      errorsDetected: 0,
    };

    // 최적화 설정
    this.optimizations = {
      enableImageLazyLoading: true,
      enableCodeSplitting: true,
      enableResourcePreloading: true,
      enableMemoryCleanup: true,
      enableAnimationOptimization: true,
    };

    // 모니터링 간격
    this.monitoringInterval = null;
    this.reportingInterval = null;

    // 성능 임계값
    this.thresholds = {
      memoryWarning: 50, // MB
      memoryError: 100, // MB
      fpsWarning: 30,
      fpsError: 15,
      inputDelayWarning: 100, // ms
      inputDelayError: 300, // ms
    };
  }

  /**
   * 성능 모니터 초기화
   */
  async initialize(options = {}) {
    if (this.isInitialized) return;

    try {
      // 호환성 정보 가져오기
      this.compatibilityInfo = CompatibilityManager.getCompatibilityInfo();

      // Load universalAdapter lazily to avoid evaluating Node-only adapters during module import
      try {
        const uaMod = await import('./universalEnvironmentAdapter');
        const universalAdapterLocal = uaMod && (uaMod.universalAdapter || uaMod.default || uaMod);
        if (universalAdapterLocal && typeof universalAdapterLocal.getEnvironmentInfo === 'function') {
          this.environment = universalAdapterLocal.getEnvironmentInfo();
        }
        if (universalAdapterLocal && typeof universalAdapterLocal.getConfig === 'function') {
          this.universalConfig = universalAdapterLocal.getConfig();
        }
      } catch (e) {
        // fallback to best-effort environment info
        this.environment = this.environment || {
          isBrowser: typeof window !== 'undefined',
          type: typeof window !== 'undefined' ? 'browser' : 'node',
          features: {},
          device: { type: 'unknown' },
        };
        this.universalConfig = this.universalConfig || {};
      }

      // 옵션 적용
      Object.assign(this.optimizations, options);

      // 환경별 임계값 조정
      this.adjustThresholds();

      // 성능 API 확인 및 설정
      this.setupPerformanceAPIs();

      // 모니터링 시작
      this.startMonitoring();

      // 최적화 적용
      this.applyInitialOptimizations();

      this.isInitialized = true;
      console.log('[PerformanceMonitor] 초기화 완료', {
        environment: this.environment.type,
        compatibility: this.compatibilityInfo.level,
        optimizations: this.optimizations,
      });
    } catch (error) {
      console.error('[PerformanceMonitor] 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 환경별 임계값 조정
   */
  adjustThresholds() {
    if (this.compatibilityInfo.level <= 2) {
      // IE11, 저사양 디바이스
      this.thresholds.memoryWarning = 25;
      this.thresholds.memoryError = 50;
      this.thresholds.fpsWarning = 20;
      this.thresholds.fpsError = 10;
    } else if (
      this.environment.isBrowser &&
      navigator.deviceMemory &&
      navigator.deviceMemory <= 2
    ) {
      // 저사양 모바일
      this.thresholds.memoryWarning = 30;
      this.thresholds.memoryError = 60;
    }
  }

  /**
   * 성능 API 설정
   */
  setupPerformanceAPIs() {
    // Performance API 지원 여부 확인
    this.hasPerformanceAPI =
      typeof performance !== 'undefined' && typeof performance.now === 'function';

    // Memory API 지원 여부 확인 (Chrome)
    this.hasMemoryAPI =
      typeof performance !== 'undefined' && typeof performance.memory !== 'undefined';

    // Observer APIs 지원 여부 확인
    this.hasPerformanceObserver = typeof PerformanceObserver !== 'undefined';

    // IntersectionObserver 지원 여부 (이미지 지연 로딩용)
    this.hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';

    // RequestAnimationFrame 지원 여부
    this.hasRAF = typeof requestAnimationFrame !== 'undefined';

    console.log('[PerformanceMonitor] API 지원 상태:', {
      performance: this.hasPerformanceAPI,
      memory: this.hasMemoryAPI,
      observer: this.hasPerformanceObserver,
      intersection: this.hasIntersectionObserver,
      raf: this.hasRAF,
    });
  }

  /**
   * 모니터링 시작
   */
  startMonitoring() {
    // 메모리 모니터링
    if (this.hasMemoryAPI) {
      this.startMemoryMonitoring();
    }

    // FPS 모니터링
    if (this.hasRAF) {
      this.startFPSMonitoring();
    }

    // 로딩 시간 모니터링
    if (this.hasPerformanceAPI) {
      this.startLoadTimeMonitoring();
    }

    // 입력 지연 모니터링
    this.startInputDelayMonitoring();

    // 정기 보고
    this.startReporting();
  }

  /**
   * 메모리 모니터링
   */
  startMemoryMonitoring() {
    this.monitoringInterval = setInterval(() => {
      const memInfo = performance.memory;
      const currentUsage = memInfo.usedJSHeapSize / 1024 / 1024; // MB

      this.metrics.memoryUsage.current = currentUsage;
      this.metrics.memoryUsage.peak = Math.max(this.metrics.memoryUsage.peak, currentUsage);
      this.metrics.memoryUsage.limit = memInfo.jsHeapSizeLimit / 1024 / 1024; // MB

      // 임계값 확인
      if (currentUsage > this.thresholds.memoryError) {
        this.handleMemoryError();
      } else if (currentUsage > this.thresholds.memoryWarning) {
        this.handleMemoryWarning();
      }
    }, 5000); // 5초마다
  }

  /**
   * FPS 모니터링
   */
  startFPSMonitoring() {
    let lastTime = performance.now();
    let frameCount = 0;
    let totalFPS = 0;
    let samples = 0;

    const measureFPS = currentTime => {
      frameCount++;

      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));

        this.metrics.fps.current = fps;
        totalFPS += fps;
        samples++;
        this.metrics.fps.average = Math.round(totalFPS / samples);

        if (fps < this.thresholds.fpsError) {
          this.handleFPSError();
        } else if (fps < this.thresholds.fpsWarning) {
          this.handleFPSWarning();
        }

        frameCount = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * 로딩 시간 모니터링
   */
  startLoadTimeMonitoring() {
    if (this.hasPerformanceObserver) {
      // PerformanceObserver 사용
      const observer = new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          this.recordLoadTime(entry);
        }
      });

      observer.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
    } else {
      // 폴백: 기본 Performance API
      setTimeout(() => {
        this.recordNavigationTiming();
      }, 1000);
    }
  }

  /**
   * 로딩 시간 기록
   */
  recordLoadTime(entry) {
    const duration = entry.duration || entry.responseEnd - entry.startTime;

    if (entry.entryType === 'navigation') {
      this.metrics.loadTimes.total = duration;
    } else if (entry.entryType === 'resource') {
      if (entry.name.match(/\.(js|jsx|ts|tsx)$/)) {
        this.metrics.loadTimes.scripts.push({
          name: entry.name,
          duration: duration,
          size: entry.transferSize,
        });
      } else if (entry.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
        this.metrics.loadTimes.images.push({
          name: entry.name,
          duration: duration,
          size: entry.transferSize,
        });
      }
    }
  }

  /**
   * 네비게이션 타이밍 기록 (IE11 호환)
   */
  recordNavigationTiming() {
    if (typeof performance.timing === 'undefined') return;

    const timing = performance.timing;
    this.metrics.loadTimes.total = timing.loadEventEnd - timing.navigationStart;
  }

  /**
   * 입력 지연 모니터링
   */
  startInputDelayMonitoring() {
    let inputStartTime = 0;

    // 마우스 이벤트
    document.addEventListener(
      'mousedown',
      () => {
        inputStartTime = this.now();
      },
      { passive: true }
    );

    document.addEventListener(
      'mouseup',
      () => {
        if (inputStartTime) {
          const delay = this.now() - inputStartTime;
          this.metrics.interactions.responseTime.push(delay);
          this.checkInputDelay(delay);
          inputStartTime = 0;
        }
      },
      { passive: true }
    );

    // 터치 이벤트
    document.addEventListener(
      'touchstart',
      () => {
        inputStartTime = this.now();
      },
      { passive: true }
    );

    document.addEventListener(
      'touchend',
      () => {
        if (inputStartTime) {
          const delay = this.now() - inputStartTime;
          this.metrics.interactions.responseTime.push(delay);
          this.checkInputDelay(delay);
          inputStartTime = 0;
        }
      },
      { passive: true }
    );
  }

  /**
   * 입력 지연 확인
   */
  checkInputDelay(delay) {
    if (delay > this.thresholds.inputDelayError) {
      this.handleInputDelayError();
    } else if (delay > this.thresholds.inputDelayWarning) {
      this.handleInputDelayWarning();
    }
  }

  /**
   * 에러 핸들러들
   */
  handleMemoryError() {
    this.metrics.memoryUsage.warnings++;
    console.error(
      '[PerformanceMonitor] 메모리 사용량 위험:',
      this.metrics.memoryUsage.current,
      'MB'
    );
    this.applyEmergencyOptimizations();
  }

  handleMemoryWarning() {
    console.warn(
      '[PerformanceMonitor] 메모리 사용량 경고:',
      this.metrics.memoryUsage.current,
      'MB'
    );
    this.applyMemoryOptimizations();
  }

  handleFPSError() {
    this.metrics.fps.drops++;
    console.error('[PerformanceMonitor] FPS 심각한 저하:', this.metrics.fps.current);
    this.applyFrameRateOptimizations();
  }

  handleFPSWarning() {
    console.warn('[PerformanceMonitor] FPS 저하:', this.metrics.fps.current);
  }

  handleInputDelayError() {
    console.error('[PerformanceMonitor] 입력 응답 지연 심각');
    this.applyInputOptimizations();
  }

  handleInputDelayWarning() {
    console.warn('[PerformanceMonitor] 입력 응답 지연');
  }

  /**
   * 최적화 적용
   */
  applyInitialOptimizations() {
    if (this.optimizations.enableImageLazyLoading) {
      this.enableImageLazyLoading();
    }

    if (this.optimizations.enableAnimationOptimization) {
      this.optimizeAnimations();
    }
  }

  applyMemoryOptimizations() {
    // 이미지 캐시 정리
    this.clearImageCache();

    // 미사용 DOM 정리
    this.cleanupUnusedDOM();

    this.statistics.optimizationsApplied++;
  }

  applyEmergencyOptimizations() {
    // 강제 가비지 컬렉션 (Chrome)
    if (typeof window !== 'undefined' && window.gc) {
      window.gc();
    }

    // 모든 애니메이션 중지
    this.disableAnimations();

    // 이미지 품질 저하
    this.reduceImageQuality();

    this.statistics.optimizationsApplied++;
  }

  applyFrameRateOptimizations() {
    // 애니메이션 최적화
    this.optimizeAnimations();

    // 렌더링 빈도 감소
    this.reduceRenderFrequency();

    this.statistics.optimizationsApplied++;
  }

  applyInputOptimizations() {
    // 이벤트 핸들러 최적화
    this.optimizeEventHandlers();

    // DOM 업데이트 배치 처리
    this.batchDOMUpdates();

    this.statistics.optimizationsApplied++;
  }

  /**
   * 개별 최적화 메서드들
   */
  enableImageLazyLoading() {
    if (!this.hasIntersectionObserver) return;

    const images = document.querySelectorAll('img[data-src]');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          observer.unobserve(img);
        }
      });
    });

    images.forEach(img => observer.observe(img));
  }

  optimizeAnimations() {
    // 저사양 디바이스에서 애니메이션 단순화
    if (this.compatibilityInfo.level <= 2) {
      const style = document.createElement('style');
      style.textContent = `
        * {
          animation-duration: 0.1s !important;
          transition-duration: 0.1s !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  disableAnimations() {
    const style = document.createElement('style');
    style.id = 'performance-animation-disable';
    style.textContent = `
      * {
        animation: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  clearImageCache() {
    // 이미지 캐시 정리 (구현 예시)
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.complete && !img.classList.contains('keep-cache')) {
        img.src = '';
      }
    });
  }

  /**
   * 현재 시간 (호환성)
   */
  now() {
    return this.hasPerformanceAPI ? performance.now() : Date.now();
  }

  /**
   * 정기 보고
   */
  startReporting() {
    this.reportingInterval = setInterval(() => {
      this.statistics.samplesCollected++;
      console.log('[PerformanceMonitor] 성능 리포트:', this.getPerformanceReport());
    }, 30000); // 30초마다
  }

  /**
   * 성능 보고서 생성
   */
  getPerformanceReport() {
    return {
      metrics: this.metrics,
      statistics: this.statistics,
      health: {
        memory:
          this.metrics.memoryUsage.current < this.thresholds.memoryWarning
            ? 'good'
            : this.metrics.memoryUsage.current < this.thresholds.memoryError
              ? 'warning'
              : 'error',
        fps:
          this.metrics.fps.current > this.thresholds.fpsWarning
            ? 'good'
            : this.metrics.fps.current > this.thresholds.fpsError
              ? 'warning'
              : 'error',
        overall: 'calculating...',
      },
      recommendations: this.getRecommendations(),
    };
  }

  /**
   * 권장 사항 생성
   */
  getRecommendations() {
    const recommendations = [];

    if (this.metrics.memoryUsage.current > this.thresholds.memoryWarning) {
      recommendations.push('메모리 사용량이 높습니다. 이미지 최적화를 고려하세요.');
    }

    if (this.metrics.fps.current < this.thresholds.fpsWarning) {
      recommendations.push('프레임 레이트가 낮습니다. 애니메이션을 단순화하세요.');
    }

    if (this.metrics.loadTimes.total > 3000) {
      recommendations.push('로딩 시간이 깁니다. 코드 스플리팅을 고려하세요.');
    }

    return recommendations;
  }

  /**
   * 정리
   */
  cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }

    // 최적화로 추가된 스타일 제거
    const optimizationStyles = document.querySelectorAll('style[id^="performance-"]');
    optimizationStyles.forEach(style => style.remove());

    console.log('[PerformanceMonitor] 정리 완료');
  }
}

// 싱글톤 인스턴스
export const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;
