// Preload hook to make global URL callable without `new` as early as possible
// This file is loaded via Node `-r` before Next CLI and any plugins run.
try {
  const g = (typeof globalThis !== 'undefined') ? globalThis : global;
  const NativeURL = g && g.URL;
  if (NativeURL && typeof NativeURL === 'function') {
    let logged = 0;
    function URLWrapper(u, b) {
      if (!new.target) {
        try {
          if (logged < 5) {
            logged++;
            const err = new Error('[URL-wrapper:preload] URL called without new');
            // Keep stack compact for CI logs
            if (err.stack) console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
            try { console.warn('[URL-wrapper:preload] args:', typeof u, typeof b); } catch {}
          }
        } catch {}
      }
      // Log on failure to help locate culprit
      try { return new NativeURL(u, b); } catch (e) {
        try {
          console.warn('[URL-wrapper:preload] construction failed:', e && e.message);
          if (e && e.stack) console.warn(e.stack.split('\n').slice(0, 6).join('\n'));
        } catch {}
        throw e;
      }
    }
    try { URLWrapper.prototype = NativeURL.prototype; } catch {}
    try { if (NativeURL.createObjectURL) URLWrapper.createObjectURL = NativeURL.createObjectURL.bind(NativeURL); } catch {}
    try { if (NativeURL.revokeObjectURL) URLWrapper.revokeObjectURL = NativeURL.revokeObjectURL.bind(NativeURL); } catch {}
    g.URL = URLWrapper;
  }
} catch {}

// Hook Node's module loader to wrap URL exports from 'url', 'node:url' and Next's compiled native-url
try {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const mod = origLoad.apply(this, arguments);
    try {
      if (request === 'url' || request === 'node:url') {
        if (mod && mod.URL && typeof mod.URL === 'function' && !mod.URL.__wrappedBareCallable) {
          const NativeURL = mod.URL;
          function URLWrapper(u, b) {
            if (!new.target) {
              return new NativeURL(u, b);
            }
            return new NativeURL(u, b);
          }
          try { URLWrapper.prototype = NativeURL.prototype; } catch {}
          // Mark to avoid double-wrap
          URLWrapper.__wrappedBareCallable = true;
          mod.URL = URLWrapper;
        }
      }
    } catch {}
    return mod;
  };
} catch {}
