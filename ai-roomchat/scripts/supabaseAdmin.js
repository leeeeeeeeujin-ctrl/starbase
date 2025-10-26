#!/usr/bin/env node
/**
 * Supabase 데이터 조회/생성/삭제 유틸리티
 * 안전한 CRUD 작업만 수행
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// =============================================================================
// 조회 함수들
// =============================================================================

async function listSimulations() {
  console.log('\n🎮 Listing simulation sessions...\n');

  const { data, error } = await supabase
    .from('rank_sessions')
    .select('id, game_id, mode, turn, status, created_at, rank_session_meta!inner(extras)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('❌ Query failed:', error);
    return [];
  }

  const simulations = data.filter(s => s.rank_session_meta?.extras?.simulation === true);

  console.log(`✅ Found ${simulations.length} simulation sessions (out of ${data.length} total)\n`);

  simulations.forEach(s => {
    console.log(`  📍 ${s.id}`);
    console.log(`     Mode: ${s.mode} | Turn: ${s.turn} | Status: ${s.status}`);
    console.log(`     Created: ${s.created_at}`);
    console.log();
  });

  return simulations;
}

async function getSession(sessionId) {
  console.log(`\n🔍 Fetching session: ${sessionId}\n`);

  // 세션 정보
  const { data: session, error: sessionError } = await supabase
    .from('rank_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError) {
    console.error('❌ Session not found:', sessionError.message);
    return null;
  }

  // 메타 정보
  const { data: meta, error: metaError } = await supabase
    .from('rank_session_meta')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  // 배틀 로그
  const { data: logs, error: logsError } = await supabase
    .from('rank_battle_logs')
    .select('*, rank_battles(*)')
    .eq('meta->>session_id', sessionId)
    .order('created_at', { ascending: true });

  console.log('✅ Session data:');
  console.log(JSON.stringify({ session, meta, logsCount: logs?.length || 0 }, null, 2));

  return { session, meta, logs: logs || [] };
}

async function countRecords(table) {
  console.log(`\n📊 Counting records in ${table}...\n`);

  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Count failed:', error.message);
    return 0;
  }

  console.log(`✅ ${table}: ${count} records`);
  return count;
}

// =============================================================================
// 삭제 함수들
// =============================================================================

async function deleteSimulation(sessionId) {
  console.log(`\n🗑️  Deleting simulation session: ${sessionId}\n`);

  try {
    // 1. 배틀 로그 삭제 (메타에 session_id 필터)
    const { data: logs } = await supabase
      .from('rank_battle_logs')
      .select('id, meta')
      .eq('meta->>session_id', sessionId);

    if (logs && logs.length > 0) {
      const logIds = logs.map(l => l.id);
      const { error: logsError } = await supabase
        .from('rank_battle_logs')
        .delete()
        .in('id', logIds);

      if (logsError) throw logsError;
      console.log(`   ✅ Deleted ${logs.length} battle logs`);
    }

    // 2. 배틀 삭제
    const { data: battles } = await supabase
      .from('rank_battles')
      .select('id, meta')
      .eq('meta->>session_id', sessionId);

    if (battles && battles.length > 0) {
      const battleIds = battles.map(b => b.id);
      const { error: battlesError } = await supabase
        .from('rank_battles')
        .delete()
        .in('id', battleIds);

      if (battlesError) throw battlesError;
      console.log(`   ✅ Deleted ${battles.length} battles`);
    }

    // 3. 메타 삭제
    const { error: metaError } = await supabase
      .from('rank_session_meta')
      .delete()
      .eq('session_id', sessionId);

    if (metaError) throw metaError;
    console.log(`   ✅ Deleted session meta`);

    // 4. 세션 삭제
    const { error: sessionError } = await supabase
      .from('rank_sessions')
      .delete()
      .eq('id', sessionId);

    if (sessionError) throw sessionError;
    console.log(`   ✅ Deleted session`);

    console.log('\n✅ Simulation deleted successfully!');
    return true;
  } catch (error) {
    console.error(`\n❌ Delete failed: ${error.message}`);
    return false;
  }
}

async function deleteAllSimulations() {
  console.log('\n⚠️  Deleting ALL simulation sessions...\n');

  const simulations = await listSimulations();

  if (simulations.length === 0) {
    console.log('No simulations to delete.');
    return;
  }

  console.log(`Found ${simulations.length} simulations. Deleting...`);

  let deleted = 0;
  for (const sim of simulations) {
    const success = await deleteSimulation(sim.id);
    if (success) deleted++;
  }

  console.log(`\n✅ Deleted ${deleted} / ${simulations.length} simulations`);
}

async function deleteHero(heroId) {
  console.log(`\n🗑️  Deleting hero: ${heroId}\n`);

  const { error } = await supabase.from('heroes').delete().eq('id', heroId);

  if (error) {
    console.error('❌ Delete failed:', error.message);
    return false;
  }

  console.log('✅ Hero deleted successfully!');
  return true;
}

async function deleteHeroByName(name) {
  console.log(`\n🗑️  Deleting hero by name: ${name}\n`);

  const { data, error } = await supabase.from('heroes').delete().eq('name', name).select();

  if (error) {
    console.error('❌ Delete failed:', error.message);
    return false;
  }

  console.log(`✅ Deleted ${data.length} hero(es)`);
  return true;
}

// =============================================================================
// 생성 함수들
// =============================================================================

async function createTestHero(name, ownerId = null) {
  console.log(`\n➕ Creating test hero: ${name}\n`);

  // owner_id가 없으면 첫 번째 영웅의 owner_id 사용
  if (!ownerId) {
    const { data: sample } = await supabase.from('heroes').select('owner_id').limit(1).single();
    ownerId = sample?.owner_id || '00000000-0000-0000-0000-000000000000';
  }

  const { data, error } = await supabase
    .from('heroes')
    .insert({
      name,
      owner_id: ownerId,
      description: `Test hero created by AI at ${new Date().toISOString()}`,
      ability1: 'Test Ability 1',
      ability2: 'Test Ability 2',
      ability3: 'Test Ability 3',
      ability4: 'Test Ability 4',
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Create failed:', error.message);
    return null;
  }

  console.log(`✅ Created hero: ${data.id} (${data.name})`);
  return data;
}

async function createTestGame(name) {
  console.log(`\n➕ Creating test game: ${name}\n`);

  const { data: game, error: gameError } = await supabase
    .from('rank_games')
    .insert({ name })
    .select()
    .single();

  if (gameError) {
    console.error('❌ Game create failed:', gameError.message);
    return null;
  }

  console.log(`✅ Created game: ${game.id} (${game.name})`);

  // 기본 역할 생성
  const roles = [
    {
      game_id: game.id,
      name: '공격',
      slot_count: 1,
      active: true,
      score_delta_min: 20,
      score_delta_max: 40,
    },
    {
      game_id: game.id,
      name: '수비',
      slot_count: 2,
      active: true,
      score_delta_min: 20,
      score_delta_max: 40,
    },
  ];

  const { data: rolesData, error: rolesError } = await supabase
    .from('rank_game_roles')
    .insert(roles)
    .select();

  if (rolesError) {
    console.error('❌ Roles create failed:', rolesError.message);
  } else {
    console.log(`✅ Created ${rolesData.length} roles`);
  }

  return game;
}

// =============================================================================
// CLI
// =============================================================================

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

if (!command) {
  console.log(`
Usage:
  node scripts/supabaseAdmin.js list-sims
  node scripts/supabaseAdmin.js get-session <session-id>
  node scripts/supabaseAdmin.js delete-sim <session-id>
  node scripts/supabaseAdmin.js delete-all-sims
  node scripts/supabaseAdmin.js delete-hero <hero-id>
  node scripts/supabaseAdmin.js delete-hero-by-name <name>
  node scripts/supabaseAdmin.js count <table-name>
  node scripts/supabaseAdmin.js create-hero <name>
  node scripts/supabaseAdmin.js create-game <name>
  
Examples:
  node scripts/supabaseAdmin.js list-sims
  node scripts/supabaseAdmin.js get-session abc123
  node scripts/supabaseAdmin.js delete-sim abc123
  node scripts/supabaseAdmin.js delete-all-sims
  node scripts/supabaseAdmin.js count rank_sessions
  node scripts/supabaseAdmin.js create-hero "테스트영웅"
  node scripts/supabaseAdmin.js create-game "테스트게임"
`);
  process.exit(0);
}

async function main() {
  switch (command) {
    case 'list-sims':
      await listSimulations();
      break;

    case 'get-session':
      if (!arg1) {
        console.error('❌ Session ID required');
        process.exit(1);
      }
      await getSession(arg1);
      break;

    case 'delete-sim':
      if (!arg1) {
        console.error('❌ Session ID required');
        process.exit(1);
      }
      await deleteSimulation(arg1);
      break;

    case 'delete-all-sims':
      await deleteAllSimulations();
      break;

    case 'delete-hero':
      if (!arg1) {
        console.error('❌ Hero ID required');
        process.exit(1);
      }
      await deleteHero(arg1);
      break;

    case 'delete-hero-by-name':
      if (!arg1) {
        console.error('❌ Hero name required');
        process.exit(1);
      }
      await deleteHeroByName(arg1);
      break;

    case 'count':
      if (!arg1) {
        console.error('❌ Table name required');
        process.exit(1);
      }
      await countRecords(arg1);
      break;

    case 'create-hero':
      if (!arg1) {
        console.error('❌ Hero name required');
        process.exit(1);
      }
      await createTestHero(arg1);
      break;

    case 'create-game':
      if (!arg1) {
        console.error('❌ Game name required');
        process.exit(1);
      }
      await createTestGame(arg1);
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
