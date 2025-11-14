// Monaco loader initializer with verbose logging.
// Ensures loader is configured/initialized exactly once on the client.

let ensureCallCount = 0;

export function ensureMonaco() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  ensureCallCount += 1;
  const callId = ensureCallCount;
  const startedAt = Date.now();

  try {
    const hasExisting = !!window.__monacoEnsured;
    // Helpful debug for \"loader not initialized\" 문제 추적용
    // (호출 횟수, 기존 초기화 여부, require/loader 존재 여부 등)
    // eslint-disable-next-line no-console
    console.debug('[monaco] ensureMonaco()', {
      callId,
      hasExisting,
      hasRequire: typeof window.require === 'function',
      hasLoaderConfigured: !!window.__monacoLoaderConfigured,
    });

    if (hasExisting) {
      return window.__monacoEnsured;
    }

    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const { loader } = require('@monaco-editor/react');
    const vsBase =
      process.env.NEXT_PUBLIC_MONACO_VS_BASE || '/_next/static/monaco/vs';

    if (!window.__monacoLoaderConfigured) {
      // eslint-disable-next-line no-console
      console.info('[monaco] configuring loader', { vsBase, callId });
      loader.config({ paths: { vs: vsBase } });
      window.__monacoLoaderConfigured = true;
    }

    const initPromise = loader
      .init()
      .then((instance) => {
        // eslint-disable-next-line no-console
        console.info('[monaco] loader.init ok', {
          callId,
          elapsedMs: Date.now() - startedAt,
          hasEditor: !!instance?.editor,
        });
        return instance;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[monaco] loader.init failed', {
          callId,
          elapsedMs: Date.now() - startedAt,
          message: err?.message,
          stack: err?.stack,
        });
        throw err;
      });

    window.__monacoEnsured = initPromise;
    return initPromise;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[monaco] ensureMonaco threw synchronously', {
      callId,
      elapsedMs: Date.now() - startedAt,
      message: err?.message,
      stack: err?.stack,
    });
    return Promise.resolve();
  }
}

