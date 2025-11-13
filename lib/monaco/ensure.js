// Globally ensure Monaco loader is configured and initialized once.
// Uses @monaco-editor/react's loader and points to CDN by default.

export function ensureMonaco() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.__monacoEnsured) return window.__monacoEnsured;
  try {
    const { loader } = require('@monaco-editor/react');
    const vsBase =
      process.env.NEXT_PUBLIC_MONACO_VS_BASE ||
      'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';
    if (!window.__monacoLoaderConfigured) {
      loader.config({ paths: { vs: vsBase } });
      window.__monacoLoaderConfigured = true;
    }
    window.__monacoEnsured = loader.init();
    return window.__monacoEnsured;
  } catch (e) {
    console.warn('[monaco] ensureMonaco failed to init loader', e);
    return Promise.resolve();
  }
}

