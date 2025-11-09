/**
 * UniversalEnvironmentAdapter - Browser-only implementation
 * This file contains a lightweight adapter safe to bundle into client code.
 */

// 환경 감지 (브라우저에 초점)
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export class UniversalEnvironmentAdapter {
  constructor() {
    this.environment = this.detectEnvironment();
    this.features = this.detectFeatures();
    this.globals = this.setupGlobals();
  }

  detectEnvironment() {
    if (isBrowser) {
      return {
        type: 'browser',
        userAgent: navigator.userAgent,
        isSSR: false,
        supportsModules: true,
      };
    }
    return { type: 'unknown', isSSR: false, supportsModules: false };
  }

  detectFeatures() {
    const features = {
      fetch: typeof fetch !== 'undefined',
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      webSocket: typeof WebSocket !== 'undefined',
      worker: typeof Worker !== 'undefined',
      serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      filesystem: false,
      crypto: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
    };
    return features;
  }

  setupGlobals() {
    const globals = {};
    if (isBrowser) {
      globals.fetch = window.fetch?.bind(window) || null;
      globals.localStorage = window.localStorage || null;
      globals.sessionStorage = window.sessionStorage || null;
      globals.crypto = window.crypto || null;
    }
    return globals;
  }

  getConfig() {
    return {
      environment: this.environment,
      features: this.features,
      storage: {
        type: this.features.localStorage ? 'localStorage' : 'memory',
        persistent: !!this.features.localStorage,
      },
      network: { timeout: 15000, retries: 2 },
    };
  }

  getStorage() {
    return {
      get: key => this.globals.localStorage?.getItem(key) || null,
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

  getNetwork() {
    return {
      fetch: this.globals.fetch,
      request: async (url, options = {}) => {
        if (!this.globals.fetch) throw new Error('fetch not available');
        const cfg = this.getConfig();
        const merged = { timeout: cfg.network.timeout, ...options };
        return this.globals.fetch(url, merged);
      },
    };
  }

  getEnvironmentInfo() {
    return {
      type: this.environment.type,
      isBrowser: isBrowser,
      features: this.features,
      userAgent: isBrowser ? navigator.userAgent : 'unknown',
    };
  }
}

export const universalAdapter = new UniversalEnvironmentAdapter();
export const isNodeEnvironment = () => false;
export const isBrowserEnvironment = () => isBrowser;
export default universalAdapter;
