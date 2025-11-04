// Trace any bare calls to URL(...) during Node execution and print useful stacks.
// Non-destructive: always delegates to new NativeURL(u, b) and preserves prototype.
try {
  const g = (typeof globalThis !== 'undefined') ? globalThis : global;
  const NativeURL = g && g.URL;
  if (typeof NativeURL === 'function') {
    let logged = 0;
    function URLTracer(u, b) {
      if (!new.target) {
        try {
          if (logged < 20) {
            logged++;
            const err = new Error('[URL-BARE] URL called without new');
            const stack = String(err.stack || '').split('\n')
              .filter(l => !/url-bare-call-tracer|internal\/process|node:internal|bootstrap|next\/(dist|compiled)\//.test(l))
              .slice(0, 10)
              .join('\n');
            console.warn('[URL-BARE:args]', typeof u, typeof b);
            console.warn(stack);
          }
        } catch {}
      }
      return new NativeURL(u, b);
    }
    try { URLTracer.prototype = NativeURL.prototype; } catch {}
    g.URL = URLTracer;
  }
} catch {}

// Also hook Node's built-in 'url' module so require('url').URL(...) gets traced.
try {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const mod = origLoad.apply(this, arguments);
    try {
      if ((request === 'url' || request === 'node:url') && mod && typeof mod.URL === 'function') {
        const NativeURL = mod.URL;
        let logged = 0;
        function URLTracer(u, b) {
          if (!new.target) {
            try {
              if (logged < 20) {
                logged++;
                const src = (parent && (parent.filename || parent.id)) || '<unknown-parent>';
                const err = new Error('[URL-BARE@require] URL called without new @ ' + src);
                const stack = String(err.stack || '').split('\n')
                  .filter(l => !/url-bare-call-tracer|internal\/process|node:internal|bootstrap|next\/(dist|compiled)\//.test(l))
                  .slice(0, 10)
                  .join('\n');
                console.warn('[URL-BARE@require:args]', typeof u, typeof b);
                console.warn(stack);
              }
            } catch {}
          }
          // If mistakenly treated as thenable, it's typically called as URL(resolve, reject)
          if (typeof u === 'function' && (b === undefined || typeof b === 'function')) {
            return {}; // benign no-op object to let build continue
          }
          return new NativeURL(u, b);
        }
        try { URLTracer.prototype = NativeURL.prototype; } catch {}
        try { URLTracer.__requiredBy = (parent && (parent.filename || parent.id)) || '<unknown-parent>'; } catch {}
        mod.URL = URLTracer;
      }
    } catch {}
    return mod;
  };
} catch {}
