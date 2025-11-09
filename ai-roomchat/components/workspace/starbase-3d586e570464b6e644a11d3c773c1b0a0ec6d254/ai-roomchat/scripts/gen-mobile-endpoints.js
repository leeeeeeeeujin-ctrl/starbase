#!/usr/bin/env node
/**
 * Generate public/mobile-endpoints.json describing chosen primary host and service endpoints.
 * This runs at build time before packaging mobile assets.
 */
const fs = require('fs');
const path = require('path');

function pickHost(){
  const order = [
    process.env.MOBILE_SERVER_URL,
    process.env.NEXT_PUBLIC_MOBILE_SERVER_URL,
    process.env.APP_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];
  for (const v of order){
    if (v && v.trim()) return v.trim();
  }
  return null;
}
function norm(u){
  if (!u) return undefined;
  let x = u.trim();
  if (!/^https?:\/\//i.test(x)) x = 'https://' + x.replace(/^\/+/, '');
  return x.replace(/\/$/, '');
}
const primary = norm(pickHost()) || norm(process.env.NEXT_PUBLIC_SUPABASE_URL) || null;
const endpoints = {
  generatedAt: new Date().toISOString(),
  primaryHost: primary,
  vercel: norm(process.env.VERCEL_URL),
  vercelProd: norm(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  supabase: norm(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
  r2PublicBase: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '') || null,
  assetsBucketEndpoint: process.env.R2_S3_ENDPOINT || null,
};

const outPath = path.join(process.cwd(), 'public', 'mobile-endpoints.json');
fs.writeFileSync(outPath, JSON.stringify(endpoints, null, 2) + '\n');
console.log('[gen-mobile-endpoints] wrote', outPath, 'primaryHost=', endpoints.primaryHost);
