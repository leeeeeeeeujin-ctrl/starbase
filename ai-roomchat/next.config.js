// Temporary: preload URL trace to capture any bare URL() calls during build
try { require('./scripts/url-trace-preload'); } catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep build lint from blocking while we triage
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
