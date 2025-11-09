#!/usr/bin/env node
/*
 * Configure Cloudflare R2 bucket CORS via API v4.
 * Env required:
 *   CF_API_TOKEN  (R2:Edit scope)
 *   R2_ACCOUNT_ID
 *   R2_BUCKET
 * Optional:
 *   R2_CORS_ORIGINS (comma-separated)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

function env(name, required = true) {
  const v = process.env[name];
  if (!v && required) {
    console.error(`[set-r2-cors] Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

// Load from .env.local if needed
function loadEnvLocal() {
  try {
    const p = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(p)) return;
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i <= 0) continue;
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
    // common typo guard
    if (!process.env.CF_API_TOKEN && process.env.CF_API_TOKE) {
      process.env.CF_API_TOKEN = process.env.CF_API_TOKE;
    }
  } catch {}
}

if (!process.env.CF_API_TOKEN || !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET) loadEnvLocal();

const token = env('CF_API_TOKEN');
const accountId = env('R2_ACCOUNT_ID');
const bucket = env('R2_BUCKET');

const defaultOrigins = [
  process.env.APP_BASE_URL || 'http://localhost:3000',
  'https://starbase-psi.vercel.app',
].filter(Boolean);

const customOrigins = (process.env.R2_CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const allowed_origins = Array.from(new Set([...customOrigins, ...defaultOrigins]));

const payload = JSON.stringify([
  {
    AllowedOrigins: allowed_origins,
    AllowedMethods: ['PUT','GET','HEAD'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600
  }
]);

const apiPath = `/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/cors`;
const req = https.request({
  method: 'PUT',
  host: 'api.cloudflare.com',
  path: apiPath,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    if (!ok) {
      console.error(`[set-r2-cors] Failed (${res.statusCode})`, body);
      process.exit(1);
    }
    console.log('[set-r2-cors] Applied CORS successfully');
    console.log(body);
  });
});
req.on('error', e => { console.error('[set-r2-cors] Request error', e); process.exit(1); });
req.write(payload);
req.end();
