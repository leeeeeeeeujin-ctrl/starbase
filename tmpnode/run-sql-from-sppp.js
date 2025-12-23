#!/usr/bin/env node
// Lightweight helper to run ad-hoc SQL against the Supabase Postgres
// instance using the connection hints in the ai-roomchat/SPPP file.
//
// Usage (from ai-roomchat/):
//   set SQL=select game_id, created_at, updated_at from public.rank_game_workspaces limit 10;
//   node tmpnode/run-sql-from-sppp.js
//
// If the SQL env var is not set, a safe default query is executed.

const fs = require('fs');
const path = require('path');
const child = require('child_process');

function ensurePkg(pkg) {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    console.log(`${pkg} not found, installing...`);
    child.execSync(`npm install ${pkg}`, { stdio: 'inherit' });
    return true;
  }
}

ensurePkg('pg');
const { Client } = require('pg');

// In this monorepo, the Next.js app (and SPPP file) live under ai-roomchat/
// while this helper lives at repoRoot/tmpnode.
const repoRoot = path.join(__dirname, '..', 'ai-roomchat');
const spppPath = path.join(repoRoot, 'SPPP');

if (!fs.existsSync(spppPath)) {
  console.error('SPPP file not found at', spppPath);
  process.exit(2);
}

const spppRaw = fs.readFileSync(spppPath, 'utf8');

// Extract password (supports Korean label '비밀번호:' and common forms)
let password = null;
const pwMatch =
  spppRaw.match(/비밀번호\s*[:=]\s*(\S+)/i) ||
  spppRaw.match(/PASSWORD\s*[:=]\s*(\S+)/i) ||
  spppRaw.match(/PGPASSWORD\s*[:=]\s*(\S+)/i);
if (pwMatch) password = pwMatch[1].trim();

// Try to extract JSON diagnostics block with server info
let serverInfo = null;
const jsonMatch = spppRaw.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed) && parsed.length > 0) serverInfo = parsed[0];
  } catch {
    // ignore
  }
}

// Fallback: find a URL-like host line
let supaUrl = null;
const urlMatch = spppRaw.match(/https?:\/\/[^\s]+/i);
if (urlMatch) supaUrl = urlMatch[0];

// Build connection config (do not log sensitive fields)
const cfg = {
  host: serverInfo && serverInfo.server_addr ? serverInfo.server_addr : null,
  port: serverInfo && serverInfo.server_port ? serverInfo.server_port : 5432,
  database: serverInfo && serverInfo.database_name ? serverInfo.database_name : 'postgres',
  user: serverInfo && serverInfo.session_user ? serverInfo.session_user : 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
};

// If host missing but Supabase URL present, try to derive host
if (!cfg.host && supaUrl) {
  try {
    const u = new URL(supaUrl);
    cfg.host = u.hostname;
  } catch {
    // ignore
  }
}

console.log('Connection config (non-sensitive):');
console.log({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user });
if (!cfg.password) {
  console.error('No password found in SPPP. Aborting.');
  process.exit(3);
}

const sql =
  process.env.SQL &&
  typeof process.env.SQL === 'string' &&
  process.env.SQL.trim()
    ? process.env.SQL.trim()
    : 'select game_id, created_at, updated_at from public.rank_game_workspaces order by updated_at desc nulls last limit 10;';

async function run() {
  const dns = require('dns').promises;
  let client = new Client(cfg);
  let triedRetry = false;

  try {
    try {
      await client.connect();
    } catch (err) {
      const retryable =
        err &&
        (err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED');
      if (retryable && supaUrl) {
        try {
          const u = new URL(supaUrl);
          if (u.hostname && u.hostname !== cfg.host) {
            let triedHost = u.hostname;
            try {
              const res = await dns.lookup(u.hostname, { family: 4 });
              if (res && res.address) {
                triedHost = res.address;
                console.log(`Resolved ${u.hostname} -> ${triedHost} (IPv4). Retrying connect...`);
              } else {
                console.log(
                  `Could not resolve IPv4 for ${u.hostname}, will retry using hostname.`
                );
              }
            } catch (dnsErr) {
              console.log(
                `IPv4 lookup failed for ${u.hostname}:`,
                dnsErr && dnsErr.code ? dnsErr.code : dnsErr
              );
            }

            console.log(`Initial connect failed (${err.code}). Retrying with ${triedHost}...`);
            cfg.host = triedHost;
            triedRetry = true;
            client = new Client(cfg);
            await client.connect();
          } else {
            throw err;
          }
        } catch (inner) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    console.log(
      'Connected to DB. Running query...' + (triedRetry ? ' (used Supabase hostname retry)' : '')
    );
    const result = await client.query(sql);
    console.log('Row count:', result.rowCount);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (err) {
    console.error('Error running SQL:', err);
    process.exitCode = 5;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

run();
