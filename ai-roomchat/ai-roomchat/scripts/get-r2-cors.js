#!/usr/bin/env node
const https = require('https');

function env(name, required = true) {
  const v = process.env[name];
  if (!v && required) { console.error(`[get-r2-cors] Missing env ${name}`); process.exit(1); }
  return v;
}

const token = env('CF_API_TOKEN');
const accountId = env('R2_ACCOUNT_ID');
const bucket = env('R2_BUCKET');

const path = `/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/cors`;
https.get({
  host: 'api.cloudflare.com',
  path,
  headers: { 'Authorization': `Bearer ${token}` }
}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('[get-r2-cors] Failed', res.statusCode, body);
      process.exit(1);
    }
    console.log(body);
  });
}).on('error', e => { console.error('[get-r2-cors] Request error', e); process.exit(1); });

