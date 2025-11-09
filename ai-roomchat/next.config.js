/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Unblock production builds while we stabilize lint across legacy/test snapshots.
  eslint: {
    ignoreDuringBuilds: true,
    // Limit lint scope locally if you still run `next lint`
    dirs: ['pages', 'components', 'lib', 'hooks', 'contexts', 'scripts'],
  },
};

module.exports = nextConfig;
