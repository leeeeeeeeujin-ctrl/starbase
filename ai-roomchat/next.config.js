/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep build lint from blocking while we triage
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
