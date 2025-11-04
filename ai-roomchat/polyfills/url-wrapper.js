// A universal URL wrapper that works with or without `new` and preserves static methods.
const g = (typeof globalThis !== 'undefined') ? globalThis : (typeof self !== 'undefined' ? self : window);
const NativeURL = g && g.URL ? g.URL : undefined;

function URLWrapper(u, b) {
  if (!NativeURL || typeof NativeURL !== 'function') {
    throw new Error('URL is not available in this environment');
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

