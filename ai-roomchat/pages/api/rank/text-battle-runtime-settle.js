import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import {
  toTextBattleSessionRow,
  toTextBattleTurnRow,
} from '@/lib/runtime/textBattlePersistence';

function requireJson(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Optional simple auth gate, aligned with other rank APIs.
  const apiKey = process.env.RANK_API_KEY || null;
  if (apiKey) {
    const provided = req.headers['x-api-key'];
    if (!provided || provided !== apiKey) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  const payload = requireJson(req);

  const sessionId =
    payload.sessionId ||
    payload.session_id ||
    null;
  const gameId =
    payload.gameId ||
    payload.game_id ||
    null;

  const events = Array.isArray(payload.events) ? payload.events : [];
  const participants =
    payload.participants && typeof payload.participants === 'object'
      ? payload.participants
      : {};
  const variables =
    payload.variables && typeof payload.variables === 'object'
      ? payload.variables
      : {};

  if (!sessionId || !gameId || !events.length) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_payload',
      message: 'sessionId, gameId, events 가 필요합니다.',
    });
  }

  if (!supabase || typeof supabase.from !== 'function') {
    return res.status(503).json({
      ok: false,
      error: 'supabase_unavailable',
    });
  }

  try {
    const sessionRow = toTextBattleSessionRow({
      externalId: sessionId,
      ownerId: payload.ownerId || payload.owner_id || null,
      promptSetId: payload.promptSetId || payload.prompt_set_id || null,
      gameName: payload.gameName || payload.game_name || null,
      variables,
    });

    const { data: inserted, error: insertError } = await supabase
      .from('text_battle_sessions')
      .insert(sessionRow)
      .select('id')
      .limit(1)
      .single();

    if (insertError) {
      return res.status(502).json({
        ok: false,
        error: 'session_insert_failed',
        supabaseError: {
          code: insertError.code || null,
          message: insertError.message || null,
          details: insertError.details || null,
          hint: insertError.hint || null,
        },
      });
    }

    const textSessionId = inserted?.id || null;
    if (!textSessionId) {
      return res.status(502).json({
        ok: false,
        error: 'session_insert_missing_id',
      });
    }

    // Map runtime turn-log events into text_battle_turns rows.
    const turns = events.map((ev, index) => {
      const ctx = {
        node: {
          id: ev.nodeId ?? ev.node_id ?? null,
          label: ev.nodeLabel ?? ev.node_label ?? null,
        },
        variables: ev.variables || null,
      };

      return toTextBattleTurnRow({
        sessionId: textSessionId,
        turnIndex:
          typeof ev.turn === 'number' && Number.isFinite(ev.turn)
            ? ev.turn
            : index,
        ctx,
        durationMs:
          typeof ev.durationMs === 'number' && Number.isFinite(ev.durationMs)
            ? ev.durationMs
            : null,
        heroId: null,
        rivalId: null,
      });
    });

    if (turns.length) {
      const { error: turnsError } = await supabase
        .from('text_battle_turns')
        .insert(turns);

      if (turnsError) {
        return res.status(502).json({
          ok: false,
          error: 'turns_insert_failed',
          supabaseError: {
            code: turnsError.code || null,
            message: turnsError.message || null,
            details: turnsError.details || null,
            hint: turnsError.hint || null,
          },
        });
      }
    }

    return res.status(200).json({
      ok: true,
      textBattleSessionId: textSessionId,
      session: sessionRow,
      participants,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: String(e?.message || e),
    });
  }
}

