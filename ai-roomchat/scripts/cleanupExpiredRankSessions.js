#!/usr/bin/env node

/**
 * Small CLI helper to invoke the cleanup_expired_rank_sessions RPC.
 *
 * Usage:
 *   node scripts/cleanupExpiredRankSessions.js
 *   node scripts/cleanupExpiredRankSessions.js --cutoff=120 --limit=200
 *
 * This does not run automatically; wire it into your scheduler or run manually.
 */

async function loadSupabaseAdmin() {
  // lib/supabaseAdmin.js is an ES module; use dynamic import to bridge from CJS.
  // eslint-disable-next-line global-require
  const mod = await import('../lib/supabaseAdmin.js');
  return mod.supabaseAdmin || mod.supabase || mod.default || null;
}

function parseArgs(argv) {
  const out = {
    cutoffMinutes: 1440,
    batchLimit: 500,
  };

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, rawVal] = arg.slice(2).split('=');
    if (!key) continue;
    const val = rawVal !== undefined ? rawVal : '';
    if (key === 'cutoff' || key === 'cutoffMinutes') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) out.cutoffMinutes = Math.floor(n);
    } else if (key === 'limit' || key === 'batchLimit') {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) out.batchLimit = Math.floor(n);
    }
  }

  return out;
}

async function main() {
  const supabaseAdmin = await loadSupabaseAdmin();

  const { cutoffMinutes, batchLimit } = parseArgs(process.argv.slice(2));

  /* eslint-disable no-console */
  console.log(
    '[cleanupExpiredRankSessions] 시작',
    JSON.stringify({ cutoffMinutes, batchLimit })
  );

  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    console.error(
      '[cleanupExpiredRankSessions] supabaseAdmin 사용 불가 - SUPABASE env 설정을 확인하세요.'
    );
    process.exitCode = 1;
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_rank_sessions', {
      p_cutoff_minutes: cutoffMinutes,
      p_batch_limit: batchLimit,
    });

    if (error) {
      console.error('[cleanupExpiredRankSessions] RPC 호출 실패:', error);
      process.exitCode = 1;
      return;
    }

    const affected = Array.isArray(data) ? data.length : 0;
    console.log(
      `[cleanupExpiredRankSessions] 완료 - ${affected}개 세션 상태를 'aborted'로 업데이트했습니다.`
    );
    if (affected && Array.isArray(data)) {
      const sample = data.slice(0, 5);
      console.log('[cleanupExpiredRankSessions] 예시:', sample);
    }
  } catch (err) {
    console.error('[cleanupExpiredRankSessions] 예외 발생:', err);
    process.exitCode = 1;
  }
}

main();
