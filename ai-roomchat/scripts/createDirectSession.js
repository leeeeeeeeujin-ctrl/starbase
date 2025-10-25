#!/usr/bin/env node
/**
 * 매칭 우회 - 직접 세션 생성 테스트
 *
 * SECURITY NOTE:
 * This script uses a Supabase service-role key from environment variables
 * (SUPABASE_SERVICE_ROLE_KEY). Only run locally or in restricted server
 * environments. Do NOT expose the service-role key in client contexts or
 * unprotected CI workflows.
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

async function createDirectSession() {
  console.log('🎮 Creating game session directly (bypassing matching)...\n');

  try {
    // 1. 게임 정보 가져오기
    const { data: game, error: gameError } = await supabase
      .from('rank_games')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (gameError) throw gameError;
    console.log(`✅ Game: ${game.name} (${game.id})`);

    // 2. 영웅 가져오기
    const { data: heroes, error: heroesError } = await supabase
      .from('heroes')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(3);

    if (heroesError) throw heroesError;
    console.log(`✅ Heroes: ${heroes.map(h => h.name).join(', ')}`);

    // 3. 세션 생성
    const { data: session, error: sessionError } = await supabase
      .from('rank_sessions')
      .insert({
        game_id: game.id,
        mode: 'rank_solo',
        turn: 0,
        status: 'active',
      })
      .select()
      .single();

    if (sessionError) throw sessionError;
    console.log(`✅ Session created: ${session.id}`);

    // 4. 메타 생성 (슬롯 정보 포함)
    const slots = [
      {
        slot_no: 0,
        role: '공격',
        hero_ids: [heroes[0].id],
        hero_names: [heroes[0].name],
        score: 0,
        owner_id: null,
      },
      {
        slot_no: 1,
        role: '수비',
        hero_ids: [heroes[1].id],
        hero_names: [heroes[1].name],
        score: 0,
        owner_id: null,
      },
      {
        slot_no: 2,
        role: '수비',
        hero_ids: [heroes[2].id],
        hero_names: [heroes[2].name],
        score: 0,
        owner_id: null,
      },
    ];

    const { data: meta, error: metaError } = await supabase
      .from('rank_session_meta')
      .insert({
        session_id: session.id,
        extras: {
          simulation: true,
          slots,
          created_by: 'AI Direct Test',
          created_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (metaError) throw metaError;
    console.log(`✅ Meta created with ${slots.length} slots`);

    // 5. 배틀 로그 생성 (턴 1)
    const attacker = slots[0];
    const defender = slots[1];
    const damage = Math.floor(Math.random() * 30) + 20;

    const { data: battle, error: battleError } = await supabase
      .from('rank_battles')
      .insert({
        game_id: game.id,
        attacker_owner_id: attacker.owner_id,
        attacker_hero_ids: attacker.hero_ids,
        defender_owner_id: defender.owner_id,
        defender_hero_ids: defender.hero_ids,
        result: 'success',
        score_delta: damage,
      })
      .select()
      .single();

    if (battleError) throw battleError;
    console.log(`✅ Battle created: ${attacker.hero_names[0]} vs ${defender.hero_names[0]}`);

    const { data: log, error: logError } = await supabase
      .from('rank_battle_logs')
      .insert({
        battle_id: battle.id,
        game_id: game.id,
        turn_no: 1,
        prompt: `Attack: ${attacker.hero_names[0]} vs ${defender.hero_names[0]}`,
        ai_response: `${attacker.hero_names[0]}이(가) ${defender.hero_names[0]}에게 ${damage} 데미지를 입혔습니다!`,
        meta: {
          session_id: session.id,
          damage,
          attacker: attacker.hero_names[0],
          defender: defender.hero_names[0],
        },
      })
      .select()
      .single();

    if (logError) throw logError;
    console.log(`✅ Battle log created`);

    // 6. 턴 업데이트
    const { error: updateError } = await supabase
      .from('rank_sessions')
      .update({ turn: 1 })
      .eq('id', session.id);

    if (updateError) throw updateError;
    console.log(`✅ Turn updated to 1`);

    console.log(`\n🎉 Game session created successfully!`);
    console.log(`📍 Session ID: ${session.id}`);
    console.log(`\n💡 Check Supabase Dashboard:`);
    console.log(`   - rank_sessions table`);
    console.log(`   - rank_session_meta table`);
    console.log(`   - rank_battles table`);
    console.log(`   - rank_battle_logs table`);

    return session.id;
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  }
}

createDirectSession()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
