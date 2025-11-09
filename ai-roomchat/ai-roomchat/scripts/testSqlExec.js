#!/usr/bin/env node
/**
 * SQL 실행 테스트 - RPC 함수 확인
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function testSqlExecution() {
  console.log('🧪 Testing SQL execution via RPC...\n');

  // 1. 테이블 생성
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS test_ai_table (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT DEFAULT 'AI',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log('📝 Step 1: Creating test table...');
  console.log('SQL:', createTableSql.trim(), '\n');

  const { data: createData, error: createError } = await supabase.rpc('exec_sql_admin', {
    sql_query: createTableSql,
  });

  if (createError) {
    console.error('❌ Create table failed:', createError.message);
    return;
  }

  console.log('✅ Table created successfully!\n');

  // 2. 데이터 삽입
  console.log('📝 Step 2: Inserting test data...');

  const insertSql = `
    INSERT INTO test_ai_table (name, created_by) 
    VALUES 
      ('AI생성레코드1', 'GitHub Copilot'),
      ('AI생성레코드2', 'GitHub Copilot'),
      ('AI생성레코드3', 'GitHub Copilot')
    RETURNING *
  `;

  const { data: insertData, error: insertError } = await supabase.rpc('exec_sql_admin', {
    sql_query: insertSql,
  });

  if (insertError) {
    console.error('❌ Insert failed:', insertError.message);
    return;
  }

  console.log('✅ Data inserted!\n');

  // 3. 데이터 조회
  console.log('📝 Step 3: Querying data...');

  const selectSql = 'SELECT * FROM test_ai_table ORDER BY id';

  const { data: selectData, error: selectError } = await supabase.rpc('exec_sql_admin', {
    sql_query: selectSql,
  });

  if (selectError) {
    console.error('❌ Select failed:', selectError.message);
    return;
  }

  console.log('✅ Data retrieved:');
  console.log(JSON.stringify(selectData, null, 2));
  console.log();

  // 4. 테이블 확인
  console.log('📝 Step 4: Verifying table exists in schema...');

  const checkSql = `
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'test_ai_table'
    ORDER BY ordinal_position
  `;

  const { data: checkData, error: checkError } = await supabase.rpc('exec_sql_admin', {
    sql_query: checkSql,
  });

  if (checkError) {
    console.error('❌ Check failed:', checkError.message);
    return;
  }

  console.log('✅ Table schema:');
  console.log(JSON.stringify(checkData, null, 2));
  console.log();

  console.log('🎉 All tests passed! AI can execute SQL on Supabase!');
  console.log('\n💡 You can now check the table in Supabase Dashboard → Table Editor');
}

testSqlExecution()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
