import { supabase } from '@/lib/rank/db';
import {
  loadActiveRoles,
  loadQueueEntries,
  runMatching,
  markAssignmentsMatched,
} from '@/lib/rank/matchmakingService';
import { withTable } from '@/lib/supabaseTables';
import { recordMatchmakingLog, buildAssignmentSummary } from '@/lib/rank/matchmakingLogs';
import {
  extractMatchingToggles,
  findRealtimeDropInTarget,
  loadMatchingResources,
} from '@/lib/rank/matchingPipeline';

function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = parseBody(req);
  const { gameId, mode = 'rank_solo' } = body || {};
  if (!gameId) {
    return res.status(400).json({ error: 'missing_game_id' });
  }

  const requestId = `dropin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const debugEnabled =
    String(process.env.RANK_DEBUG_CONSOLE || '')
      .trim()
      .toLowerCase() === 'true';

  const logStage = async (overrides = {}) => {
    try {
      await recordMatchmakingLog(supabase, {
        game_id: gameId || overrides.game_id,
        mode,
        stage: overrides.stage || 'drop_in',
        status: overrides.status || 'pending',
        match_code: overrides.match_code || null,
        score_window: overrides.score_window ?? null,
        drop_in: true,
        metadata: {
          requestId,
          ...(overrides.metadata || {}),
        },
      });
    } catch (_) {
      // best-effort only
    }
  };

  try {
    // Load game toggles to decide realtime vs non-realtime drop-in path
    const { data: gameRow, error: gameError } = await withTable(supabase, 'rank_games', table =>
      supabase.from(table).select('id, realtime_match, rules').eq('id', gameId).single()
    );
    if (gameError) throw gameError;

    const rules = (() => {
      try {
        const raw = gameRow?.rules;
        if (!raw) return {};
        if (typeof raw === 'string') return JSON.parse(raw);
        if (typeof raw === 'object') return raw;
        return {};
      } catch {
        return {};
      }
    })();

    const toggles = extractMatchingToggles(gameRow, rules);

    if (toggles.realtimeEnabled && toggles.dropInEnabled) {
      // Realtime drop-in: claim open slot in an active room
      const { roles, queue } = await (async () => {
        const { roles, queue: queueResult } = await loadMatchingResources({
          supabase,
          gameId,
          mode,
          realtimeEnabled: true,
          brawlEnabled: false,
        });
        return { roles, queue: queueResult };
      })();

      const dropIn = await findRealtimeDropInTarget({
        supabase,
        gameId,
        mode,
        roles,
        queue,
        rules,
      });

      if (debugEnabled) {
        console.log('[drop-in] realtime attempt', {
          requestId,
          queueSize: Array.isArray(queue) ? queue.length : 0,
          candidates: dropIn?.meta?.candidates ?? 0,
          reason: dropIn?.meta?.reason || null,
        });
      }

      if (!dropIn || !dropIn.ready) {
        await logStage({
          stage: 'drop_in',
          status: dropIn?.missing ? 'missing_dependency' : 'pending',
          metadata: { meta: dropIn?.meta || null, mode, realtime: true },
        });
        return res.status(200).json({
          ready: false,
          error: dropIn?.meta?.reason || 'no_realtime_drop_in_target',
          meta: dropIn?.meta || null,
          requestId,
        });
      }

      await markAssignmentsMatched(supabase, {
        assignments: dropIn.assignments,
        gameId,
        mode,
        matchCode: dropIn.matchCode || dropIn.dropInTarget?.roomCode || null,
      });

      await logStage({
        stage: 'drop_in',
        status: 'matched',
        match_code: dropIn.matchCode || dropIn.dropInTarget?.roomCode || null,
        score_window: dropIn.maxWindow || null,
        metadata: {
          assignments: buildAssignmentSummary(dropIn.assignments),
          dropInTarget: dropIn.dropInTarget || null,
          mode,
          realtime: true,
        },
      });

      return res.status(200).json({
        ...dropIn,
        matchType: dropIn.matchType || 'drop_in',
        matchCode: dropIn.matchCode || dropIn.dropInTarget?.roomCode || null,
        requestId,
      });
    }

    // Non-realtime drop-in (stand-in refill next turn): use standard matcher against active roles
    const [roles, queue] = await Promise.all([
      loadActiveRoles(supabase, gameId),
      loadQueueEntries(supabase, { gameId, mode }),
    ]);

    const result = runMatching({ mode, roles, queue });

    if (!result.ready) {
      await logStage({
        stage: 'offline_drop_in',
        status: 'pending',
        score_window: result.maxWindow || null,
        metadata: {
          mode,
          realtime: false,
          assignments: buildAssignmentSummary(result.assignments || []),
        },
      });
      return res.status(200).json({
        ready: false,
        assignments: result.assignments || [],
        totalSlots: result.totalSlots,
        error: result.error || null,
        requestId,
      });
    }

    const matchCode = `dropin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await markAssignmentsMatched(supabase, {
      assignments: result.assignments,
      gameId,
      mode,
      matchCode,
    });

    await logStage({
      stage: 'offline_drop_in',
      status: 'matched',
      match_code: matchCode,
      score_window: result.maxWindow || null,
      metadata: {
        mode,
        realtime: false,
        assignments: buildAssignmentSummary(result.assignments || []),
      },
    });

    return res.status(200).json({
      ready: true,
      assignments: result.assignments,
      totalSlots: result.totalSlots,
      matchCode,
      matchType: 'offline_drop_in',
      requestId,
    });
  } catch (error) {
    console.error('drop-in failed:', { requestId, error });
    await logStage({
      stage: 'drop_in',
      status: 'error',
      metadata: { error: error?.message || String(error) },
    });
    return res.status(500).json({ error: 'drop_in_failed', message: error.message });
  }
}
