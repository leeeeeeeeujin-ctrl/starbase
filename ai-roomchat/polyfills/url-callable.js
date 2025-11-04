// Ensures global URL can be called without `new` in both SSR and browser.
// Some libraries accidentally call URL(...) which throws on Node/SSR.
(() => {
  try {
    const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof self !== 'undefined' ? self : window);
    if (!g) return;
    const NativeURL = g.URL;
    if (!NativeURL || typeof NativeURL !== 'function') return;
    let needsWrap = false;
    try {
      // In Node, calling without new throws.
      // We attempt to call; if it throws, we will wrap.
      // eslint-disable-next-line no-new
      NativeURL('http://example.com');
      needsWrap = true;
    } catch (e) {
      needsWrap = true;
    }
    if (!needsWrap) return;
    const URLWrapper = function URLWrapper(u, b) {
      return new NativeURL(u, b);
    };
    URLWrapper.prototype = NativeURL.prototype;
    try {
      if (typeof NativeURL.createObjectURL === 'function') {
        URLWrapper.createObjectURL = NativeURL.createObjectURL.bind(NativeURL);
      }
      if (typeof NativeURL.revokeObjectURL === 'function') {
        URLWrapper.revokeObjectURL = NativeURL.revokeObjectURL.bind(NativeURL);
      }
    } catch {}
    g.URL = URLWrapper;
  } catch {}
})();

