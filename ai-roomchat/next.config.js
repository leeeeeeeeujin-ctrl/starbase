const path = require('path');
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
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

    return config;
  },
};

module.exports = nextConfig;
