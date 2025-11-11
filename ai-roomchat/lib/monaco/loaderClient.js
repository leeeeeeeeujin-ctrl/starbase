"use client";

const monacoState = {
  status: 'pending', // 'pending' | 'ready' | 'error'
  error: null,
  instance: null,
  promise: null,
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function resolveMonacoFromGlobal() {
  if (!isBrowser()) return null;
  const monaco = window.monaco || null;
  if (monaco && monaco.editor) {
    return monaco;
  }
  return null;
}

function resolveMonacoPromise() {
  if (!isBrowser()) {
    return Promise.reject(new Error('Monaco loader is browser-only'));
  }
  const immediate = resolveMonacoFromGlobal();
  if (immediate) {
    return Promise.resolve(immediate);
  }
  const externalPromise =
    window.__MONACO_INIT__ && typeof window.__MONACO_INIT__.then === 'function'
      ? window.__MONACO_INIT__
      : null;
  if (externalPromise) {
    return externalPromise.then(result => {
      if (result && result.editor) {
        return result;
      }
      const fallback = resolveMonacoFromGlobal();
      if (fallback) return fallback;
      throw new Error('Monaco not available');
    });
  }

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 280; // ~7 seconds
    const timer = setInterval(() => {
      attempts += 1;
      const monaco = resolveMonacoFromGlobal();
      if (monaco) {
        clearInterval(timer);
        resolve(monaco);
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        reject(new Error('Monaco loader not initialized'));
      }
    }, 25);
  });
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

  monacoState.promise = resolveMonacoPromise()
    .then(monaco => {
      monacoState.instance = monaco;
      monacoState.status = 'ready';
      monacoState.error = null;
      return monaco;
    })
    .catch(error => {
      monacoState.status = 'error';
      monacoState.error = error;
      throw error;
    })
    .finally(() => {
      monacoState.promise = null;
    });

  return monacoState.promise;
}
