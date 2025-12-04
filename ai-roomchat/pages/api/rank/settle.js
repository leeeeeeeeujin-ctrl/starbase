import { buildLogFromRuntime, normalizeBattleOutcome } from '../../lib/runtime/battleLogHelpers';
import { storeBattleHistory } from '../../lib/rank/battleHistoryStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Simple auth gate (placeholder): require x-api-key header for now.
  const apiKey = process.env.RANK_API_KEY || null;
  if (apiKey) {
    const provided = req.headers['x-api-key'];
    if (!provided || provided !== apiKey) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  // Accept either a pre-built battleLog or raw runtime events + participants.
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const hasBattleLog = payload && typeof payload === 'object' && payload.battleLog;
  const rawLog = hasBattleLog ? payload.battleLog : payload;

  // Basic required identifiers
  const sessionId = rawLog.sessionId || rawLog.session_id || payload.sessionId || payload.session_id;
  const gameId = rawLog.gameId || rawLog.game_id || payload.gameId || payload.game_id;
  if (!sessionId || !gameId) {
    return res.status(400).json({
      ok: false,
      error: 'missing_ids',
      message: 'sessionId and gameId are required for settlement',
    });
  }

  const events = Array.isArray(rawLog?.events) ? rawLog.events : [];
  if (!events.length) {
    return res.status(400).json({
      ok: false,
      error: 'missing_events',
      message: 'battleLog must include events array',
    });
  }

  const participants = rawLog?.participants && typeof rawLog.participants === 'object'
    ? rawLog.participants
    : {};
  const outcome = normalizeBattleOutcome(rawLog?.outcome || {});
  const scoreboard = rawLog?.scoreboard && typeof rawLog.scoreboard === 'object'
    ? rawLog.scoreboard
    : null;
  const meta = rawLog?.meta && typeof rawLog.meta === 'object' ? rawLog.meta : {};

  const normalizedLog = buildLogFromRuntime({
    events,
    participants,
    outcome,
    scoreboard,
    meta,
  });

  // Try to load workspace score script if present.
  let scoreResult = null;
  try {
    // Load from workspace/score/score-default.js (user can replace with custom script path).
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const scoreFn = require('../../../workspace/score/score-default.js');
    if (typeof scoreFn === 'function') {
      scoreResult = scoreFn({
        battleLog: normalizedLog,
        participants,
        meta: { sessionId, gameId },
      });
    }
  } catch (err) {
    // If score script missing or fails, continue with default.
    scoreResult = null;
  }

  // Fallback basic scoring: winners from outcome.winners, scores passthrough.
  const fallbackScores =
    normalizedLog.scoreboard ||
    normalizedLog.outcome?.scores ||
    {};
  const winnersFromOutcome = Array.isArray(normalizedLog.outcome?.winners)
    ? normalizedLog.outcome.winners
    : [];
  const losersFromOutcome = Array.isArray(normalizedLog.outcome?.losers)
    ? normalizedLog.outcome.losers
    : [];

  const finalResult = scoreResult || {
    scores: fallbackScores,
    winners: winnersFromOutcome,
    losers: losersFromOutcome,
    draw: !!normalizedLog.outcome?.draw,
    highlightIds: normalizedLog.highlightIds || [],
    meta: { sessionId, gameId },
  };

  await storeBattleHistory({
    sessionId,
    gameId,
    userId:
      req.headers['x-user-id'] ||
      payload.userId ||
      payload.user_id ||
      null,
    battleLog: normalizedLog,
    result: finalResult,
  });

  return res.status(200).json({
    ok: true,
    battleLog: normalizedLog,
    result: finalResult,
    meta: { sessionId, gameId },
    receivedAt: Date.now(),
  });
}
