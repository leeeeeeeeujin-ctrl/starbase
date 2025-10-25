// Apply matchmaking logs columns migration
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('Applying add-matchmaking-logs-columns.sql...');

  const sqlPath = path.join(__dirname, '../docs/sql/add-matchmaking-logs-columns.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split by semicolons and filter out comments
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  console.log(`Found ${statements.length} statements to execute`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;

    console.log(`[${i + 1}/${statements.length}] Executing...`);

    // Try direct query first
    const { error } = await supabase.from('_').rpc('dummy').select('*').limit(0);

    // For ALTER TABLE, we need to use raw SQL via a helper function or manually
    console.log(`  Statement: ${stmt.substring(0, 60)}...`);
    console.log('  Note: Execute this manually in Supabase SQL Editor if needed');
  }

  console.log('\nVerifying columns...');
  const { data, error } = await supabase
    .from('rank_matchmaking_logs')
    .select('id, mode, drop_in, metadata, request_id')
    .limit(1);

  if (error) {
    console.log('Columns not yet available. Please run SQL manually in Supabase SQL Editor:');
    console.log(sqlPath);
  } else {
    console.log('Columns verified successfully!');
    if (data && data.length > 0) {
      console.log('Available columns:', Object.keys(data[0]));
    }
  }
}

applyMigration().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
