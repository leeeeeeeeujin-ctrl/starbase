/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: true,
  async rewrites() {
    return [
      // Health check alias for probes hitting /health
      { source: '/health', destination: '/api/health' },
    ];
  },
};

module.exports = nextConfig;
