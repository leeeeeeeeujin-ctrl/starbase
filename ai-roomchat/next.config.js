const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Fix workspace root inference when multiple lockfiles exist
  outputFileTracingRoot: path.resolve(__dirname),
};

module.exports = nextConfig;
