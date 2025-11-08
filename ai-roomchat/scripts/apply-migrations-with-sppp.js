#!/usr/bin/env node
// apply-migrations-with-sppp.js
// Reads local SPPP file (dotenv-like or JSON) and runs apply-migrations.js with appropriate env vars.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseDotenv(text) {
  const lines = text.split(/\r?\n/);
  const map = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    let k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

const spppPath = path.join(__dirname, '..', 'SPPP');
if (!fs.existsSync(spppPath)) {
  console.error('SPPP file not found at', spppPath);
  process.exit(2);
}

const content = fs.readFileSync(spppPath, 'utf8');
let envMap = {};
const json = tryParseJson(content);
if (json && typeof json === 'object') {
  for (const k of Object.keys(json)) envMap[k] = String(json[k]);
} else {
  envMap = parseDotenv(content);
}

// Heuristic: if no keys, try raw lines guessing
if (Object.keys(envMap).length === 0) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const [a, b] = lines;
    if (/^https?:\/\//i.test(a)) {
      envMap.SUPABASE_URL = a;
      envMap.SUPABASE_SERVICE_ROLE_KEY = b;
    } else if (/^https?:\/\//i.test(b)) {
      envMap.SUPABASE_SERVICE_ROLE_KEY = a;
      envMap.SUPABASE_URL = b;
    }
  }
}

// Find DB/Supabase values
const dbUrl = envMap.DATABASE_URL || envMap.SUPABASE_DB_URL || envMap.SUPABASE_URL || envMap.SUPABASE_PROJECT_URL || envMap.SUPABASE_URL;
const supabaseKey = envMap.SUPABASE_SERVICE_ROLE_KEY || envMap.SUPABASE_SERVICE_ROLE || envMap.SERVICE_ROLE_KEY || envMap.SERVICE_ROLE || envMap.SERVICE_KEY;

if (!dbUrl) {
  console.error('Could not determine DATABASE_URL or SUPABASE URL from SPPP file. Aborting.');
  process.exit(3);
}

// Prepare env for child process without leaking to console
const childEnv = Object.assign({}, process.env);
childEnv.DATABASE_URL = dbUrl;
if (supabaseKey) {
  childEnv.SUPABASE_SERVICE_ROLE_KEY = supabaseKey;
  childEnv.SUPABASE_SERVICE_ROLE = supabaseKey;
}
// Also set NEXT_PUBLIC_SUPABASE_URL for server libs that read it
if (!childEnv.NEXT_PUBLIC_SUPABASE_URL && envMap.SUPABASE_URL) childEnv.NEXT_PUBLIC_SUPABASE_URL = envMap.SUPABASE_URL;

console.log('Applying SQL migrations using local SPPP secrets (secrets hidden).');

const runner = path.join(__dirname, 'apply-migrations.js');
const res = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: childEnv });
if (res.error) {
  console.error('Failed to run migrations:', res.error);
  process.exit(4);
}
process.exit(res.status || 0);
