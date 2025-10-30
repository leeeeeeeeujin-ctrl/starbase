#!/usr/bin/env node
// Apply SQL migrations from ai-roomchat/sql/*.sql against DATABASE_URL

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const sqlDir = path.join(__dirname, '..', 'sql');
  // Prefer an explicit migration URL (MIGRATE_DATABASE_URL) so CI can use a
  // session-pooler endpoint when direct IPv4 is blocked. Fall back to:
  // DATABASE_POOLER_SESSION_URL -> DATABASE_POOLER_TRANSACTION_URL -> DATABASE_URL -> SUPABASE_DB_URL
  const candidateEnvVars = [
    'MIGRATE_DATABASE_URL',
    'DATABASE_POOLER_SESSION_URL',
    'DATABASE_POOLER_TRANSACTION_URL',
    'DATABASE_URL',
    'SUPABASE_DB_URL'
  ];

  let chosenEnv = null;
  let connStr = null;
  for (const name of candidateEnvVars) {
    if (process.env[name]) {
      chosenEnv = name;
      connStr = process.env[name];
      break;
    }
  }

  if (!connStr) {
    console.error('ERROR: No database connection environment variable set. Set MIGRATE_DATABASE_URL or DATABASE_URL (or SUPABASE_DB_URL)');
    process.exit(2);
  }

  console.log('Using DB connection from env var:', chosenEnv);

  // Try resolving an IPv4 address for the DB host and prefer that when available.
  // This helps CI runners which may not have working IPv6 routing to the DB host.
  let client;
  try {
    const { URL } = require('url');
    const dns = require('dns').promises;
    const u = new URL(connStr);
    const host = u.hostname;
    const port = u.port || 5432;
    let ipv4 = null;
    try {
      const res = await dns.lookup(host, { family: 4 });
      ipv4 = res && res.address;
      if (ipv4) console.log('Resolved IPv4 for DB host:', host, '->', ipv4);
    } catch (e) {
      console.log('No IPv4 A record found for', host, '- will use connection string');
    }

    if (ipv4) {
      // construct client config using the IPv4 address
      const config = {
        host: ipv4,
        port: port,
        user: u.username,
        password: u.password,
        database: (u.pathname || '').replace(/^\//, ''),
        ssl: { rejectUnauthorized: false }
      };
      client = new Client(config);
    } else {
      client = new Client({ connectionString: connStr });
    }

    await client.connect();
  } catch (e) {
    console.error('Failed to connect to database:', e && e.message ? e.message : e);
    process.exit(3);
  }

  // Ensure schema_migrations table exists so we can track applied migrations.
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id serial PRIMARY KEY,
        filename text NOT NULL UNIQUE,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  } catch (e) {
    console.error('Failed to ensure schema_migrations table exists:', e && e.message ? e.message : e);
    await client.end().catch(() => {});
    process.exit(6);
  }

  let files = [];
  try {
    files = fs.readdirSync(sqlDir).filter(f => f.toLowerCase().endsWith('.sql'));
  } catch (e) {
    console.error('Failed to read sql directory:', sqlDir, e.message || e);
    process.exit(4);
  }

  files = files.sort();

  const crypto = require('crypto');

  for (const f of files) {
    const p = path.join(sqlDir, f);
    // Skip files that are not SQL or that are clearly temporary
    if (!f.toLowerCase().endsWith('.sql')) continue;

    // Check if migration already applied
    try {
      const res = await client.query('SELECT checksum FROM public.schema_migrations WHERE filename = $1', [f]);
      if (res && res.rowCount > 0) {
        console.log('Skipping already applied migration:', f);
        continue;
      }
    } catch (e) {
      console.error('Failed to check migration state for', f, e && e.message ? e.message : e);
      await client.end().catch(() => {});
      process.exit(7);
    }

    console.log('\n--- Running migration:', f);
    const sql = fs.readFileSync(p, 'utf8');
    try {
      // run as a single transaction
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      // compute checksum and record migration as applied
      try {
        const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
        await client.query(
          'INSERT INTO public.schema_migrations(filename, checksum, applied_at) VALUES($1, $2, now()) ON CONFLICT (filename) DO NOTHING',
          [f, checksum]
        );
      } catch (recErr) {
        console.warn('Warning: failed to record migration in schema_migrations for', f, recErr && recErr.message ? recErr.message : recErr);
      }
      console.log('Migration applied:', f);
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (er) {}
      console.error('Migration failed for', f, e && e.message ? e.message : e);
      await client.end().catch(() => {});
      process.exit(5);
    }
  }

  await client.end();
  console.log('\nAll migrations applied successfully.');
}

main().catch(err => {
  console.error('Migration runner failed:', err && err.message ? err.message : err);
  process.exit(99);
});
