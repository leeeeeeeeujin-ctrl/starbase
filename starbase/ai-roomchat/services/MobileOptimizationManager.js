/**
 * 📱 Mobile Optimization Manager
 * 모바일 환경 대응 및 성능 최적화 통합 시스템
 * - 디바이스 감지 및 적응형 UI/UX
 * - 터치 인터랙션 최적화
 * - 메모리 및 CPU 사용량 관리
 * - 네트워크 최적화
 * - 배터리 효율성 고려
 */

class MobileOptimizationManager {
  constructor() {
    this.deviceInfo = this.detectDevice();
    this.performanceLevel = this.assessPerformance();
    this.touchHandler = null;
    this.renderOptimizer = null;
    this.memoryManager = null;

    this.optimizationSettings = {
      // 렌더링 최적화
      rendering: {
        maxFPS: this.deviceInfo.tier === 'high' ? 60 : this.deviceInfo.tier === 'medium' ? 30 : 20,
        useHardwareAcceleration: this.deviceInfo.supportsWebGL,
        enableVirtualization: true,
        lazyLoadThreshold: 100, // px
        imageCompressionLevel:
          this.deviceInfo.tier === 'high' ? 0.9 : this.deviceInfo.tier === 'medium' ? 0.7 : 0.5,
      },

      // 메모리 관리
      memory: {
        maxCachedImages:
          this.deviceInfo.tier === 'high' ? 50 : this.deviceInfo.tier === 'medium' ? 20 : 10,
        maxCodeCacheSize: this.deviceInfo.memory > 4 ? 100 : this.deviceInfo.memory > 2 ? 50 : 25, // MB
        garbageCollectInterval: 30000, // 30초
        autoCleanupThreshold: 0.8, // 메모리 사용률 80% 시 정리
      },

      // 터치 최적화
      touch: {
        debounceDelay: 16, // ~60fps
        gestureThreshold: 10, // px
        longPressDelay: 500, // ms
        hapticFeedback: this.deviceInfo.supportsHaptic,
      },

      // UI 적응성
      ui: {
        minTouchTarget: 44, // px (Apple HIG 권장)
        maxModalCount: 2, // 동시 표시 가능한 모달 수
        animationDuration: this.deviceInfo.tier === 'high' ? 300 : 150, // ms
        enableShadows: this.deviceInfo.tier === 'high',
        enableBlur: this.deviceInfo.tier === 'high',
      },
    };

    this.initialize();
  }

  /**
   * 디바이스 정보 감지
   */
  detectDevice() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    const maxTouchPoints = navigator.maxTouchPoints || 0;

    // 기본 디바이스 정보
    const deviceInfo = {
      isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent),
      isTablet:
        /iPad|Android.*(?!Mobile)/i.test(userAgent) ||
        (maxTouchPoints > 1 && window.screen.width > 768),
      isIOS: /iPad|iPhone|iPod/.test(userAgent),
      isAndroid: /Android/.test(userAgent),

      // 화면 정보
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,

      // 성능 관련
      memory: navigator.deviceMemory || 4, // GB (추정값)
      cores: navigator.hardwareConcurrency || 4,

      // 기능 지원
      supportsWebGL: this.checkWebGLSupport(),
      supportsWorkers: typeof Worker !== 'undefined',
      supportsHaptic: 'vibrate' in navigator,
      supportsOffscreen: typeof OffscreenCanvas !== 'undefined',

      // 네트워크
      connection: navigator.connection || navigator.mozConnection || navigator.webkitConnection,
    };

    // 성능 티어 결정
    deviceInfo.tier = this.calculatePerformanceTier(deviceInfo);

    return deviceInfo;
  }

  /**
   * WebGL 지원 확인
   */
  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  /**
   * 성능 티어 계산
   */
  calculatePerformanceTier(deviceInfo) {
    let score = 0;

    // 메모리 점수
    if (deviceInfo.memory >= 8) score += 30;
    else if (deviceInfo.memory >= 4) score += 20;
    else if (deviceInfo.memory >= 2) score += 10;

    // CPU 점수
    if (deviceInfo.cores >= 8) score += 25;
    else if (deviceInfo.cores >= 4) score += 15;
    else if (deviceInfo.cores >= 2) score += 10;

    // 화면 해상도 점수
    const totalPixels = deviceInfo.screenWidth * deviceInfo.screenHeight;
    if (totalPixels >= 2073600)
      score += 20; // 1920x1080+
    else if (totalPixels >= 921600)
      score += 15; // 1280x720+
    else score += 10;

    // WebGL 지원 점수
    if (deviceInfo.supportsWebGL) score += 15;

    // Workers 지원 점수
    if (deviceInfo.supportsWorkers) score += 10;

    // 티어 결정
    if (score >= 80) return 'high';
    else if (score >= 50) return 'medium';
    else return 'low';
  }

  /**
   * 성능 평가
   */
  assessPerformance() {
    return new Promise(resolve => {
      const startTime = performance.now();
      let frameCount = 0;

      const measureFPS = () => {
        frameCount++;
        if (frameCount < 60) {
          // 1초간 측정
          requestAnimationFrame(measureFPS);
        } else {
          const endTime = performance.now();
          const fps = Math.round(1000 / ((endTime - startTime) / frameCount));

          resolve({
            fps,
            renderTime: (endTime - startTime) / frameCount,
            memoryUsage: performance.memory
              ? {
                  used: performance.memory.usedJSHeapSize / 1024 / 1024, // MB
                  total: performance.memory.totalJSHeapSize / 1024 / 1024,
                  limit: performance.memory.jsHeapSizeLimit / 1024 / 1024,
                }
              : null,
          });
        }
      };

      requestAnimationFrame(measureFPS);
    });
  }

  /**
   * 초기화
   */
  initialize() {
    this.setupTouchHandling();
    this.setupRenderOptimization();
    this.setupMemoryManagement();
    this.setupResponsiveDesign();
    this.setupNetworkOptimization();

    console.log('📱 Mobile Optimization Manager initialized:', {
      device: this.deviceInfo,
      settings: this.optimizationSettings,
    });
  }

  /**
   * 터치 핸들링 설정
   */
  setupTouchHandling() {
    this.touchHandler = {
      lastTouch: 0,
      gestureStart: null,

      // 디바운스된 터치 이벤트
      debouncedTouch: this.debounce(event => {
        this.handleTouchEvent(event);
      }, this.optimizationSettings.touch.debounceDelay),

      // 제스처 감지
      detectGesture: (startEvent, endEvent) => {
        const deltaX = endEvent.touches[0].clientX - startEvent.touches[0].clientX;
        const deltaY = endEvent.touches[0].clientY - startEvent.touches[0].clientY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > this.optimizationSettings.touch.gestureThreshold) {
          const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

          if (Math.abs(angle) < 45) return 'swipe-right';
          else if (Math.abs(angle) > 135) return 'swipe-left';
          else if (angle > 45 && angle < 135) return 'swipe-down';
          else if (angle < -45 && angle > -135) return 'swipe-up';
        }

        return null;
      },
    };

    // 전역 터치 이벤트 리스너
    if (this.deviceInfo.isMobile) {
      document.addEventListener('touchstart', this.touchHandler.debouncedTouch, { passive: true });
      document.addEventListener('touchmove', this.touchHandler.debouncedTouch, { passive: true });
      document.addEventListener('touchend', this.touchHandler.debouncedTouch, { passive: true });

      // 스크롤 최적화
      document.addEventListener(
        'touchmove',
        e => {
          // 동시 터치가 2개 이상이면 줌 제스처로 간주하여 기본 동작 방지
          if (e.touches.length > 1) {
            e.preventDefault();
          }
        },
        { passive: false }
      );
    }
  }

  /**
   * 터치 이벤트 처리
   */
  handleTouchEvent(event) {
    const now = performance.now();

    // 터치 디바운싱
    if (now - this.touchHandler.lastTouch < this.optimizationSettings.touch.debounceDelay) {
      return;
    }
    this.touchHandler.lastTouch = now;

    // 햅틱 피드백
    if (this.optimizationSettings.touch.hapticFeedback && event.type === 'touchstart') {
      this.triggerHapticFeedback('light');
    }

    // 커스텀 터치 이벤트 발생
    const customEvent = new CustomEvent('optimizedTouch', {
      detail: {
        originalEvent: event,
        timestamp: now,
        touches: Array.from(event.touches || []).map(touch => ({
          x: touch.clientX,
          y: touch.clientY,
          id: touch.identifier,
        })),
      },
    });

    document.dispatchEvent(customEvent);
  }

  /**
   * 렌더링 최적화 설정
   */
  setupRenderOptimization() {
    this.renderOptimizer = {
      rafId: null,
      renderQueue: [],
      lastFrameTime: 0,
      frameInterval: 1000 / this.optimizationSettings.rendering.maxFPS,

      // 가상화된 렌더링 (큰 리스트 최적화)
      virtualizedRenderer: {
        visibleRange: { start: 0, end: 10 },
        itemHeight: 60,
        containerHeight: 600,

        updateVisibleRange: scrollTop => {
          const start = Math.floor(scrollTop / this.renderOptimizer.virtualizedRenderer.itemHeight);
          const visibleCount = Math.ceil(
            this.renderOptimizer.virtualizedRenderer.containerHeight /
              this.renderOptimizer.virtualizedRenderer.itemHeight
          );
          const end = start + visibleCount + 2; // 버퍼 추가

          this.renderOptimizer.virtualizedRenderer.visibleRange = { start, end };
        },
      },

      // 레이지 로딩
      lazyLoader: {
        observer: null,

        init: () => {
          if ('IntersectionObserver' in window) {
            this.renderOptimizer.lazyLoader.observer = new IntersectionObserver(
              entries => {
                entries.forEach(entry => {
                  if (entry.isIntersecting) {
                    this.loadLazyContent(entry.target);
                  }
                });
              },
              {
                threshold: 0.1,
                rootMargin: `${this.optimizationSettings.rendering.lazyLoadThreshold}px`,
              }
            );
          }
        },
      },
    };

    // 레이지 로더 초기화
    this.renderOptimizer.lazyLoader.init();

    // 렌더링 루프 최적화
    this.startOptimizedRenderLoop();
  }

  /**
   * 최적화된 렌더링 루프
   */
  startOptimizedRenderLoop() {
    const render = timestamp => {
      const deltaTime = timestamp - this.renderOptimizer.lastFrameTime;

      if (deltaTime >= this.renderOptimizer.frameInterval) {
        // 렌더링 큐 처리
        while (this.renderOptimizer.renderQueue.length > 0) {
          const task = this.renderOptimizer.renderQueue.shift();
          if (task && typeof task === 'function') {
            task(timestamp);
          }
        }

        this.renderOptimizer.lastFrameTime = timestamp;
      }

      this.renderOptimizer.rafId = requestAnimationFrame(render);
    };

    this.renderOptimizer.rafId = requestAnimationFrame(render);
  }

  /**
   * 메모리 관리 설정
   */
  setupMemoryManagement() {
    this.memoryManager = {
      imageCache: new Map(),
      codeCache: new Map(),
      cleanupTimer: null,

      // 이미지 캐시 관리
      cacheImage: (url, image) => {
        if (
          this.memoryManager.imageCache.size >= this.optimizationSettings.memory.maxCachedImages
        ) {
          // LRU: 가장 오래된 이미지 제거
          const firstKey = this.memoryManager.imageCache.keys().next().value;
          this.memoryManager.imageCache.delete(firstKey);
        }

        this.memoryManager.imageCache.set(url, {
          image,
          timestamp: Date.now(),
          usage: 1,
        });
      },

      // 코드 캐시 관리
      cacheCode: (key, code) => {
        const size = new Blob([code]).size;
        const maxSize = this.optimizationSettings.memory.maxCodeCacheSize * 1024 * 1024; // MB to bytes

        // 캐시 크기 확인
        let totalSize = Array.from(this.memoryManager.codeCache.values()).reduce(
          (sum, item) => sum + item.size,
          0
        );

        if (totalSize + size > maxSize) {
          // 오래된 캐시 정리
          this.cleanupCodeCache();
        }

        this.memoryManager.codeCache.set(key, {
          code,
          size,
          timestamp: Date.now(),
          usage: 1,
        });
      },

      // 메모리 사용량 모니터링
      monitorMemory: () => {
        if (performance.memory) {
          const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;

          if (usage > this.optimizationSettings.memory.autoCleanupThreshold) {
            this.performGarbageCollection();
          }
        }
      },
    };

    // 주기적 메모리 정리
    this.memoryManager.cleanupTimer = setInterval(() => {
      this.memoryManager.monitorMemory();
    }, this.optimizationSettings.memory.garbageCollectInterval);
  }

  /**
   * 반응형 디자인 설정
   */
  setupResponsiveDesign() {
    // CSS 변수로 동적 스타일 적용
    const root = document.documentElement;

    // 터치 타겟 크기
    root.style.setProperty(
      '--touch-target-size',
      `${this.optimizationSettings.ui.minTouchTarget}px`
    );

    // 애니메이션 속도
    root.style.setProperty(
      '--animation-duration',
      `${this.optimizationSettings.ui.animationDuration}ms`
    );

    // 디바이스별 폰트 크기
    const baseFontSize = this.deviceInfo.isMobile ? (this.deviceInfo.isTablet ? 16 : 14) : 16;
    root.style.setProperty('--base-font-size', `${baseFontSize}px`);

    // 뷰포트 기반 스케일링
    const updateViewportScale = () => {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      root.style.setProperty('--viewport-width', `${vw}px`);
      root.style.setProperty('--viewport-height', `${vh}px`);
      root.style.setProperty('--scale-factor', Math.min(vw / 375, vh / 667)); // iPhone 6/7/8 기준
    };

    updateViewportScale();
    window.addEventListener('resize', this.debounce(updateViewportScale, 100));
    window.addEventListener('orientationchange', updateViewportScale);
  }

  /**
   * 네트워크 최적화 설정
   */
  setupNetworkOptimization() {
    if (this.deviceInfo.connection) {
      const connection = this.deviceInfo.connection;

      // 연결 상태에 따른 최적화
      const optimizeForConnection = () => {
        const effectiveType = connection.effectiveType;

        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          // 저속 연결: 최소 품질
          this.optimizationSettings.rendering.imageCompressionLevel = 0.3;
          this.optimizationSettings.memory.maxCachedImages = 5;
        } else if (effectiveType === '3g') {
          // 중간 연결: 중간 품질
          this.optimizationSettings.rendering.imageCompressionLevel = 0.6;
          this.optimizationSettings.memory.maxCachedImages = 15;
        } else {
          // 고속 연결: 원래 설정 유지
          this.optimizationSettings.rendering.imageCompressionLevel =
            this.deviceInfo.tier === 'high' ? 0.9 : 0.7;
          this.optimizationSettings.memory.maxCachedImages =
            this.deviceInfo.tier === 'high' ? 50 : 25;
        }
      };

      optimizeForConnection();
      connection.addEventListener('change', optimizeForConnection);
    }
  }

  /**
   * 렌더링 큐에 작업 추가
   */
  queueRender(task) {
    this.renderOptimizer.renderQueue.push(task);
  }

  /**
   * 레이지 컨텐츠 로드
   */
  loadLazyContent(element) {
    if (element.dataset.src) {
      const img = element;
      img.src = element.dataset.src;
      img.classList.remove('lazy');
      this.renderOptimizer.lazyLoader.observer?.unobserve(element);
    }
  }

  /**
   * 햅틱 피드백
   */
  triggerHapticFeedback(type = 'light') {
    if (this.optimizationSettings.touch.hapticFeedback && navigator.vibrate) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30],
        success: [10, 50, 10],
        error: [50, 50, 50],
      };

      navigator.vibrate(patterns[type] || patterns.light);
    }
  }

  /**
   * 가비지 컬렉션
   */
  performGarbageCollection() {
    console.log('🧹 Performing garbage collection...');

    // 이미지 캐시 정리
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5분

    for (const [key, value] of this.memoryManager.imageCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.memoryManager.imageCache.delete(key);
      }
    }

    // 코드 캐시 정리
    this.cleanupCodeCache();

    // 브라우저 가비지 컬렉션 힌트
    if (window.gc) {
      window.gc();
    }
  }

  /**
   * 코드 캐시 정리
   */
  cleanupCodeCache() {
    const entries = Array.from(this.memoryManager.codeCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    ); // 오래된 순 정렬

    // 절반 제거
    const toRemove = Math.ceil(entries.length / 2);
    for (let i = 0; i < toRemove; i++) {
      this.memoryManager.codeCache.delete(entries[i][0]);
    }
  }

  /**
   * 디바운스 유틸리티
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 현재 최적화 상태 조회
   */
  getOptimizationStatus() {
    return {
      deviceInfo: this.deviceInfo,
      settings: this.optimizationSettings,
      memory: {
        imageCache: this.memoryManager.imageCache.size,
        codeCache: this.memoryManager.codeCache.size,
        usage: performance.memory
          ? {
              used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
              total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
              limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
            }
          : null,
      },
      rendering: {
        queueLength: this.renderOptimizer.renderQueue.length,
        fps: this.optimizationSettings.rendering.maxFPS,
      },
    };
  }

  /**
   * 최적화 설정 업데이트
   */
  updateOptimizations(newSettings) {
    Object.assign(this.optimizationSettings, newSettings);

    // 설정 변경 적용
    if (newSettings.rendering) {
      this.renderOptimizer.frameInterval = 1000 / this.optimizationSettings.rendering.maxFPS;
    }

    console.log('📱 Optimization settings updated:', this.optimizationSettings);
  }

  /**
   * 정리
   */
  dispose() {
    // 타이머 정리
    if (this.memoryManager.cleanupTimer) {
      clearInterval(this.memoryManager.cleanupTimer);
    }

    // 렌더링 루프 정리
    if (this.renderOptimizer.rafId) {
      cancelAnimationFrame(this.renderOptimizer.rafId);
    }

    // 이벤트 리스너 정리
    document.removeEventListener('touchstart', this.touchHandler.debouncedTouch);
    document.removeEventListener('touchmove', this.touchHandler.debouncedTouch);
    document.removeEventListener('touchend', this.touchHandler.debouncedTouch);

    // 캐시 정리
    this.memoryManager.imageCache.clear();
    this.memoryManager.codeCache.clear();

    console.log('📱 Mobile Optimization Manager disposed');
  }
}

// 전역 인스턴스 생성
if (typeof window !== 'undefined') {
  window.mobileOptimizationManager = new MobileOptimizationManager();

  // 개발 도구에서 상태 확인용
  window.getMobileOptimizationStatus = () =>
    window.mobileOptimizationManager.getOptimizationStatus();
}

export default MobileOptimizationManager;
