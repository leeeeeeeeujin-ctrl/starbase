"use client";

import loader from '@monaco-editor/loader';

const CDN_PATH = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
const LOCAL_PATH =
  process.env.NEXT_PUBLIC_MONACO_BASE_URL && process.env.NEXT_PUBLIC_MONACO_BASE_URL.trim().length > 0
    ? process.env.NEXT_PUBLIC_MONACO_BASE_URL.trim()
    : '/monaco/vs';

const monacoState = {
  status: 'pending', // 'pending' | 'ready' | 'error'
  error: null,
  instance: null,
  promise: null,
  lastBase: null,
};

function resolvePreferredBase() {
  if (typeof window !== 'undefined') {
    return window.__MONACO_BASE_URL__ || LOCAL_PATH;
  }
  return LOCAL_PATH;
}

function configureLoader(basePath) {
  if (typeof window === 'undefined' || !loader || typeof loader.config !== 'function') return;
  if (monacoState.lastBase === basePath) return;
  loader.config({ paths: { vs: basePath } });
  monacoState.lastBase = basePath;
  if (typeof window !== 'undefined') {
    window.__MONACO_BASE_URL__ = basePath;
  }
}

async function initWithBase(basePath) {
  configureLoader(basePath);
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
    const preferredBase = resolvePreferredBase();
    try {
      const monaco = await initWithBase(preferredBase);
      monacoState.instance = monaco;
      monacoState.status = 'ready';
      monacoState.error = null;
      return monaco;
    } catch (error) {
      if (preferredBase !== CDN_PATH) {
        try {
          const fallbackMonaco = await initWithBase(CDN_PATH);
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
