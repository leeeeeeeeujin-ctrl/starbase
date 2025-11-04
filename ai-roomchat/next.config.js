const path = require('path');
// Load safe default envs so build doesn't depend on project secrets
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env.defaults'), override: false });
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Fix workspace root inference when multiple lockfiles exist
  outputFileTracingRoot: path.resolve(__dirname),
  // Emit a self-contained server output to ensure manifests are written
  output: 'standalone',
  // Reduce file-tracing surface: exclude large, unused trees from the server bundle graph
  outputFileTracingExcludes: {
    '*': [
      '**/docs/**',
      '**/reference_data/**',
      '**/__tests__/**',
      '**/repo-mirror.git/**',
      '**/.git/**',
    ],
  },
  webpack: (config, { webpack }) => {
    // Show build progress to identify where it stalls
    config.plugins = config.plugins || [];
    config.plugins.push(new webpack.ProgressPlugin());
    // Avoid long/minifier stalls while we stabilize Next 15
    if (config.optimization) {
      config.optimization.minimize = false;
    }
    // More verbose infra logs can help diagnose hangs
    config.infrastructureLogging = config.infrastructureLogging || {};
    config.infrastructureLogging.level = 'verbose';
    return config;
  },
};

module.exports = nextConfig;
