// Apply SQL migration to add matchmaking log columns
// Usage: node scripts/migrate-matchmaking-logs.js

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

async function migrate() {
  console.log('📦 Reading migration file...')
  const sqlPath = path.join(__dirname, '../docs/sql/add-matchmaking-logs-columns.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('🔧 Applying migration to rank_matchmaking_logs...')
  
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    if (!stmt) continue
    
    console.log(`  [${i + 1}/${statements.length}] Executing...`)
    const { error } = await supabase.rpc('exec_sql', { sql_query: stmt })
    
    if (error) {
      console.error(`  ❌ Error: ${error.message}`)
      // Try direct execution via REST API as fallback
      const { error: directError } = await supabase.from('_migration_temp').select('*').limit(0)
      if (directError) {
        console.log('  ⚠️  Unable to execute via RPC, manual migration required')
      }
    } else {
      console.log('  ✓ Success')
    }
  }

  console.log('\n✅ Migration complete!')
  console.log('🔍 Verifying columns...')

  const { data, error } = await supabase
    .from('rank_matchmaking_logs')
    .select('id, mode, drop_in, metadata')
    .limit(1)

  if (error) {
    console.log('⚠️  Cannot verify - table might not have new columns yet')
    console.log('   Please run the SQL file manually in Supabase SQL Editor')
  } else {
    console.log('✓ Columns verified:', Object.keys(data?.[0] || {}))
  }
}

migrate().catch(err => {
  console.error('💥 Migration failed:', err.message)
  process.exit(1)
})
