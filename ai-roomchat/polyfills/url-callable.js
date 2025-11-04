// Ensures global URL can be called without `new` in both SSR and browser.
// Some libraries accidentally call URL(...) which throws on Node/SSR.
(() => {
  try {
    const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof self !== 'undefined' ? self : window);
    if (!g) return;
    const NativeURL = g.URL;
    if (!NativeURL || typeof NativeURL !== 'function') return;
    let needsWrap = true;
    if (!needsWrap) return;
    let __loggedCount = 0;
    const URLWrapper = function URLWrapper(u, b) {
      if (!new.target) {
        try {
          if (__loggedCount < 5) {
            __loggedCount++;
            const err = new Error('[URL-wrapper] URL called without new (browser/global)');
            console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
          }
        } catch {}
      }
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
