try {
  require('dotenv-vault').config({ path: '.env' });
} catch (error) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[dotenv-vault] Skipping vault config:', error.message);
  }
}

const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
