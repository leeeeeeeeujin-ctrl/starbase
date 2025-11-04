const path = require('path');
const URLDebugPlugin = require('./tools/webpack/url-debug-plugin');

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

    return config;
  },
};

module.exports = nextConfig;
