/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    const originalEntry = config.entry;
    config.entry = async () => {
      const entries = await originalEntry();
      const polyfill = './polyfills/url-callable.js';
      const maybeInject = (key) => {
        if (entries[key]) {
          const arr = Array.isArray(entries[key]) ? entries[key] : [entries[key]];
          if (!arr.includes(polyfill)) {
            entries[key] = [polyfill, ...arr];
          }
        }
      };
      Object.keys(entries).forEach(maybeInject);
      return entries;
    };
    return config;
  },
};

module.exports = nextConfig;

