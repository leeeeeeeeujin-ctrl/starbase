#!/usr/bin/env node
// Apply SQL migrations from ai-roomchat/sql/*.sql against DATABASE_URL

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const sqlDir = path.join(__dirname, '..', 'sql');
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set in environment to run migrations');
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
  } catch (e) {
    console.error('Failed to connect to database:', e.message || e);
    process.exit(3);
  }

  let files = [];
  try {
    files = fs.readdirSync(sqlDir).filter(f => f.toLowerCase().endsWith('.sql'));
  } catch (e) {
    console.error('Failed to read sql directory:', sqlDir, e.message || e);
    process.exit(4);
  }

  files = files.sort();

  for (const f of files) {
    const p = path.join(sqlDir, f);
    console.log('\n--- Running migration:', f);
    const sql = fs.readFileSync(p, 'utf8');
    try {
      // run as a single transaction
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
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
