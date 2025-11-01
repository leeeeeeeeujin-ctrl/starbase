#!/usr/bin/env node
// Resolve the DB host to IPv4 and run apply-migrations.js with DATABASE_URL forcing IPv4
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { spawn } = require('child_process');

async function readSPPP() {
  const p = path.join(__dirname, '..', 'SPPP_url');
  if (!fs.existsSync(p)) throw new Error('SPPP_url file not found: ' + p);
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // find a line that looks like postgresql://
  const pgLine = lines.find(l => l.startsWith('postgres://') || l.startsWith('postgresql://'));
  if (!pgLine) throw new Error('No postgresql URL found in SPPP_url');
  return pgLine;
}

function replaceHostInPostgresUrl(conn, newHost) {
  // conn is like: postgresql://user:pass@host:port/dbname
  // Use URL to parse
  let u;
  try {
    u = new URL(conn);
  } catch (e) {
    // Try replacing postgres scheme to http for parsing then swap back
    const tmp = conn.replace(/^postgres(ql)?:\/\//, 'http://');
    u = new URL(tmp);
    u.protocol = conn.startsWith('postgresql://') ? 'postgresql:' : 'postgres:';
  }
  u.hostname = newHost;
  return u.toString();
}

async function main() {
  const pgUrl = await readSPPP();
  console.log('Found pg url:', pgUrl.replace(/:[^:@]*@/, ':*****@'));
  // extract host
  const url = new URL(pgUrl);
  const host = url.hostname;
  console.log('Resolving IPv4 for host:', host);
  let addrs = [];
  try {
    addrs = await dns.resolve4(host);
  } catch (e) {
    console.error('Failed to resolve A records for', host, e && e.message ? e.message : e);
    process.exit(2);
  }
  if (!addrs || addrs.length === 0) {
    console.error('No IPv4 addresses found for', host);
    process.exit(3);
  }
  const ipv4 = addrs[0];
  console.log('Using IPv4:', ipv4);
  const newDbUrl = replaceHostInPostgresUrl(pgUrl, ipv4);
  console.log('New DB URL:', newDbUrl.replace(/:[^:@]*@/, ':*****@'));

  // Run apply-migrations.js with DATABASE_URL set
  const cwd = path.join(__dirname, '..');
  const child = spawn(process.execPath, ['scripts/apply-migrations.js'], {
    cwd,
    env: Object.assign({}, process.env, { DATABASE_URL: newDbUrl }),
    stdio: 'inherit'
  });
  child.on('exit', code => process.exit(code));
}

main().catch(err => {
  console.error('Migration runner helper failed:', err && err.message ? err.message : err);
  process.exit(99);
});
