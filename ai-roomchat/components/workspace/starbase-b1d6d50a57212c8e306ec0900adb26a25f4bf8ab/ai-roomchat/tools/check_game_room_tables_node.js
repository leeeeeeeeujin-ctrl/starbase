#!/usr/bin/env node
// Check existence of game_room* tables via Postgres connection using MIGRATE_DATABASE_URL or SPPP fallback.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnvDotenv(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const lines = txt.split(/\r?\n/);
    const env = {};
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      let k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[k] = v;
    }
    return env;
  } catch (e) { return {}; }
}

function buildConnFromSPPP(spppPath) {
  try {
    const txt = fs.readFileSync(spppPath, 'utf8');
    const urlMatch = txt.match(/https?:\/\/[^\s/]+/);
    const pwMatch = txt.match(/(?:비밀번호|password)\s*[:：]\s*(\S+)/i);
    if (!urlMatch || !pwMatch) return null;
    const host = urlMatch[0].replace(/^https?:\/\//, '').replace(/\/$/, '');
    const password = pwMatch[1].trim();
    const user = 'postgres';
    const dbname = 'postgres';
    const conn = `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${dbname}?sslmode=require`;
    return conn;
  } catch { return null; }
}

(async () => {
  let connStr = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    const envLocal = loadEnvDotenv(path.join(__dirname, '..', '.env.local'));
    if (envLocal.MIGRATE_DATABASE_URL) connStr = envLocal.MIGRATE_DATABASE_URL;
  }
  if (!connStr) {
    const fromSppp = buildConnFromSPPP(path.join(__dirname, '..', 'SPPP'));
    if (fromSppp) connStr = fromSppp;
  }
  if (!connStr) { console.error('No DB connection string found'); process.exit(2); }

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  try {
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'game_room%';");
    console.log(JSON.stringify({ tables: r.rows }, null, 2));
    await pool.end();
    process.exit(0);
  } catch (e) { console.error('Query failed:', e && e.message ? e.message : e); process.exit(1); }
})();

