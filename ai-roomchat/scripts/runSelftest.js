#!/usr/bin/env node
/**
 * 셀프테스트를 직접 실행하고 결과를 출력/저장하는 스크립트
 * 사용법: node scripts/runSelftest.js
 *
 * SECURITY NOTE:
 * This script requires a Supabase service-role key in environment
 * (SUPABASE_SERVICE_ROLE_KEY). Run only in trusted server environments.
 */

const path = require('path');
const fs = require('fs');

// .env.local 로드
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const {
  createRealSimulation,
  getRealSimulation,
  autoAdvanceRealSimulation,
  deleteRealSimulation,
} = require('../lib/realTableSimulator');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function runSelftest() {
  const steps = [];
  const t0 = Date.now();
  let sessionId = null;

  function pushStep(name, status, extra = {}) {
    const step = { name, status, durationMs: Date.now() - t0, ...extra };
    steps.push(step);
    const icon = status === 'ok' ? '✅' : '❌';
    console.log(`${icon} [${name}] ${status} (${step.durationMs}ms)`, extra.message || '');
    return step;
  }

  try {
    console.log('\n🚀 Starting selftest...\n');

    // 1) 데이터 조회
    const { data: games, error: gamesError } = await supabaseAdmin
      .from('rank_games')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);
    if (gamesError) throw gamesError;
    const game = (games && games[0]) || null;

    const { data: heroes, error: heroesError } = await supabaseAdmin
      .from('heroes')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(8);
    if (heroesError) throw heroesError;

    if (!game || !heroes || heroes.length < 2) {
      pushStep('fetch-data', 'fail', {
        reason: 'not_enough_data',
        games: games?.length || 0,
        heroes: heroes?.length || 0,
      });
      return { ok: false, steps };
    }

    pushStep('fetch-data', 'ok', {
      gameId: game.id,
      gameName: game.name,
      heroCount: heroes.length,
    });

    // 2) 생성
    const pickIds = heroes.slice(0, Math.min(4, heroes.length)).map(h => h.id);
    console.log(
      `\n📝 Creating simulation with heroes: ${heroes
        .slice(0, 4)
        .map(h => h.name)
        .join(', ')}`
    );
    const created = await createRealSimulation(supabaseAdmin, {
      gameId: game.id,
      mode: 'rank_solo',
      heroIds: pickIds,
      turnLimit: 5,
    });
    sessionId = created.sessionId;
    pushStep('create-session', 'ok', { sessionId });

    // 3) 초기 상세
    const detail1 = await getRealSimulation(supabaseAdmin, sessionId);
    pushStep('detail-initial', 'ok', {
      turn: detail1.session.turn,
      battles: (detail1.battles || []).length,
      slots: detail1.meta?.extras?.slots?.length || 0,
    });

    // 4) 자동 3턴
    console.log(`\n⚔️  Auto-advancing 3 turns...`);
    const results = await autoAdvanceRealSimulation(supabaseAdmin, sessionId, 3);
    pushStep('auto-advance', 'ok', { turns: results.length });

    // 각 턴 결과 출력
    results.forEach((turn, i) => {
      console.log(
        `   Turn ${i + 1}: ${turn.attackerName} → ${turn.defenderName} (damage: ${turn.damage})`
      );
    });

    // 5) 상세 재조회
    const detail2 = await getRealSimulation(supabaseAdmin, sessionId);
    pushStep('detail-after', 'ok', {
      turn: detail2.session.turn,
      battles: (detail2.battles || []).length,
    });

    // 6) 삭제
    console.log(`\n🗑️  Cleaning up...`);
    await deleteRealSimulation(supabaseAdmin, sessionId);
    pushStep('delete-session', 'ok');

    console.log('\n✅ Selftest completed successfully!\n');
    return { ok: true, steps };
  } catch (e) {
    console.error(`\n❌ Error: ${e.message}\n`);
    pushStep('error', 'fail', { message: e.message, stack: e.stack });

    // best-effort cleanup
    if (sessionId) {
      try {
        console.log(`🗑️  Attempting cleanup of session ${sessionId}...`);
        await deleteRealSimulation(supabaseAdmin, sessionId);
        console.log('   Cleanup successful');
      } catch (cleanupError) {
        console.error(`   Cleanup failed: ${cleanupError.message}`);
      }
    }
    return { ok: false, steps };
  }
}

// 메인 실행
runSelftest()
  .then(result => {
    // 로그 파일 저장
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `selftest-${timestamp}.json`);

    fs.writeFileSync(
      logPath,
      JSON.stringify(
        {
          ...result,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(`📄 Log saved: ${logPath}`);

    process.exit(result.ok ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
