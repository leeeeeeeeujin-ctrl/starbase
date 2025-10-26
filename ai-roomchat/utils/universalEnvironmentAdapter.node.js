/**
 * UniversalEnvironmentAdapter - Node (server) implementation
 * This contains Node-specific features (fs, path, crypto, node-fetch/cross-fetch) and
 * should only be imported from server-only code (API routes, server components).
 */

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

import crossFetch from 'cross-fetch';

export class UniversalEnvironmentAdapter {
  constructor() {
    this.environment = this.detectEnvironment();
    this.features = this.detectFeatures();
    this.globals = this.setupGlobals();
  }

  detectEnvironment() {
    if (isNode) {
      return { type: 'node', version: process.version, platform: process.platform, isSSR: true, supportsModules: true };
    }
    return { type: 'unknown', isSSR: false, supportsModules: false };
  }

  detectFeatures() {
    const features = {
      fetch: true,
      localStorage: false,
      sessionStorage: false,
      indexedDB: false,
      webSocket: false,
      worker: false,
      serviceWorker: false,
      filesystem: true,
      crypto: true,
    };
    return features;
  }

  setupGlobals() {
    const globals = {};
    if (isNode) {
      // Require Node built-ins lazily
      globals.fs = require('fs');
      globals.path = require('path');
      globals.crypto = require('crypto');
      globals.fetch = crossFetch;
      // lightweight in-memory storage for server-side usage
      globals.localStorage = new Map();
      globals.sessionStorage = new Map();
    }
    return globals;
  }

  getConfig() {
    return {
      environment: this.environment,
      features: this.features,
      storage: { type: 'memory', persistent: false },
      network: { timeout: 30000, retries: 3 },
    };
  }

  getStorage() {
    return {
      get: key => this.globals.localStorage.get(key) || null,
      set: (key, value) => { this.globals.localStorage.set(key, value); return true; },
      remove: key => { return this.globals.localStorage.delete(key); },
      clear: () => { this.globals.localStorage.clear(); return true; },
    };
  }

  getNetwork() {
    return { fetch: this.globals.fetch, request: (url, opts) => this.globals.fetch(url, opts) };
  }

  getEnvironmentInfo() {
    return { type: this.environment.type, isNode: isNode, version: process.version };
  }
}

// Lazy-instantiated adapter to avoid running Node-only setup at module-eval time.
let _universalAdapterInstance = null;
function _createInstance() {
  if (_universalAdapterInstance) return _universalAdapterInstance;
  if (!isNode) {
    // Running in a non-Node environment (Edge / Browser build). Return a safe stub
    // so callers can still query a few properties without triggering Node built-ins.
    _universalAdapterInstance = {
      getEnvironmentInfo: () => ({ type: 'edge-or-browser', isNode: false, version: null }),
      getConfig: () => ({ environment: { type: 'edge-or-browser', isNode: false }, features: {}, storage: { type: 'none' } }),
      getStorage: () => ({ get: () => null, set: () => false, remove: () => false, clear: () => false }),
      getNetwork: () => ({ fetch: (url, opts) => { throw new Error('universalAdapter: network fetch is not available in this environment'); } }),
    };
    return _universalAdapterInstance;
  }

  // Safe to construct the real adapter on Node.
  _universalAdapterInstance = new UniversalEnvironmentAdapter();
  return _universalAdapterInstance;
}

// A small proxy that defers instance creation until a property is accessed.
const universalAdapter = new Proxy({}, {
  get(_target, prop) {
    const inst = _createInstance();
    const v = inst[prop];
    if (typeof v === 'function') return v.bind(inst);
    return v;
  },
  has(_target, prop) {
    return prop in _createInstance();
  },
  ownKeys() {
    return Reflect.ownKeys(_createInstance());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(_createInstance(), prop) || { configurable: true, enumerable: true, value: undefined };
  }
});

export { universalAdapter };
export const isNodeEnvironment = () => isNode;
export const isBrowserEnvironment = () => !isNode;
export default universalAdapter;
