// Minimal global URL wrapper to tolerate bare calls during Node build scripts
try {
  const g = (typeof globalThis !== 'undefined') ? globalThis : global;
  const NativeURL = g && g.URL;
  if (typeof NativeURL === 'function') {
    function URLWrapper(u, b) {
      return new NativeURL(u, b);
    }
    try { URLWrapper.prototype = NativeURL.prototype; } catch {}
    g.URL = URLWrapper;
  }
} catch {}

