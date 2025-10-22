/**
 * 🎮 Game Resource Manager
 * 게임 리소스 로딩, 캐싱, 최적화 관리 시스템
 * 
 * 🔧 호환성 지원:
 * - IE 11+ (XHR 폴백)
 * - Safari 12+ (웹킷 최적화)
 * - Chrome 70+, Firefox 65+
 * - 네트워크 상태 기반 적응적 로딩
 * - 메모리 사용량 최적화
 * 
 * @version 2.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { CompatibilityManager } from './compatibilityManager';

export class GameResourceManager {
  constructor(options = {}) {
    this.isInitialized = false;
    this.compatibilityInfo = null;
    this.fetchFunction = null;
    
    // 기본 설정
    this.settings = {
      performanceTier: 'medium', // 'high', 'medium', 'low'
      enablePreloading: true,
      maxConcurrentRequests: 3,
      cacheSize: 50, // MB
      networkTimeout: 30000, // 30초
      retryAttempts: 3,
      retryDelay: 1000,
      enableCompression: true,
      enableResourceHints: true,
      ...options
    };
    
    // 리소스 캐시
    this.cache = new Map();
    this.preloadQueue = [];
    this.loadingPromises = new Map();
    this.loadStatistics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalBytesLoaded: 0,
      averageLoadTime: 0,
    };
    
    // 네트워크 상태
    this.networkInfo = {
      isOnline: navigator.onLine,
      connectionType: this.getConnectionType(),
      estimatedBandwidth: this.estimateBandwidth(),
    };
    
    // 메모리 관리
    this.memoryUsage = 0;
    this.maxMemoryUsage = this.calculateMaxMemory();
    
    // 요청 큐 관리
    this.activeRequests = 0;
    this.requestQueue = [];
    
    this.init();
  }

  /**
   * 초기화
   */
  async init() {
    try {
      // 호환성 정보 가져오기
      this.compatibilityInfo = CompatibilityManager.getCompatibilityInfo();
      
      // 호환성 있는 fetch 함수 설정
      this.fetchFunction = this.compatibilityInfo.features.fetch ? 
        fetch.bind(window) : 
        CompatibilityManager.getFetchPolyfill();
      
      // 네트워크 상태 모니터링
      this.setupNetworkMonitoring();
      
      // 메모리 모니터링 (가능한 경우)
      this.setupMemoryMonitoring();
      
      // 성능 기반 설정 조정
      this.adjustPerformanceSettings();
      
      this.isInitialized = true;
      console.log('[GameResourceManager] 초기화 완료', {
        performanceTier: this.settings.performanceTier,
        compatibility: this.compatibilityInfo.level,
        networkType: this.networkInfo.connectionType,
      });
      
    } catch (error) {
      console.error('[GameResourceManager] 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 연결 타입 감지
   */
  getConnectionType() {
    if (navigator.connection) {
      return navigator.connection.effectiveType || navigator.connection.type || 'unknown';
    } else if (navigator.mozConnection) {
      return navigator.mozConnection.type || 'unknown';
    } else if (navigator.webkitConnection) {
      return navigator.webkitConnection.type || 'unknown';
    }
    return 'unknown';
  }

  /**
   * 대역폭 추정
   */
  estimateBandwidth() {
    if (navigator.connection && navigator.connection.downlink) {
      return navigator.connection.downlink * 1000; // Mbps to kbps
    }
    
    // 연결 타입 기반 추정
    const bandwidthMap = {
      'slow-2g': 50,
      '2g': 250,
      '3g': 1500,
      '4g': 10000,
      'wifi': 25000,
      'ethernet': 100000,
    };
    
    return bandwidthMap[this.networkInfo.connectionType] || 5000;
  }

  /**
   * 최대 메모리 사용량 계산
   */
  calculateMaxMemory() {
    // 사용 가능한 메모리 정보가 있으면 사용
    if (navigator.deviceMemory) {
      return Math.min(navigator.deviceMemory * 1024 * 0.1, 100); // 10% of device memory, max 100MB
    }
    
    // 성능 등급 기반 추정
    const memoryMap = {
      'high': 100,   // 100MB
      'medium': 50,  // 50MB
      'low': 25,     // 25MB
    };
    
    return memoryMap[this.settings.performanceTier] || 50;
  }

  /**
   * 네트워크 상태 모니터링 설정
   */
  setupNetworkMonitoring() {
    // 온라인/오프라인 상태 감지
    window.addEventListener('online', () => {
      this.networkInfo.isOnline = true;
      this.resumeQueuedRequests();
    });
    
    window.addEventListener('offline', () => {
      this.networkInfo.isOnline = false;
      console.warn('[GameResourceManager] 오프라인 모드로 전환');
    });
    
    // 연결 상태 변경 감지 (지원되는 브라우저에서만)
    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => {
        this.networkInfo.connectionType = this.getConnectionType();
        this.networkInfo.estimatedBandwidth = this.estimateBandwidth();
        this.adjustPerformanceSettings();
      });
    }
  }

  /**
   * 메모리 모니터링 설정
   */
  setupMemoryMonitoring() {
    if (performance.memory) {
      // Chrome/Edge에서 메모리 정보 모니터링
      setInterval(() => {
        const memInfo = performance.memory;
        this.memoryUsage = (memInfo.usedJSHeapSize / 1024 / 1024); // MB
        
        // 메모리 사용량이 임계치를 초과하면 캐시 정리
        if (this.memoryUsage > this.maxMemoryUsage * 0.8) {
          this.cleanupCache();
        }
      }, 10000); // 10초마다 확인
    }
  }

  /**
   * 성능 기반 설정 조정
   */
  adjustPerformanceSettings() {
    const connectionSpeed = this.networkInfo.estimatedBandwidth;
    
    // 연결 속도에 따른 동적 조정
    if (connectionSpeed < 500) { // 2G
      this.settings.maxConcurrentRequests = 1;
      this.settings.enablePreloading = false;
      this.settings.networkTimeout = 60000;
    } else if (connectionSpeed < 2000) { // 3G
      this.settings.maxConcurrentRequests = 2;
      this.settings.enablePreloading = false;
      this.settings.networkTimeout = 45000;
    } else { // 4G/WiFi
      this.settings.maxConcurrentRequests = Math.min(6, this.settings.maxConcurrentRequests);
      this.settings.enablePreloading = true;
      this.settings.networkTimeout = 30000;
    }
  }

  /**
   * 리소스 로드
   */
  async loadResource(url, options = {}) {
    if (!this.isInitialized) {
      await this.init();
    }

    // 캐시에서 확인
    const cacheKey = this.getCacheKey(url, options);
    if (this.cache.has(cacheKey)) {
      const cachedResource = this.cache.get(cacheKey);
      if (!this.isExpired(cachedResource)) {
        return cachedResource.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // 이미 로딩 중인 리소스 확인
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    // 새 로딩 요청 생성
    const loadingPromise = this.executeLoadRequest(url, options);
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const result = await loadingPromise;
      this.loadingPromises.delete(cacheKey);
      return result;
    } catch (error) {
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  /**
   * 로드 요청 실행
   */
  async executeLoadRequest(url, options) {
    // 요청 큐 관리
    if (this.activeRequests >= this.settings.maxConcurrentRequests) {
      await this.waitForSlot();
    }

    this.activeRequests++;
    const startTime = Date.now();

    try {
      let result;
      const resourceType = this.getResourceType(url, options.type);
      
      switch (resourceType) {
        case 'image':
          result = await this.loadImage(url, options);
          break;
        case 'audio':
          result = await this.loadAudio(url, options);
          break;
        case 'json':
          result = await this.loadJSON(url, options);
          break;
        case 'text':
          result = await this.loadText(url, options);
          break;
        default:
          result = await this.loadGeneric(url, options);
      }

      // 캐시에 저장
      const cacheKey = this.getCacheKey(url, options);
      this.cacheResource(cacheKey, result, resourceType);
      
      // 통계 업데이트
      this.updateStatistics(true, Date.now() - startTime, result.size || 0);
      
      return result;
      
    } catch (error) {
      this.updateStatistics(false, Date.now() - startTime, 0);
      throw error;
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  /**
   * 이미지 로드
   */
  async loadImage(url, options) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      // CORS 설정
      if (options.crossOrigin) {
        img.crossOrigin = options.crossOrigin;
      }
      
      // IE11 호환성: 이벤트 리스너를 먼저 등록
      img.onload = () => {
        resolve({
          data: img,
          url: url,
          type: 'image',
          size: this.estimateImageSize(img),
          loadedAt: Date.now(),
        });
      };
      
      img.onerror = () => {
        reject(new Error(`이미지 로드 실패: ${url}`));
      };
      
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        reject(new Error(`이미지 로드 타임아웃: ${url}`));
      }, this.settings.networkTimeout);
      
      img.onload = (originalOnload => () => {
        clearTimeout(timeout);
        originalOnload();
      })(img.onload);
      
      img.src = url;
    });
  }

  /**
   * 오디오 로드
   */
  async loadAudio(url, options) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      
      // CORS 설정
      if (options.crossOrigin) {
        audio.crossOrigin = options.crossOrigin;
      }
      
      const onCanPlayThrough = () => {
        audio.removeEventListener('canplaythrough', onCanPlayThrough);
        audio.removeEventListener('error', onError);
        
        resolve({
          data: audio,
          url: url,
          type: 'audio',
          size: audio.duration * 128 * 1024 / 8, // 추정 크기 (128kbps)
          loadedAt: Date.now(),
        });
      };
      
      const onError = () => {
        audio.removeEventListener('canplaythrough', onCanPlayThrough);
        audio.removeEventListener('error', onError);
        reject(new Error(`오디오 로드 실패: ${url}`));
      };
      
      audio.addEventListener('canplaythrough', onCanPlayThrough);
      audio.addEventListener('error', onError);
      
      // 타임아웃 설정
      setTimeout(() => {
        audio.removeEventListener('canplaythrough', onCanPlayThrough);
        audio.removeEventListener('error', onError);
        reject(new Error(`오디오 로드 타임아웃: ${url}`));
      }, this.settings.networkTimeout);
      
      audio.preload = 'auto';
      audio.src = url;
    });
  }

  /**
   * JSON 데이터 로드
   */
  async loadJSON(url, options) {
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const jsonData = await response.json();
    
    return {
      data: jsonData,
      url: url,
      type: 'json',
      size: JSON.stringify(jsonData).length,
      loadedAt: Date.now(),
    };
  }

  /**
   * 텍스트 데이터 로드
   */
  async loadText(url, options) {
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        ...options.headers
      },
      ...options
    });
    
    const textData = await response.text();
    
    return {
      data: textData,
      url: url,
      type: 'text',
      size: textData.length,
      loadedAt: Date.now(),
    };
  }

  /**
   * 일반 리소스 로드
   */
  async loadGeneric(url, options) {
    const response = await this.fetchWithRetry(url, options);
    const arrayBuffer = await response.arrayBuffer();
    
    return {
      data: arrayBuffer,
      url: url,
      type: 'generic',
      size: arrayBuffer.byteLength,
      loadedAt: Date.now(),
    };
  }

  /**
   * 재시도 기능이 있는 fetch
   */
  async fetchWithRetry(url, options, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.settings.networkTimeout);
      
      const response = await this.fetchFunction(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
      
    } catch (error) {
      if (attempt < this.settings.retryAttempts && this.networkInfo.isOnline) {
        console.warn(`[GameResourceManager] 재시도 ${attempt}/${this.settings.retryAttempts}: ${url}`, error.message);
        await this.delay(this.settings.retryDelay * attempt);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * 리소스 타입 감지
   */
  getResourceType(url, explicitType) {
    if (explicitType) return explicitType;
    
    const extension = url.split('.').pop().toLowerCase();
    
    const typeMap = {
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image', 'svg': 'image',
      'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'aac': 'audio', 'm4a': 'audio',
      'json': 'json',
      'txt': 'text', 'html': 'text', 'css': 'text', 'js': 'text',
    };
    
    return typeMap[extension] || 'generic';
  }

  /**
   * 캐시 키 생성
   */
  getCacheKey(url, options) {
    const optionsHash = JSON.stringify(options);
    return `${url}:${btoa(optionsHash)}`;
  }

  /**
   * 리소스 캐싱
   */
  cacheResource(key, resource, type) {
    // 메모리 사용량 확인
    if (this.memoryUsage + (resource.size || 0) / 1024 / 1024 > this.maxMemoryUsage) {
      this.cleanupCache();
    }
    
    this.cache.set(key, {
      ...resource,
      cachedAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24시간
    });
  }

  /**
   * 캐시 만료 확인
   */
  isExpired(cachedResource) {
    return Date.now() > cachedResource.expiresAt;
  }

  /**
   * 캐시 정리
   */
  cleanupCache() {
    const now = Date.now();
    const sortedEntries = Array.from(this.cache.entries())
      .sort(([,a], [,b]) => a.cachedAt - b.cachedAt);
    
    // 오래된 엔트리부터 제거
    const targetSize = this.maxMemoryUsage * 0.7; // 70%까지 줄이기
    let currentSize = this.memoryUsage;
    
    for (const [key, resource] of sortedEntries) {
      if (currentSize <= targetSize) break;
      
      if (this.isExpired(resource) || currentSize > targetSize) {
        this.cache.delete(key);
        currentSize -= (resource.size || 0) / 1024 / 1024;
      }
    }
    
    console.log(`[GameResourceManager] 캐시 정리 완료: ${this.cache.size} 항목 남음`);
  }

  /**
   * 이미지 크기 추정
   */
  estimateImageSize(img) {
    return img.naturalWidth * img.naturalHeight * 4; // RGBA 기준
  }

  /**
   * 요청 슬롯 대기
   */
  async waitForSlot() {
    return new Promise(resolve => {
      this.requestQueue.push(resolve);
    });
  }

  /**
   * 큐 처리
   */
  processQueue() {
    if (this.requestQueue.length > 0 && this.activeRequests < this.settings.maxConcurrentRequests) {
      const resolve = this.requestQueue.shift();
      resolve();
    }
  }

  /**
   * 큐된 요청 재개
   */
  resumeQueuedRequests() {
    while (this.requestQueue.length > 0 && this.activeRequests < this.settings.maxConcurrentRequests) {
      this.processQueue();
    }
  }

  /**
   * 통계 업데이트
   */
  updateStatistics(success, loadTime, bytes) {
    this.loadStatistics.totalRequests++;
    
    if (success) {
      this.loadStatistics.successfulRequests++;
      this.loadStatistics.totalBytesLoaded += bytes;
      
      // 평균 로딩 시간 계산
      const totalTime = this.loadStatistics.averageLoadTime * (this.loadStatistics.successfulRequests - 1) + loadTime;
      this.loadStatistics.averageLoadTime = totalTime / this.loadStatistics.successfulRequests;
    } else {
      this.loadStatistics.failedRequests++;
    }
  }

  /**
   * 지연 함수
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 로딩 통계 반환
   */
  getStatistics() {
    return {
      ...this.loadStatistics,
      cacheSize: this.cache.size,
      memoryUsage: this.memoryUsage,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      networkInfo: this.networkInfo,
    };
  }

  /**
   * 정리 작업
   */
  cleanup() {
    // 캐시 정리
    this.cache.clear();
    
    // 요청 큐 정리
    this.requestQueue.forEach(resolve => resolve());
    this.requestQueue.length = 0;
    
    // 로딩 프로미스 정리
    this.loadingPromises.clear();
    
    console.log('[GameResourceManager] 정리 완료');
  }
}

export default GameResourceManager;