/**
 * 🔧 Polyfills - 브라우저 호환성 폴리필 모음
 *
 * IE 11+, Safari 12+, Chrome 70+, Firefox 65+ 지원을 위한
 * 핵심 폴리필들을 조건부로 로드
 */

class PolyfillLoader {
  constructor() {
    this.loadedPolyfills = new Set();
    this.polyfillPromises = new Map();
  }

  /**
   * 필수 폴리필들을 조건부 로드
   */
  async loadEssentialPolyfills() {
    const promises = [];

    // Promise 폴리필 (IE)
    if (!window.Promise) {
      promises.push(this.loadPromisePolyfill());
    }

    // Fetch 폴리필 (IE)
    if (!window.fetch) {
      promises.push(this.loadFetchPolyfill());
    }

    // Optional Chaining & Nullish Coalescing (IE, 구형 Safari)
    if (!this.supportsOptionalChaining()) {
      promises.push(this.loadOptionalChainingPolyfill());
    }

    // IntersectionObserver (IE, 구형 Safari)
    if (!window.IntersectionObserver) {
      promises.push(this.loadIntersectionObserverPolyfill());
    }

    // ResizeObserver (IE, 구형 Safari)
    if (!window.ResizeObserver) {
      promises.push(this.loadResizeObserverPolyfill());
    }

    // Array methods (IE)
    promises.push(this.loadArrayPolyfills());

    // Object methods (IE)
    promises.push(this.loadObjectPolyfills());

    // String methods (IE)
    promises.push(this.loadStringPolyfills());

    // CSS Custom Properties (IE)
    if (!this.supportsCSSCustomProperties()) {
      promises.push(this.loadCSSCustomPropertiesPolyfill());
    }

    await Promise.all(promises);
    console.log('✅ Essential polyfills loaded:', Array.from(this.loadedPolyfills));
  }

  /**
   * Promise 폴리필
   */
  async loadPromisePolyfill() {
    if (this.loadedPolyfills.has('promise')) return;

    // 간단한 Promise 구현
    if (!window.Promise) {
      window.Promise = class Promise {
        constructor(executor) {
          this.state = 'pending';
          this.value = undefined;
          this.handlers = [];

          const resolve = value => {
            if (this.state === 'pending') {
              this.state = 'fulfilled';
              this.value = value;
              this.handlers.forEach(handler => handler.onFulfilled(value));
            }
          };

          const reject = reason => {
            if (this.state === 'pending') {
              this.state = 'rejected';
              this.value = reason;
              this.handlers.forEach(handler => handler.onRejected(reason));
            }
          };

          try {
            executor(resolve, reject);
          } catch (error) {
            reject(error);
          }
        }

        then(onFulfilled, onRejected) {
          return new Promise((resolve, reject) => {
            const handler = {
              onFulfilled: value => {
                try {
                  const result = onFulfilled ? onFulfilled(value) : value;
                  resolve(result);
                } catch (error) {
                  reject(error);
                }
              },
              onRejected: reason => {
                try {
                  const result = onRejected ? onRejected(reason) : Promise.reject(reason);
                  resolve(result);
                } catch (error) {
                  reject(error);
                }
              },
            };

            if (this.state === 'fulfilled') {
              setTimeout(() => handler.onFulfilled(this.value), 0);
            } else if (this.state === 'rejected') {
              setTimeout(() => handler.onRejected(this.value), 0);
            } else {
              this.handlers.push(handler);
            }
          });
        }

        catch(onRejected) {
          return this.then(null, onRejected);
        }

        static resolve(value) {
          return new Promise(resolve => resolve(value));
        }

        static reject(reason) {
          return new Promise((_, reject) => reject(reason));
        }

        static all(promises) {
          return new Promise((resolve, reject) => {
            if (promises.length === 0) {
              resolve([]);
              return;
            }

            const results = new Array(promises.length);
            let completed = 0;

            promises.forEach((promise, index) => {
              Promise.resolve(promise).then(value => {
                results[index] = value;
                completed++;
                if (completed === promises.length) {
                  resolve(results);
                }
              }, reject);
            });
          });
        }
      };
    }

    this.loadedPolyfills.add('promise');
  }

  /**
   * Fetch 폴리필
   */
  async loadFetchPolyfill() {
    if (this.loadedPolyfills.has('fetch')) return;

    if (!window.fetch) {
      window.fetch = function (url, options = {}) {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open(options.method || 'GET', url);

          // 헤더 설정
          if (options.headers) {
            Object.keys(options.headers).forEach(key => {
              xhr.setRequestHeader(key, options.headers[key]);
            });
          }

          xhr.onload = function () {
            const response = {
              status: xhr.status,
              statusText: xhr.statusText,
              ok: xhr.status >= 200 && xhr.status < 300,
              headers: new Map(),
              text: () => Promise.resolve(xhr.responseText),
              json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            };
            resolve(response);
          };

          xhr.onerror = function () {
            reject(new Error('Network error'));
          };

          xhr.send(options.body || null);
        });
      };
    }

    this.loadedPolyfills.add('fetch');
  }

  /**
   * Optional Chaining 폴리필 (Babel 변환 대신 런타임 지원)
   */
  async loadOptionalChainingPolyfill() {
    if (this.loadedPolyfills.has('optionalChaining')) return;

    // 헬퍼 함수 제공
    window._optionalChain = function (obj, path) {
      const keys = path.split('.');
      let current = obj;

      for (const key of keys) {
        if (current == null) return undefined;
        current = current[key];
      }

      return current;
    };

    // Nullish Coalescing 헬퍼
    window._nullishCoalescing = function (left, right) {
      return left != null ? left : right;
    };

    this.loadedPolyfills.add('optionalChaining');
  }

  /**
   * IntersectionObserver 폴리필
   */
  async loadIntersectionObserverPolyfill() {
    if (this.loadedPolyfills.has('intersectionObserver')) return;

    if (!window.IntersectionObserver) {
      // 간단한 IntersectionObserver 구현
      window.IntersectionObserver = class IntersectionObserver {
        constructor(callback, options = {}) {
          this.callback = callback;
          this.options = options;
          this.targets = [];
        }

        observe(target) {
          if (this.targets.indexOf(target) === -1) {
            this.targets.push(target);
            this.checkIntersection(target);
          }
        }

        unobserve(target) {
          const index = this.targets.indexOf(target);
          if (index !== -1) {
            this.targets.splice(index, 1);
          }
        }

        disconnect() {
          this.targets = [];
        }

        checkIntersection(target) {
          // 간단한 viewport 교차 검사
          const rect = target.getBoundingClientRect();
          const isIntersecting = rect.top < window.innerHeight && rect.bottom > 0;

          const entry = {
            target: target,
            isIntersecting: isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: rect,
          };

          this.callback([entry], this);
        }
      };
    }

    this.loadedPolyfills.add('intersectionObserver');
  }

  /**
   * ResizeObserver 폴리필
   */
  async loadResizeObserverPolyfill() {
    if (this.loadedPolyfills.has('resizeObserver')) return;

    if (!window.ResizeObserver) {
      window.ResizeObserver = class ResizeObserver {
        constructor(callback) {
          this.callback = callback;
          this.targets = [];
          this.resizeHandler = this.handleResize.bind(this);
        }

        observe(target) {
          if (this.targets.indexOf(target) === -1) {
            this.targets.push(target);
            if (this.targets.length === 1) {
              window.addEventListener('resize', this.resizeHandler);
            }
          }
        }

        unobserve(target) {
          const index = this.targets.indexOf(target);
          if (index !== -1) {
            this.targets.splice(index, 1);
            if (this.targets.length === 0) {
              window.removeEventListener('resize', this.resizeHandler);
            }
          }
        }

        disconnect() {
          this.targets = [];
          window.removeEventListener('resize', this.resizeHandler);
        }

        handleResize() {
          const entries = this.targets.map(target => ({
            target: target,
            contentRect: target.getBoundingClientRect(),
          }));

          this.callback(entries, this);
        }
      };
    }

    this.loadedPolyfills.add('resizeObserver');
  }

  /**
   * Array 메서드 폴리필
   */
  async loadArrayPolyfills() {
    if (this.loadedPolyfills.has('array')) return;

    // Array.from (IE)
    if (!Array.from) {
      Array.from = function (arrayLike, mapFn, thisArg) {
        const result = [];
        for (let i = 0; i < arrayLike.length; i++) {
          const value = mapFn ? mapFn.call(thisArg, arrayLike[i], i) : arrayLike[i];
          result.push(value);
        }
        return result;
      };
    }

    // Array.includes (IE)
    if (!Array.prototype.includes) {
      Array.prototype.includes = function (searchElement, fromIndex) {
        return this.indexOf(searchElement, fromIndex) !== -1;
      };
    }

    // Array.find (IE)
    if (!Array.prototype.find) {
      Array.prototype.find = function (predicate, thisArg) {
        for (let i = 0; i < this.length; i++) {
          if (predicate.call(thisArg, this[i], i, this)) {
            return this[i];
          }
        }
        return undefined;
      };
    }

    // Array.findIndex (IE)
    if (!Array.prototype.findIndex) {
      Array.prototype.findIndex = function (predicate, thisArg) {
        for (let i = 0; i < this.length; i++) {
          if (predicate.call(thisArg, this[i], i, this)) {
            return i;
          }
        }
        return -1;
      };
    }

    this.loadedPolyfills.add('array');
  }

  /**
   * Object 메서드 폴리필
   */
  async loadObjectPolyfills() {
    if (this.loadedPolyfills.has('object')) return;

    // Object.assign (IE)
    if (!Object.assign) {
      Object.assign = function (target) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }

        const to = Object(target);
        for (let i = 1; i < arguments.length; i++) {
          const nextSource = arguments[i];
          if (nextSource != null) {
            for (const key in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, key)) {
                to[key] = nextSource[key];
              }
            }
          }
        }
        return to;
      };
    }

    // Object.entries (IE)
    if (!Object.entries) {
      Object.entries = function (obj) {
        const entries = [];
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            entries.push([key, obj[key]]);
          }
        }
        return entries;
      };
    }

    // Object.values (IE)
    if (!Object.values) {
      Object.values = function (obj) {
        const values = [];
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            values.push(obj[key]);
          }
        }
        return values;
      };
    }

    this.loadedPolyfills.add('object');
  }

  /**
   * String 메서드 폴리필
   */
  async loadStringPolyfills() {
    if (this.loadedPolyfills.has('string')) return;

    // String.prototype.includes (IE)
    if (!String.prototype.includes) {
      String.prototype.includes = function (search, start) {
        return this.indexOf(search, start) !== -1;
      };
    }

    // String.prototype.startsWith (IE)
    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function (search, pos) {
        return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
      };
    }

    // String.prototype.endsWith (IE)
    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function (search, thisLen) {
        if (thisLen === undefined || thisLen > this.length) {
          thisLen = this.length;
        }
        return this.substring(thisLen - search.length, thisLen) === search;
      };
    }

    this.loadedPolyfills.add('string');
  }

  /**
   * CSS Custom Properties 폴리필
   */
  async loadCSSCustomPropertiesPolyfill() {
    if (this.loadedPolyfills.has('cssCustomProperties')) return;

    // IE용 CSS 변수 시뮬레이션
    if (!this.supportsCSSCustomProperties()) {
      // CSS 변수 값들을 JavaScript로 관리
      window.CSSCustomProperties = {
        values: {},

        setProperty(name, value) {
          this.values[name] = value;
          this.updateElements();
        },

        getProperty(name) {
          return this.values[name];
        },

        updateElements() {
          // 실제로는 모든 CSS를 파싱하고 var() 함수를 치환해야 함
          // 여기서는 간단한 구현만 제공
          console.log('CSS Custom Properties updated:', this.values);
        },
      };
    }

    this.loadedPolyfills.add('cssCustomProperties');
  }

  /**
   * 기능 지원 검사 헬퍼들
   */
  supportsOptionalChaining() {
    try {
      eval('const test = {}; test?.property;');
      return true;
    } catch (e) {
      return false;
    }
  }

  supportsCSSCustomProperties() {
    return window.CSS && window.CSS.supports && window.CSS.supports('color', 'var(--test)');
  }

  /**
   * 폴리필 상태 확인
   */
  getLoadedPolyfills() {
    return Array.from(this.loadedPolyfills);
  }
}

// 전역 폴리필 로더 인스턴스
const polyfillLoader = new PolyfillLoader();

// 자동 로드 (페이지 로드 시)
if (typeof window !== 'undefined') {
  // DOM이 준비되면 필수 폴리필들을 로드
  const loadPolyfills = () => {
    polyfillLoader
      .loadEssentialPolyfills()
      .then(() => {
        console.log('✅ Polyfills loaded successfully');

        // 폴리필 로드 완료 이벤트 발생
        if (typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('polyfillsReady', {
              detail: { loaded: polyfillLoader.getLoadedPolyfills() },
            })
          );
        }
      })
      .catch(error => {
        console.error('❌ Error loading polyfills:', error);
      });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPolyfills);
  } else {
    loadPolyfills();
  }
}

export default PolyfillLoader;
export { polyfillLoader };
