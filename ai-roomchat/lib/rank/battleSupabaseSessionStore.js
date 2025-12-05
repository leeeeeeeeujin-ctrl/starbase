import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

function canUseSupabase() {
  try {
    return (
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!(process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY)
    );
  } catch {
    return false;
  }
}

function computeOutcomeLabel(result) {
  if (!result || typeof result !== 'object') return 'unknown';
  const draw = !!result.draw;
  const winners = Array.isArray(result.winners) ? result.winners : [];
  const losers = Array.isArray(result.losers) ? result.losers : [];

  if (draw) return 'draw';
  if (winners.length && !losers.length) return 'win';
  if (!winners.length && losers.length) return 'lose';
  if (winners.length && losers.length) return 'win';
  return 'unknown';
}

/**
 * Persist a session-scoped battle log snapshot into Supabase rank schema.
 *
 * Table: public.rank_session_battle_logs (see docs/rank-session-battle-log-spec.md)
 *
 * This helper is best-effort: failures are logged server-side but do not affect
 * the /api/rank/settle response.
 */
export async function storeSessionBattleLogToSupabase({
  sessionId,
  gameId,
  userId = null,
  battleLog,
  result,
}) {
  if (!sessionId || !gameId || !battleLog) {
    return { ok: false, reason: 'missing_fields' };
  }
  if (!canUseSupabase()) {
    return { ok: false, reason: 'supabase_disabled' };
  }

  const outcomeLabel = computeOutcomeLabel(result);
  const payload = {
    battleLog,
    result,
    meta: {
      sessionId,
      gameId,
      userId: userId || null,
    },
  };

  try {
    const row = {
      session_id: sessionId,
      game_id: gameId,
      owner_id: userId || null,
      result: outcomeLabel,
      reason: result?.reason || null,
      payload,
    };

    const { error } = await supabase
      .from('rank_session_battle_logs')
      .upsert(row, { onConflict: 'session_id' });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[storeSessionBattleLogToSupabase] upsert failed:', error);
      return { ok: false, reason: 'supabase_error' };
    }

    return { ok: true, backend: 'supabase' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storeSessionBattleLogToSupabase] unexpected error:', err);
    return { ok: false, reason: 'supabase_exception' };
  }
}

