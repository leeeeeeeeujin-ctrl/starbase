/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Replace any free identifier `extensionsOpen` with a safe global accessor.
    // This prevents ReferenceError at runtime if legacy code still references it.
    config.plugins.push(
      new webpack.DefinePlugin({
        extensionsOpen: 'globalThis.__EXT_OPEN__',
      })
    );
    return config;
  },
};

module.exports = nextConfig;

