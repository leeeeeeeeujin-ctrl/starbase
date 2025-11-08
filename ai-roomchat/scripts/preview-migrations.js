#!/usr/bin/env node
// Preview migrations: list applied vs pending without applying any SQL.
// Reads DB connection from env (MIGRATE_DATABASE_URL -> DATABASE_URL -> SUPABASE_DB_URL)
// and compares against files in ai-roomchat/sql.

const fs = require('fs');
const path = require('path');

async function getApplied(connStr) {
  if (!connStr) return [];
  try {
    const { Client } = require('pg');
    const c = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const q = `SELECT filename FROM public.schema_migrations ORDER BY filename ASC`;
    const r = await c.query(q);
    await c.end();
    return (r.rows || []).map((x) => x.filename);
  } catch (e) {
    // Table may not exist yet; treat as none applied.
    return [];
  }
}

function getFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const sqlDir = path.join(repoRoot, 'sql');
  const files = getFiles(sqlDir);
  const conn = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || null;
  const applied = await getApplied(conn);
  const pending = files.filter((f) => !applied.includes(f));
  const info = { source: conn ? 'db+fs' : 'fs-only', sqlDir, files, applied, pending };
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
})().catch((e) => { console.error(String(e)); process.exit(1); });

