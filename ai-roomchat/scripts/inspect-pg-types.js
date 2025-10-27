#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child = require('child_process');

function ensurePkg(pkg) {
  try { require.resolve(pkg); return true; } catch (e) { console.log(`${pkg} not found, installing...`); child.execSync(`npm install ${pkg}`, { stdio: 'inherit' }); return true; }
}
ensurePkg('pg');
const { Client } = require('pg');

const repoRoot = path.join(__dirname, '..');
const spppPath = path.join(repoRoot, 'SPPP');

if (!fs.existsSync(spppPath)) { console.error('SPPP file not found at', spppPath); process.exit(2); }
const spppRaw = fs.readFileSync(spppPath, 'utf8');

let password = null;
const pwMatch = spppRaw.match(/비밀번호\s*[:=]\s*(\S+)/i) || spppRaw.match(/PASSWORD\s*[:=]\s*(\S+)/i) || spppRaw.match(/PGPASSWORD\s*[:=]\s*(\S+)/i);
if (pwMatch) password = pwMatch[1].trim();

let serverInfo = null;
const jsonMatch = spppRaw.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
if (jsonMatch) {
  try { const parsed = JSON.parse(jsonMatch[1]); if (Array.isArray(parsed) && parsed.length > 0) serverInfo = parsed[0]; } catch (e) {}
}

let supaUrl = null;
const urlMatch = spppRaw.match(/https?:\/\/[^\n\s]+/i);
if (urlMatch) supaUrl = urlMatch[0];

const cfg = {
  host: serverInfo && serverInfo.server_addr ? serverInfo.server_addr : null,
  port: serverInfo && serverInfo.server_port ? serverInfo.server_port : 5432,
  database: serverInfo && serverInfo.database_name ? serverInfo.database_name : 'postgres',
  user: serverInfo && serverInfo.session_user ? serverInfo.session_user : 'postgres',
  password: password,
  ssl: { rejectUnauthorized: false }
};
if (!cfg.host && supaUrl) {
  try { const u = new URL(supaUrl); cfg.host = u.hostname; } catch (e) {}
}
console.log('Connection config (non-sensitive):', { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user });
if (!cfg.password) { console.error('No password found in SPPP. Aborting.'); process.exit(3); }

async function main(){
  const client = new Client(cfg);
  try {
    await client.connect();
    console.log('Connected. Querying column types for public.rank_participants...');
    const res = await client.query(`select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name='rank_participants';`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('Error querying PG:', e);
  } finally {
    await client.end();
  }
}

main();
