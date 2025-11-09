#!/usr/bin/env node
// apply-sql-from-sppp.js
// Reads ai-roomchat/SPPP for DB connection hints and applies the SQL file
// Usage: node apply-sql-from-sppp.js

const fs = require('fs');
const path = require('path');
const child = require('child_process');

function ensurePkg(pkg) {
  try {
    require.resolve(pkg);
    return true;
  } catch (e) {
    console.log(`${pkg} not found, installing...`);
    child.execSync(`npm install ${pkg}`, { stdio: 'inherit' });
    return true;
  }
}

ensurePkg('pg');
const { Client } = require('pg');

const repoRoot = path.join(__dirname, '..');
const spppPath = path.join(repoRoot, 'SPPP');
const sqlPath = path.join(
  repoRoot,
  'docs',
  'sql',
  'finalize-rank-session-outcome-channel-aware.sql'
);

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
  } catch (e) {
    // ignore
  }
}

// Fallback: find a URL-like host line
let supaUrl = null;
const urlMatch = spppRaw.match(/https?:\/\/[^\s]+/i);
if (urlMatch) supaUrl = urlMatch[0];

// Build connection config
const cfg = {
  host: serverInfo && serverInfo.server_addr ? serverInfo.server_addr : null,
  port: serverInfo && serverInfo.server_port ? serverInfo.server_port : 5432,
  database: serverInfo && serverInfo.database_name ? serverInfo.database_name : 'postgres',
  user: serverInfo && serverInfo.session_user ? serverInfo.session_user : 'postgres',
  password: password,
  ssl: { rejectUnauthorized: false },
};

// If host missing but supabase url present, try to derive host
if (!cfg.host && supaUrl) {
  try {
    const u = new URL(supaUrl);
    cfg.host = u.hostname;
  } catch (e) {
    // ignore
  }
}

console.log('Connection config (non-sensitive):');
console.log({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user });
if (!cfg.password) {
  console.error('No password found in SPPP. Aborting.');
  process.exit(3);
}

if (!fs.existsSync(sqlPath)) {
  console.error('SQL file not found at', sqlPath);
  process.exit(4);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
  // Attempt connect; if a timeout/error occurs and we have a Supa URL host, retry once using the
  // supabase project domain (helps when SPPP contains an IPv6 literal that's not reachable).
  const dns = require('dns').promises;
  let client = new Client(cfg);
  let triedRetry = false;
  try {
    try {
      await client.connect();
    } catch (err) {
      // If timed out or host unreachable, and we can derive a hostname from the Supabase URL,
      // try one retry using that hostname (likely an A/AAAA record behind Cloudflare that may
      // handle IPv4 connectivity).
      const retryable =
        err &&
        (err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH' || err.code === 'ECONNREFUSED');
      if (retryable && supaUrl) {
        try {
          const u = new URL(supaUrl);
          if (u.hostname && u.hostname !== cfg.host) {
            // Prefer an IPv4 address when available to avoid IPv6-only routing/firewall issues.
            let triedHost = u.hostname;
            try {
              const res = await dns.lookup(u.hostname, { family: 4 });
              if (res && res.address) {
                triedHost = res.address;
                console.log(`Resolved ${u.hostname} -> ${triedHost} (IPv4). Retrying connect...`);
              } else {
                console.log(`Could not resolve IPv4 for ${u.hostname}, will retry using hostname.`);
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
          // If inner throws, surface original error for clarity
          throw err;
        }
      } else {
        throw err;
      }
    }

    console.log(
      'Connected to DB. Applying SQL file...' +
        (triedRetry ? ' (used supabase hostname retry)' : '')
    );
    // Execute the file content as a single query (Postgres supports multiple statements)
    await client.query(sql);
    console.log('SQL applied successfully.');
  } catch (err) {
    console.error('Error applying SQL:', err);
    process.exitCode = 5;
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
}

run();
