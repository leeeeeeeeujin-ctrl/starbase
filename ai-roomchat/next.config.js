const path = require('path');
const webpack = require('webpack');

// Guard URL at build-time Node context as well (Next loads this file first)
(() => {
  try {
    const g = global;
    const NU = g && g.URL;
    if (!NU || typeof NU !== 'function') return;
    let needsWrap = false;
    try { NU('http://example.com'); needsWrap = true; } catch { needsWrap = true; }
    if (!needsWrap) return;
    let __logged = 0;
    function URLWrapper(u, b) {
      if (!new.target) {
        try {
          if (__logged < 5) {
            __logged++;
            const err = new Error('[URL-wrapper] URL called without new (next.config)');
            // keep stack short
            console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
          }
        } catch {}
      }
      return new NU(u, b);
    }
    try { URLWrapper.prototype = NU.prototype; } catch {}
    try { if (NU.createObjectURL) URLWrapper.createObjectURL = NU.createObjectURL.bind(NU); } catch {}
    try { if (NU.revokeObjectURL) URLWrapper.revokeObjectURL = NU.revokeObjectURL.bind(NU); } catch {}
    g.URL = URLWrapper;
  } catch {}
})();

// Intercept Node's require('url') very early to wrap URL for any loader that uses it during build
(() => {
  try {
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      const mod = origLoad.apply(this, arguments);
      if (request === 'url' || request === 'node:url') {
        try {
          if (mod && mod.URL && typeof mod.URL === 'function' && !mod.URL.__wrappedForNoNew) {
            const NativeURL = mod.URL;
            let __logged = 0;
            function URLWrapper(u, b) {
              if (!new.target) {
                try {
                  if (__logged < 5) {
                    __logged++;
                    const err = new Error('[URL-wrapper] URL called without new (require-hook)');
                    console.warn(err.stack.split('\n').slice(0, 6).join('\n'));
                  }
                } catch {}
              }
              return new NativeURL(u, b);
            }
            try { URLWrapper.prototype = NativeURL.prototype; } catch {}
            URLWrapper.__wrappedForNoNew = true;
            mod.URL = URLWrapper;
          }
        } catch {}
      }
      return mod;
    };
  } catch {}
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Avoid build failures due to outdated options; CI can run lint separately
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    const originalEntry = config.entry;
    config.entry = async () => {
      const entries = await originalEntry();
      const polyfill = './polyfills/url-callable.js';
      const maybeInject = (key) => {
        if (entries[key]) {
          const arr = Array.isArray(entries[key]) ? entries[key] : [entries[key]];
          if (!arr.includes(polyfill)) {
            entries[key] = [polyfill, ...arr];
          }
        }
      };
      Object.keys(entries).forEach(maybeInject);
      return entries;
    };

    // Provide a safe URL wrapper for any bare `URL(...)` references at build/SSR time
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.ProvidePlugin({
        URL: path.resolve(__dirname, 'polyfills/url-wrapper.js'),
      })
    );

    // Prepend a tiny banner to every chunk to ensure global URL is callable early
    const banner = `(()=>{try{var g=(typeof globalThis!=='undefined')?globalThis:(typeof self!=='undefined'?self:window);if(!g)return;var NU=g.URL;if(!NU||typeof NU!=='function')return;var wrap=function(u,b){return new NU(u,b)};try{wrap.prototype=NU.prototype;}catch(e){};try{if(NU.createObjectURL)wrap.createObjectURL=NU.createObjectURL.bind(NU);}catch(e){};try{if(NU.revokeObjectURL)wrap.revokeObjectURL=NU.revokeObjectURL.bind(NU);}catch(e){};g.URL=wrap;}catch(e){}})();`;
    config.plugins.push(new webpack.BannerPlugin({ banner, raw: true, entryOnly: false }));

    // Alias Node's url module to a shim that relaxes URL(...) calls
    config.resolve = config.resolve || {};
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
      'url': path.resolve(__dirname, 'polyfills/url-shim-for-node.js'),
      'node:url': path.resolve(__dirname, 'polyfills/url-shim-for-node.js'),
    });

    return config;
  },
};

module.exports = nextConfig;
