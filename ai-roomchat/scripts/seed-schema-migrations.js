#!/usr/bin/env node
// Seed schema_migrations table for files that are already applied in the DB.
// Usage: set MIGRATE_DATABASE_URL (or DATABASE_URL) then run:
//   node scripts/seed-schema-migrations.js --dry-run

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const crypto = require('crypto');

async function main() {
  const sqlDir = path.join(__dirname, '..', 'sql');
  const candidateEnv = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!candidateEnv) {
    console.error('ERROR: Set MIGRATE_DATABASE_URL or DATABASE_URL before running the seeder.');
    process.exit(2);
  }

  const dryRun = process.argv.includes('--dry-run');

  const client = new Client({ connectionString: candidateEnv });
  try {
    await client.connect();
  } catch (e) {
    console.error('Failed to connect to DB:', e && e.message ? e.message : e);
    process.exit(3);
  }

  // Ensure schema_migrations exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  let files = [];
  try {
    files = fs.readdirSync(sqlDir).filter(f => f.toLowerCase().endsWith('.sql'));
  } catch (e) {
    console.error('Failed to read sql directory:', e && e.message ? e.message : e);
    await client.end().catch(() => {});
    process.exit(4);
  }

  files = files.sort();

  for (const f of files) {
    const p = path.join(sqlDir, f);
    const sql = fs.readFileSync(p, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');

    const res = await client.query('SELECT 1 FROM public.schema_migrations WHERE filename = $1', [f]);
    if (res.rowCount > 0) {
      console.log('Already recorded, skipping:', f);
      continue;
    }

    if (dryRun) {
      console.log('[dry-run] Would insert:', f, checksum);
    } else {
      await client.query('INSERT INTO public.schema_migrations(filename, checksum, applied_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING', [f, checksum]);
      console.log('Inserted record for:', f);
    }
  }

  await client.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Seeder failed:', err && err.message ? err.message : err);
  process.exit(99);
});
