#!/usr/bin/env node
/**
 * Supabase를 직접 조회하는 유틸리티
 * 사용법: node scripts/querySupabase.js <query>
 * 예시: node scripts/querySupabase.js "select * from rank_sessions where extras->>'simulation' = 'true' limit 5"
 */

const path = require('path');
const fs = require('fs');

// .env.local 로드
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function executeQuery(sql) {
  console.log(`\n📊 Executing query:\n${sql}\n`);

  try {
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Query failed:', error);
      return { ok: false, error };
    }

    console.log('✅ Query successful!');
    console.log('\nResults:');
    console.log(JSON.stringify(data, null, 2));

    // 로그 파일 저장
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `query-${timestamp}.json`);

    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          sql,
          data,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(`\n📄 Log saved: ${logPath}`);

    return { ok: true, data };
  } catch (err) {
    console.error('❌ Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// 간단한 테이블 조회 헬퍼
async function quickQuery(table, options = {}) {
  const { select = '*', limit = 10, order, where } = options;

  console.log(`\n📊 Quick query: ${table}`);

  let query = supabaseAdmin.from(table).select(select);

  if (where) {
    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
  }

  if (order) {
    query = query.order(order.column, { ascending: order.ascending !== false });
  }

  query = query.limit(limit);

  try {
    const { data, error } = await query;

    if (error) {
      console.error('❌ Query failed:', error);
      return { ok: false, error };
    }

    console.log(`✅ Found ${data.length} rows\n`);
    console.log(JSON.stringify(data, null, 2));

    return { ok: true, data };
  } catch (err) {
    console.error('❌ Error:', err.message);
    return { ok: false, error: err.message };
  }
}

// 시뮬레이션 세션 조회
async function listSimulations() {
  console.log('\n🎮 Listing simulation sessions...\n');

  const { data, error } = await supabaseAdmin
    .from('rank_sessions')
    .select('id, game_id, mode, turn, status, created_at, rank_session_meta(extras)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Query failed:', error);
    return;
  }

  const simulations = data.filter(s => s.rank_session_meta?.[0]?.extras?.simulation === true);

  console.log(`✅ Found ${simulations.length} simulation sessions (out of ${data.length} total)\n`);

  simulations.forEach(s => {
    console.log(`  📍 ${s.id}`);
    console.log(`     Mode: ${s.mode} | Turn: ${s.turn} | Status: ${s.status}`);
    console.log(`     Created: ${s.created_at}`);
    console.log();
  });

  return simulations;
}

// CLI 실행
const command = process.argv[2];
const arg1 = process.argv[3];

if (!command) {
  console.log(`
Usage:
  node scripts/querySupabase.js list-sims
  node scripts/querySupabase.js query "<table>" [limit]
  node scripts/querySupabase.js sql "<raw sql>"
  
Examples:
  node scripts/querySupabase.js list-sims
  node scripts/querySupabase.js query rank_sessions 5
  node scripts/querySupabase.js sql "select count(*) from heroes"
`);
  process.exit(0);
}

async function main() {
  switch (command) {
    case 'list-sims':
      await listSimulations();
      break;

    case 'query':
      const table = arg1 || 'rank_sessions';
      const limit = parseInt(process.argv[4]) || 10;
      await quickQuery(table, { limit });
      break;

    case 'sql':
      if (!arg1) {
        console.error('❌ SQL query required');
        process.exit(1);
      }
      await executeQuery(arg1);
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
