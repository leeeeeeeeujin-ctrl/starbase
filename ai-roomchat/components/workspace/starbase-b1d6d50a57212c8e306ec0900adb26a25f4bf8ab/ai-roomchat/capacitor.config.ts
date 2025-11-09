import { CapacitorConfig } from '@capacitor/cli';

// Determine production server URL dynamically from env.
// Priority order (pick the first available):
// 1. MOBILE_SERVER_URL — overrides all
// 2. NEXT_PUBLIC_MOBILE_SERVER_URL — public-configured mobile endpoint
// 3. APP_BASE_URL — canonical app host if present
// 4. VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL — Vercel environment
// 5. NEXT_PUBLIC_SUPABASE_URL — as last resort (app domain unknown), not ideal but ensures a host
// 6. Fallback: undefined (pure static bundle)
const rawEnvUrl = process.env.MOBILE_SERVER_URL
  || process.env.NEXT_PUBLIC_MOBILE_SERVER_URL
  || process.env.APP_BASE_URL
  || process.env.VERCEL_PROJECT_PRODUCTION_URL
  || process.env.VERCEL_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || '';

function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  let x = u.trim();
  if (!x) return undefined;
  if (!/^https?:\/\//i.test(x)) x = 'https://' + x.replace(/^\/+/, '');
  // strip trailing slash for consistency
  x = x.replace(/\/$/, '');
  return x;
}

const serverUrl = normalizeUrl(rawEnvUrl);

const config: CapacitorConfig = {
  appId: 'com.starbase.ai',
  appName: 'Starbase',
  webDir: 'out',
  bundledWebRuntime: false,
  android: { allowMixedContent: true },
  ...(serverUrl ? { server: { url: serverUrl, cleartext: /^http:/.test(serverUrl) } } : {}),
};

export default config;
