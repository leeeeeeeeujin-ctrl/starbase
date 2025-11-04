const path = require('path');
const URLDebugPlugin = require('./tools/webpack/url-debug-plugin');
const ScanBareURLCallsPlugin = require('./tools/webpack/scan-bare-url-plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer, webpack }) => {
    // Verbose infra logging to surface module-level errors
    config.infrastructureLogging = config.infrastructureLogging || {};
    config.infrastructureLogging.level = 'verbose';

    // Attach error trace plugin (server and client builds)
    config.plugins = config.plugins || [];
    config.plugins.push(new URLDebugPlugin());
    config.plugins.push(new ScanBareURLCallsPlugin({ onlyProject: false, maxLogs: 120 }));

    // Alias Node's 'url' to a safe shim so any `require('url').URL(...)` tolerates bare calls
    config.resolve = config.resolve || {};
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
      url: require('path').resolve(__dirname, 'polyfills/url-shim-for-node.js'),
      'node:url': require('path').resolve(__dirname, 'polyfills/url-shim-for-node.js'),
    });

    return config;
  },
};

module.exports = nextConfig;
