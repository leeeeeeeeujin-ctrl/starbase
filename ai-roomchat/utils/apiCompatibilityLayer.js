/**
 * 🌐 API Compatibility Layer
 * 호환성 있는 API 통신 및 버전 관리 시스템
 *
 * 🔧 호환성 지원:
 * - IE 11+ (XHR 폴백)
 * - Safari 12+ (쿠키/CORS 처리)
 * - Chrome 70+, Firefox 65+
 * - 네트워크 에러 처리 및 재시도
 * - API 버전 협상 및 폴백
 *
 * @version 2.0.0
 * @compatibility IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

import { CompatibilityManager } from './compatibilityManager';

export class APICompatibilityLayer {
  constructor(options = {}) {
    this.isInitialized = false;
    this.compatibilityInfo = null;
    this.fetchFunction = null;

    // 기본 설정
    this.settings = {
      baseURL: options.baseURL || '',
      apiVersion: options.apiVersion || 'v1',
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      enableVersionNegotiation: options.enableVersionNegotiation ?? true,
      enableRequestCaching: options.enableRequestCaching ?? true,
      maxCacheAge: options.maxCacheAge || 300000, // 5분
      ...options,
    };

    // API 버전 지원 매트릭스
    this.apiVersions = {
      v3: {
        features: ['websockets', 'streaming', 'batch-requests', 'real-time'],
        fallback: 'v2',
        endpoints: {
          'battle-judge': '/api/v3/ai-battle-judge',
          character: '/api/v3/character',
          'game-state': '/api/v3/game-state',
        },
      },
      v2: {
        features: ['batch-requests', 'compression'],
        fallback: 'v1',
        endpoints: {
          'battle-judge': '/api/v2/ai-battle-judge',
          character: '/api/v2/character',
          'game-state': '/api/v2/game-state',
        },
      },
      v1: {
        features: ['basic-rest'],
        fallback: null,
        endpoints: {
          'battle-judge': '/api/ai-battle-judge',
          character: '/api/character',
          'game-state': '/api/game-state',
        },
      },
    };

    // 요청 캐시
    this.requestCache = new Map();
    this.pendingRequests = new Map();

    // 네트워크 상태
    this.networkState = {
      isOnline: navigator.onLine,
      latency: 0,
      bandwidth: 0,
      lastCheck: Date.now(),
    };

    // 에러 통계
    this.errorStats = {
      totalRequests: 0,
      failedRequests: 0,
      networkErrors: 0,
      serverErrors: 0,
      clientErrors: 0,
    };

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
      this.setupFetchFunction();

      // 네트워크 상태 모니터링
      this.setupNetworkMonitoring();

      // API 버전 협상
      if (this.settings.enableVersionNegotiation) {
        await this.negotiateAPIVersion();
      }

      this.isInitialized = true;
      console.log('[APICompatibilityLayer] 초기화 완료', {
        apiVersion: this.settings.apiVersion,
        compatibility: this.compatibilityInfo.level,
        fetchSupport: this.compatibilityInfo.features.fetch,
      });
    } catch (error) {
      console.error('[APICompatibilityLayer] 초기화 실패:', error);
      // 초기화 실패해도 기본 기능은 사용 가능
      this.isInitialized = true;
    }
  }

  /**
   * Fetch 함수 설정
   */
  setupFetchFunction() {
    if (this.compatibilityInfo.features.fetch) {
      this.fetchFunction = fetch.bind(window);
    } else {
      // IE11 폴백: XHR 기반 fetch 폴리필
      this.fetchFunction = this.createXHRFetch();
    }
  }

  /**
   * XHR 기반 fetch 구현 (IE11 호환)
   */
  createXHRFetch() {
    return (url, options = {}) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const method = options.method || 'GET';

        xhr.open(method, url);

        // 헤더 설정
        if (options.headers) {
          Object.keys(options.headers).forEach(key => {
            xhr.setRequestHeader(key, options.headers[key]);
          });
        }

        // 타임아웃 설정
        xhr.timeout = this.settings.timeout;

        // 이벤트 핸들러
        xhr.onload = () => {
          const response = {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            headers: this.parseXHRHeaders(xhr.getAllResponseHeaders()),
            json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            text: () => Promise.resolve(xhr.responseText),
            arrayBuffer: () => Promise.resolve(xhr.response),
          };
          resolve(response);
        };

        xhr.onerror = () => {
          reject(new Error('Network error'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Request timeout'));
        };

        // 요청 전송
        if (options.body) {
          xhr.send(options.body);
        } else {
          xhr.send();
        }
      });
    };
  }

  /**
   * XHR 헤더 파싱
   */
  parseXHRHeaders(headerString) {
    const headers = new Map();
    if (headerString) {
      headerString.split('\r\n').forEach(line => {
        const [key, value] = line.split(': ');
        if (key && value) {
          headers.set(key.toLowerCase(), value);
        }
      });
    }
    return headers;
  }

  /**
   * 네트워크 상태 모니터링
   */
  setupNetworkMonitoring() {
    // 온라인/오프라인 이벤트
    window.addEventListener('online', () => {
      this.networkState.isOnline = true;
      console.log('[APICompatibilityLayer] 네트워크 연결됨');
    });

    window.addEventListener('offline', () => {
      this.networkState.isOnline = false;
      console.warn('[APICompatibilityLayer] 네트워크 연결 끊어짐');
    });

    // 주기적 네트워크 상태 확인
    setInterval(() => {
      this.checkNetworkHealth();
    }, 30000); // 30초마다
  }

  /**
   * 네트워크 상태 확인
   */
  async checkNetworkHealth() {
    const startTime = Date.now();

    try {
      const response = await this.fetchFunction('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
      });

      const latency = Date.now() - startTime;
      this.networkState.latency = latency;
      this.networkState.lastCheck = Date.now();

      if (response.ok) {
        console.log(`[APICompatibilityLayer] 네트워크 상태 양호 (지연: ${latency}ms)`);
      }
    } catch (error) {
      console.warn('[APICompatibilityLayer] 네트워크 상태 확인 실패:', error.message);
    }
  }

  /**
   * API 버전 협상
   */
  async negotiateAPIVersion() {
    try {
      // 서버가 지원하는 API 버전 확인
      const response = await this.fetchFunction('/api/version', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const versionInfo = await response.json();
        const supportedVersions = versionInfo.supported || ['v1'];

        // 가장 높은 지원 버전 선택
        const availableVersions = Object.keys(this.apiVersions);
        for (const version of availableVersions) {
          if (supportedVersions.includes(version)) {
            this.settings.apiVersion = version;
            console.log(`[APICompatibilityLayer] API 버전 협상 완료: ${version}`);
            return;
          }
        }
      }
    } catch (error) {
      console.warn('[APICompatibilityLayer] API 버전 협상 실패, v1 사용:', error.message);
    }

    // 폴백: v1 사용
    this.settings.apiVersion = 'v1';
  }

  /**
   * API 요청 실행
   */
  async request(endpoint, options = {}) {
    if (!this.isInitialized) {
      await this.init();
    }

    const startTime = Date.now();
    this.errorStats.totalRequests++;

    try {
      // 캐시 확인
      if (this.settings.enableRequestCaching && options.method !== 'POST') {
        const cachedResponse = this.getCachedResponse(endpoint, options);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      // 중복 요청 확인
      const requestKey = this.getRequestKey(endpoint, options);
      if (this.pendingRequests.has(requestKey)) {
        return this.pendingRequests.get(requestKey);
      }

      // 요청 실행
      const requestPromise = this.executeRequest(endpoint, options);
      this.pendingRequests.set(requestKey, requestPromise);

      try {
        const result = await requestPromise;

        // 캐시에 저장
        if (this.settings.enableRequestCaching && options.method !== 'POST') {
          this.cacheResponse(endpoint, options, result);
        }

        return result;
      } finally {
        this.pendingRequests.delete(requestKey);
      }
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      console.log(`[APICompatibilityLayer] 요청 완료: ${endpoint} (${duration}ms)`);
    }
  }

  /**
   * 요청 실행
   */
  async executeRequest(endpoint, options, attempt = 1) {
    const url = this.buildURL(endpoint);
    const requestOptions = this.buildRequestOptions(options);

    try {
      // 네트워크 상태 확인
      if (!this.networkState.isOnline) {
        throw new Error('네트워크 연결 없음');
      }

      const response = await this.fetchFunction(url, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 응답 파싱
      const contentType = response.headers.get?.('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.includes('text/')) {
        data = await response.text();
      } else {
        data = await response.arrayBuffer();
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
        url: response.url || url,
      };
    } catch (error) {
      // 재시도 로직
      if (attempt < this.settings.retryAttempts && this.shouldRetry(error)) {
        console.warn(
          `[APICompatibilityLayer] 재시도 ${attempt}/${this.settings.retryAttempts}: ${endpoint}`,
          error.message
        );

        await this.delay(this.settings.retryDelay * attempt);
        return this.executeRequest(endpoint, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * URL 생성
   */
  buildURL(endpoint) {
    const versionInfo = this.apiVersions[this.settings.apiVersion];
    let url;

    if (versionInfo && versionInfo.endpoints[endpoint]) {
      url = versionInfo.endpoints[endpoint];
    } else {
      // 폴백: 기본 엔드포인트
      url = `/api/${endpoint}`;
    }

    return this.settings.baseURL + url;
  }

  /**
   * 요청 옵션 생성
   */
  buildRequestOptions(options) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Version': this.settings.apiVersion,
    };

    // IE11 호환성: AbortController 확인
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      ...options,
    };

    // AbortController 지원 확인
    if (this.compatibilityInfo.features.abortController && options.signal) {
      requestOptions.signal = options.signal;
    }

    return requestOptions;
  }

  /**
   * 재시도 여부 판단
   */
  shouldRetry(error) {
    // 네트워크 에러나 서버 에러 시 재시도
    if (error.name === 'TypeError' || error.message.includes('Network error')) {
      return true;
    }

    // 5xx 서버 에러 시 재시도
    if (error.message.includes('HTTP 5')) {
      return true;
    }

    // 타임아웃 시 재시도
    if (error.message.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * 요청 에러 처리
   */
  handleRequestError(error) {
    this.errorStats.failedRequests++;

    if (error.name === 'TypeError' || error.message.includes('Network')) {
      this.errorStats.networkErrors++;
    } else if (error.message.includes('HTTP 5')) {
      this.errorStats.serverErrors++;
    } else if (error.message.includes('HTTP 4')) {
      this.errorStats.clientErrors++;
    }
  }

  /**
   * 요청 키 생성
   */
  getRequestKey(endpoint, options) {
    const keyData = {
      endpoint,
      method: options.method || 'GET',
      params: options.params,
      body: options.body,
    };
    return btoa(JSON.stringify(keyData));
  }

  /**
   * 캐시된 응답 확인
   */
  getCachedResponse(endpoint, options) {
    const key = this.getRequestKey(endpoint, options);
    const cached = this.requestCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.settings.maxCacheAge) {
      console.log(`[APICompatibilityLayer] 캐시 히트: ${endpoint}`);
      return cached.response;
    }

    return null;
  }

  /**
   * 응답 캐싱
   */
  cacheResponse(endpoint, options, response) {
    const key = this.getRequestKey(endpoint, options);
    this.requestCache.set(key, {
      response,
      timestamp: Date.now(),
    });

    // 캐시 크기 제한
    if (this.requestCache.size > 100) {
      const oldestKey = this.requestCache.keys().next().value;
      this.requestCache.delete(oldestKey);
    }
  }

  /**
   * 지연 함수
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 특화 API 메서드들
   */

  /**
   * AI 배틀 판정 요청
   */
  async requestBattleJudgment(gameData) {
    return this.request('battle-judge', {
      method: 'POST',
      body: JSON.stringify(gameData),
    });
  }

  /**
   * 캐릭터 데이터 가져오기
   */
  async getCharacterData(characterId) {
    return this.request('character', {
      method: 'GET',
      params: { id: characterId },
    });
  }

  /**
   * 게임 상태 저장
   */
  async saveGameState(gameState) {
    return this.request('game-state', {
      method: 'POST',
      body: JSON.stringify(gameState),
    });
  }

  /**
   * 통계 정보 반환
   */
  getStatistics() {
    return {
      ...this.errorStats,
      networkState: this.networkState,
      cacheSize: this.requestCache.size,
      pendingRequests: this.pendingRequests.size,
      apiVersion: this.settings.apiVersion,
    };
  }

  /**
   * 정리 작업
   */
  cleanup() {
    // 캐시 정리
    this.requestCache.clear();

    // 대기 중인 요청 정리
    this.pendingRequests.clear();

    console.log('[APICompatibilityLayer] 정리 완료');
  }
}

export default APICompatibilityLayer;
