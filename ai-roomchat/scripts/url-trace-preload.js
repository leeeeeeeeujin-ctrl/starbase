// Preload script to trace any bare calls to global URL() or require('url').URL()
// without altering behavior for `new URL(...)`.
// It logs a stack and rethrows a clear error when URL is invoked as a function.

(() => {
  try {
    const g = globalThis;
    const NativeURL = g.URL;
    if (!NativeURL || NativeURL.__urlTraceWrapped) return;

    function URLWrapper(...args) {
      // Called as constructor: behave exactly like native
      if (new.target) {
        return Reflect.construct(NativeURL, args);
      }
      // Called as a function: log and fail fast with a better stack
      const err = new Error(
        "Bare URL() call detected. Use 'new URL(input, base)'."
      );
      // Tag to help filter in logs
      err.name = 'BareURLInvocation';
      // eslint-disable-next-line no-console
      console.error('[URL TRACE] Bare URL() called with args:', args);
      // eslint-disable-next-line no-console
      console.error('[URL TRACE] Stack:', err.stack);
      throw err;
    }
    try { URLWrapper.prototype = NativeURL.prototype; } catch {}
    // Mark and replace global
    Object.defineProperty(URLWrapper, '__urlTraceWrapped', { value: true });
    Object.defineProperty(URLWrapper, 'name', { value: 'URL' });
    g.URL = URLWrapper;

    // Also wrap require('url').URL if present
    try {
      const urlMod = require('url');
      if (urlMod && urlMod.URL && !urlMod.URL.__urlTraceWrapped) {
        Object.defineProperty(URLWrapper, '__urlTraceWrapped', { value: true });
        urlMod.URL = URLWrapper;
      }
    } catch {}
  } catch {}
})();
