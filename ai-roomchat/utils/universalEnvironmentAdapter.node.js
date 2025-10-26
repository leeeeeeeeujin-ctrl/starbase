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

export const universalAdapter = new UniversalEnvironmentAdapter();
export const isNodeEnvironment = () => isNode;
export const isBrowserEnvironment = () => false;
export default universalAdapter;
