/**
 * 🌐 Universal Environment Adapter
 * Node.js와 브라우저 환경에서 모두 작동하는 유니버설 어댑터
 *
 * 🔧 호환성 지원:
 * - Node.js 16+ (서버사이드 렌더링)
 * - 브라우저 환경 (클라이언트사이드)
 * - 조건부 import 및 polyfill
 * - 환경별 최적화
 *
 * @version 2.0.0
 * @compatibility Node.js 16+, IE11+, Safari 12+, Chrome 70+, Firefox 65+
 */

// 환경 감지
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const isBrowser = typeof window !== 'undefined';
const isWorker = typeof self !== 'undefined' && typeof importScripts === 'function';

export class UniversalEnvironmentAdapter {
  constructor() {
    this.environment = this.detectEnvironment();
    this.features = this.detectFeatures();
    this.globals = this.setupGlobals();
  }

  /**
   * 환경 감지
   */
  detectEnvironment() {
    if (isNode) {
      return {
        type: 'node',
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        isSSR: true,
        supportsModules: true,
      };
    } else if (isWorker) {
      return {
        type: 'worker',
        isSSR: false,
        supportsModules: false,
      };
    } else if (isBrowser) {
      return {
        type: 'browser',
        userAgent: navigator.userAgent,
        isSSR: false,
        supportsModules: 'noModule' in HTMLScriptElement.prototype,
      };
    } else {
      return {
        type: 'unknown',
        isSSR: false,
        supportsModules: false,
      };
    }
  }

  /**
   * 기능 감지
   */
  detectFeatures() {
    const features = {
      fetch: false,
      localStorage: false,
      sessionStorage: false,
      indexedDB: false,
      webSocket: false,
      worker: false,
      serviceWorker: false,
      filesystem: false,
      crypto: false,
    };

    if (isNode) {
      // Node.js 환경
      features.filesystem = true;
      features.crypto = true;
      // Node.js 18+에서는 fetch가 내장됨
      features.fetch = parseInt(process.version.slice(1)) >= 18;
    } else if (isBrowser) {
      // 브라우저 환경
      features.fetch = typeof fetch !== 'undefined';
      features.localStorage = typeof localStorage !== 'undefined';
      features.sessionStorage = typeof sessionStorage !== 'undefined';
      features.indexedDB = typeof indexedDB !== 'undefined';
      features.webSocket = typeof WebSocket !== 'undefined';
      features.worker = typeof Worker !== 'undefined';
      features.serviceWorker = 'serviceWorker' in navigator;
      features.crypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    }

    return features;
  }

  /**
   * 글로벌 객체 설정
   */
  setupGlobals() {
    const globals = {};

    if (isNode) {
      // Node.js 환경에서 브라우저 API 폴리필
      try {
        // 동적 import로 Node.js 모듈 로드
        globals.fs = require('fs');
        globals.path = require('path');
        globals.crypto = require('crypto');

        // fetch polyfill for Node.js < 18
        if (!this.features.fetch) {
          globals.fetch = require('node-fetch');
        } else {
          globals.fetch = fetch;
        }

        // localStorage polyfill
        globals.localStorage = this.createNodeLocalStorage();
        globals.sessionStorage = this.createNodeSessionStorage();
      } catch (error) {
        console.warn('[UniversalEnvironmentAdapter] Node.js 모듈 로드 실패:', error.message);
      }
    } else if (isBrowser) {
      // 브라우저 환경
      globals.fetch = window.fetch?.bind(window) || this.createFetchPolyfill();
      globals.localStorage = window.localStorage;
      globals.sessionStorage = window.sessionStorage;
      globals.crypto = window.crypto;
    }

    return globals;
  }

  /**
   * Node.js용 localStorage 폴리필
   */
  createNodeLocalStorage() {
    if (!isNode) return null;

    const storage = new Map();

    return {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      clear: () => storage.clear(),
      get length() {
        return storage.size;
      },
      key: index => {
        const keys = Array.from(storage.keys());
        return keys[index] || null;
      },
    };
  }

  /**
   * Node.js용 sessionStorage 폴리필
   */
  createNodeSessionStorage() {
    // Node.js에서는 localStorage와 동일하게 처리 (세션 개념이 다름)
    return this.createNodeLocalStorage();
  }

  /**
   * 브라우저용 fetch 폴리필 (IE11 등)
   */
  createFetchPolyfill() {
    if (typeof XMLHttpRequest === 'undefined') return null;

    return function fetchPolyfill(url, options = {}) {
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
        if (options.timeout) {
          xhr.timeout = options.timeout;
        }

        xhr.onload = () => {
          const response = {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            headers: new Map(),
            json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            text: () => Promise.resolve(xhr.responseText),
            arrayBuffer: () => Promise.resolve(xhr.response),
          };

          // 헤더 파싱
          if (xhr.getAllResponseHeaders) {
            const headerText = xhr.getAllResponseHeaders();
            headerText.split('\r\n').forEach(line => {
              const [key, value] = line.split(': ');
              if (key && value) {
                response.headers.set(key.toLowerCase(), value);
              }
            });
          }

          resolve(response);
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Request timeout'));

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
   * 조건부 모듈 로더
   */
  async loadModule(modulePath, fallback = null) {
    try {
      if (isNode) {
        // Node.js 환경
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
          // 상대 경로는 동적 import 사용
          return await import(modulePath);
        } else {
          // npm 패키지는 require 사용
          return require(modulePath);
        }
      } else if (isBrowser && this.environment.supportsModules) {
        // 모던 브라우저
        return await import(modulePath);
      } else if (isBrowser) {
        // 레거시 브라우저 - script 태그로 로드
        return this.loadScriptTag(modulePath);
      }
    } catch (error) {
      console.warn(`[UniversalEnvironmentAdapter] 모듈 로드 실패: ${modulePath}`, error.message);

      if (fallback && typeof fallback === 'function') {
        return fallback();
      }

      throw error;
    }
  }

  /**
   * 레거시 브라우저용 스크립트 태그 로더
   */
  loadScriptTag(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(window); // 글로벌 객체 반환
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * 환경별 설정 반환
   */
  getConfig() {
    const baseConfig = {
      environment: this.environment,
      features: this.features,
    };

    if (isNode) {
      return {
        ...baseConfig,
        storage: {
          type: 'memory',
          persistent: false,
        },
        network: {
          timeout: 30000,
          retries: 3,
        },
        performance: {
          enableCaching: true,
          enableCompression: true,
        },
      };
    } else if (isBrowser) {
      return {
        ...baseConfig,
        storage: {
          type: this.features.localStorage ? 'localStorage' : 'memory',
          persistent: this.features.localStorage,
        },
        network: {
          timeout: 15000,
          retries: 2,
        },
        performance: {
          enableCaching: this.features.localStorage,
          enableCompression: false, // 브라우저에서는 서버가 처리
        },
      };
    } else {
      return {
        ...baseConfig,
        storage: {
          type: 'memory',
          persistent: false,
        },
        network: {
          timeout: 10000,
          retries: 1,
        },
        performance: {
          enableCaching: false,
          enableCompression: false,
        },
      };
    }
  }

  /**
   * 저장소 인터페이스
   */
  getStorage() {
    return {
      get: key => {
        if (this.globals.localStorage) {
          return this.globals.localStorage.getItem(key);
        }
        return null;
      },

      set: (key, value) => {
        if (this.globals.localStorage) {
          this.globals.localStorage.setItem(key, value);
          return true;
        }
        return false;
      },

      remove: key => {
        if (this.globals.localStorage) {
          this.globals.localStorage.removeItem(key);
          return true;
        }
        return false;
      },

      clear: () => {
        if (this.globals.localStorage) {
          this.globals.localStorage.clear();
          return true;
        }
        return false;
      },
    };
  }

  /**
   * 네트워크 인터페이스
   */
  getNetwork() {
    return {
      fetch: this.globals.fetch,

      request: async (url, options = {}) => {
        if (!this.globals.fetch) {
          throw new Error('fetch not available');
        }

        const config = this.getConfig();
        const mergedOptions = {
          timeout: config.network.timeout,
          ...options,
        };

        return this.globals.fetch(url, mergedOptions);
      },
    };
  }

  /**
   * 암호화 인터페이스
   */
  getCrypto() {
    if (!this.globals.crypto) {
      return null;
    }

    return {
      generateUUID: () => {
        if (isNode && this.globals.crypto.randomUUID) {
          return this.globals.crypto.randomUUID();
        } else if (isBrowser && this.globals.crypto.randomUUID) {
          return this.globals.crypto.randomUUID();
        } else {
          // 폴백: 간단한 UUID v4 생성
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        }
      },

      hash: async (data, algorithm = 'SHA-256') => {
        if (isNode) {
          const hash = this.globals.crypto.createHash(algorithm.toLowerCase());
          hash.update(data);
          return hash.digest('hex');
        } else if (this.globals.crypto.subtle) {
          const encoder = new TextEncoder();
          const dataBuffer = encoder.encode(data);
          const hashBuffer = await this.globals.crypto.subtle.digest(algorithm, dataBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          throw new Error('Crypto not available');
        }
      },
    };
  }

  /**
   * 환경 정보 반환
   */
  getEnvironmentInfo() {
    return {
      type: this.environment.type,
      isNode: isNode,
      isBrowser: isBrowser,
      isWorker: isWorker,
      isSSR: this.environment.isSSR,
      features: this.features,
      userAgent: isBrowser ? navigator.userAgent : `Node.js ${this.environment.version}`,
    };
  }
}

// 싱글톤 인스턴스 생성
export const universalAdapter = new UniversalEnvironmentAdapter();

// 편의 함수들
export const isNodeEnvironment = () => isNode;
export const isBrowserEnvironment = () => isBrowser;
export const isWorkerEnvironment = () => isWorker;

export default universalAdapter;
