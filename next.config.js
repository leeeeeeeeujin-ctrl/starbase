/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.plugins.push(new webpack.DefinePlugin({ extensionsOpen: 'globalThis.__EXT_OPEN__' }));
    return config;
  },
};

module.exports = nextConfig;
