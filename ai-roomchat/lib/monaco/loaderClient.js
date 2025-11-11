"use client";

import loader from '@monaco-editor/loader';

const CDN_PATH = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
const envBase = process.env.NEXT_PUBLIC_MONACO_BASE_URL?.trim();
const MONACO_BASE = envBase && envBase.length > 0 ? envBase : CDN_PATH;
const NORMALIZED_CDN_BASE = normalizeBasePath(CDN_PATH);

const monacoState = {
  status: 'pending', // 'pending' | 'ready' | 'error'
  error: null,
  instance: null,
  promise: null,
  lastBase: null,
};

function stripTrailingSlash(value) {
  return value ? value.replace(/\/+$/, '') : '';
}

function normalizeBasePath(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    return stripTrailingSlash(raw);
  }
  if (raw.startsWith('//')) {
    const protocol =
      typeof window !== 'undefined' && window.location?.protocol
        ? window.location.protocol
        : 'https:';
    return stripTrailingSlash(`${protocol}${raw}`);
  }
  if (typeof window !== 'undefined') {
    if (raw.startsWith('/')) {
      const origin = window.location?.origin || '';
      return stripTrailingSlash(`${origin}${raw}`);
    }
    return stripTrailingSlash(raw);
  }
  return stripTrailingSlash(raw);
}

function resolvePreferredBase() {
  if (typeof window !== 'undefined') {
    const envBaseUrl =
      window.MonacoEnvironment && typeof window.MonacoEnvironment.baseUrl === 'string'
        ? window.MonacoEnvironment.baseUrl
        : null;
    if (envBaseUrl) {
      return envBaseUrl;
    }
    if (typeof window.__MONACO_BASE_URL__ === 'string' && window.__MONACO_BASE_URL__.length) {
      return window.__MONACO_BASE_URL__;
    }
  }
  return MONACO_BASE;
}

function configureLoader(basePath) {
  if (!loader || typeof loader.config !== 'function') return;
  const normalized = normalizeBasePath(basePath) || NORMALIZED_CDN_BASE;
  if (monacoState.lastBase === normalized) return;
  loader.config({ paths: { vs: normalized } });
  monacoState.lastBase = normalized;
  if (typeof window !== 'undefined') {
    window.__MONACO_BASE_URL__ = normalized;
    if (window.MonacoEnvironment) {
      window.MonacoEnvironment.baseUrl = normalized;
    }
  }
}

async function initWithBase(basePath) {
  const normalized = normalizeBasePath(basePath) || NORMALIZED_CDN_BASE;
  configureLoader(normalized);
  const monaco = await loader.init();
  if (!monaco || !monaco.editor) {
    const err = new Error('Monaco not available');
    err.code = 'monaco_unavailable';
    throw err;
  }
  return monaco;
}

export function getMonacoLoaderState() {
  return monacoState;
}

export async function initMonaco() {
  if (monacoState.instance) {
    monacoState.status = 'ready';
    return monacoState.instance;
  }
  if (monacoState.promise) {
    return monacoState.promise;
  }

  monacoState.promise = (async () => {
    const preferredBase = normalizeBasePath(resolvePreferredBase()) || NORMALIZED_CDN_BASE;
    try {
      const monaco = await initWithBase(preferredBase);
      monacoState.instance = monaco;
      monacoState.status = 'ready';
      monacoState.error = null;
      return monaco;
    } catch (error) {
      if (preferredBase !== NORMALIZED_CDN_BASE) {
        try {
          const fallbackMonaco = await initWithBase(NORMALIZED_CDN_BASE);
          monacoState.instance = fallbackMonaco;
          monacoState.status = 'ready';
          monacoState.error = null;
          return fallbackMonaco;
        } catch (cdnError) {
          monacoState.status = 'error';
          monacoState.error = cdnError;
          throw cdnError;
        }
      }
      monacoState.status = 'error';
      monacoState.error = error;
      throw error;
    }
  })().finally(() => {
    monacoState.promise = null;
  });

  return monacoState.promise;
}
