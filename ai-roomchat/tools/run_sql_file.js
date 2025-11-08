#!/usr/bin/env node
// Run a SQL file against the database using MIGRATE_DATABASE_URL or local SPPP fallback.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
    else if (a.startsWith('--file=')) out.file = a.split('=')[1];
  }
  return out;
}

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
  } catch (e) {
    return {};
  }
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
  } catch (e) {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Usage: node tools/run_sql_file.js --file <path-to-sql>');
    process.exit(2);
  }
  const sqlPath = path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(sqlPath)) {
    console.error('SQL file not found:', sqlPath);
    process.exit(3);
  }

  // Determine connection string
  let connStr = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    const envLocal = loadEnvDotenv(path.join(__dirname, '..', '.env.local'));
    if (envLocal.MIGRATE_DATABASE_URL) connStr = envLocal.MIGRATE_DATABASE_URL;
  }
  if (!connStr) {
    // fallback to SPPP (local secrets file)
    const spppPath = path.join(__dirname, '..', 'SPPP');
    const fromSppp = buildConnFromSPPP(spppPath);
    if (fromSppp) connStr = fromSppp;
  }
  if (!connStr) {
    console.error('No MIGRATE_DATABASE_URL/DATABASE_URL found and could not build from SPPP. Aborting.');
    process.exit(4);
  }

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    console.error('Failed to connect:', e && e.message ? e.message : e);
    process.exit(5);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await client.query(sql);
    console.log('Applied SQL from', args.file);
  } catch (e) {
    console.error('Failed to apply SQL:', e && e.message ? e.message : e);
    await client.end().catch(() => {});
    process.exit(6);
  }

  await client.end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(99); });

