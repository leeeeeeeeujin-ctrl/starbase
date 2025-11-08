/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Strict Mode to avoid double-invocation of effects/handlers in dev
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: true,
  // NOTE: Removed output:'export' because SSR pages (gSSP) are present; mobile build uses remote server.url.
  async rewrites() {
    return [
      // Health check alias for probes hitting /health
      { source: '/health', destination: '/api/health' },
    ];
  },
};

module.exports = nextConfig;
