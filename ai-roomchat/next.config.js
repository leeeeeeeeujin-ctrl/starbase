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
    function URLWrapper(u, b) { return new NU(u, b); }
    try { URLWrapper.prototype = NU.prototype; } catch {}
    try { if (NU.createObjectURL) URLWrapper.createObjectURL = NU.createObjectURL.bind(NU); } catch {}
    try { if (NU.revokeObjectURL) URLWrapper.revokeObjectURL = NU.revokeObjectURL.bind(NU); } catch {}
    g.URL = URLWrapper;
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
