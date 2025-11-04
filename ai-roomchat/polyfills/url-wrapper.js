// A universal URL wrapper that works with or without `new` and preserves static methods.
const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof self !== 'undefined' ? self : window);
const NativeURL = g && g.URL ? g.URL : undefined;

let __loggedCount = 0;
function logBareCallOnce(kind) {
  try {
    if (__loggedCount >= 5) return; // cap noise
    __loggedCount++;
    const err = new Error('[URL-wrapper] URL called without new' + (kind ? ` (${kind})` : ''));
    // Show a compact stack; Next build logs will include this
    if (err && err.stack) {
      console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
    }
  } catch {}
}

function URLWrapper(u, b) {
  if (!NativeURL || typeof NativeURL !== 'function') {
    throw new Error('URL is not available in this environment');
  }
  if (!new.target) {
    logBareCallOnce('provide');
  }
  return new NativeURL(u, b);
}

if (NativeURL) {
  URLWrapper.prototype = NativeURL.prototype;
  try {
    if (typeof NativeURL.createObjectURL === 'function') {
      URLWrapper.createObjectURL = NativeURL.createObjectURL.bind(NativeURL);
    }
    if (typeof NativeURL.revokeObjectURL === 'function') {
      URLWrapper.revokeObjectURL = NativeURL.revokeObjectURL.bind(NativeURL);
    }
  } catch {}
}

module.exports = URLWrapper;
