import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { rehydrateBattleSession } from '../../../lib/battle/session.js';
import { writeBattleDebugLog } from '../../../lib/battle/debugLog.js';
import { settleTextBattleSession } from '../../../lib/battle/textBattleSettlement.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function serializeSession(session) {
  return {
    id: session.id,
    status: session.status,
    actorId: session.actorId,
    currentTurnId: session.currentTurnId,
    turnIndex: session.turnIndex,
    values: session.values || {},
    logs: Array.isArray(session.logs) ? session.logs : [],
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
    definition: session.definition,
    participants: Array.isArray(session?.participants?.list) ? session.participants.list : [],
  };
}

function buildBootstrapSessionEffects(session) {
  return {
    session: serializeSession(session),
    participants: Array.isArray(session?.participants?.list) ? session.participants.list : [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    const viewer = authData?.user || null;
    if (authError || !viewer) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch {
        return res.status(400).json({ ok: false, error: 'invalid_payload' });
      }
    }

    const textSessionId = String(payload?.textSessionId || '').trim();
    const action = String(payload?.action || 'surrender').trim().toLowerCase();
    if (!textSessionId) {
      return res.status(400).json({ ok: false, error: 'missing_text_session_id' });
    }

    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from('text_battle_sessions')
      .select('*')
      .eq('id', textSessionId)
      .maybeSingle();

    if (sessionError) {
      return res.status(500).json({ ok: false, error: 'session_lookup_failed', detail: sessionError.message || null });
    }
    if (!sessionRow) {
      return res.status(404).json({ ok: false, error: 'session_not_found' });
    }
    if (sessionRow.owner_id !== viewer.id) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const { data: bootstrapTurn, error: bootstrapError } = await supabaseAdmin
      .from('text_battle_turns')
      .select('*')
      .eq('session_id', textSessionId)
      .eq('turn_index', -1)
      .eq('node_id', '__bootstrap__')
      .maybeSingle();

    if (bootstrapError) {
      return res.status(500).json({ ok: false, error: 'bootstrap_lookup_failed', detail: bootstrapError.message || null });
    }

    const session = rehydrateBattleSession(bootstrapTurn?.effects?.session || null);
    if (!session) {
      return res.status(400).json({ ok: false, error: 'invalid_runtime_session' });
    }

    const participants = Array.isArray(session?.participants?.list) ? session.participants.list : [];
    const surrendering = participants.find(participant => participant?.ownerId === viewer.id) || participants[0] || null;
    const winner = participants.find(participant => participant?.id !== surrendering?.id) || null;
    const now = Date.now();
    const nextSession = {
      ...session,
      status: 'completed',
      currentTurnId: '',
      updatedAt: now,
      values: {
        ...(session.values && typeof session.values === 'object' ? session.values : {}),
        battleWinner: winner?.heroId || winner?.name || null,
        battleEndReason: action === 'surrender' ? 'surrender' : 'completed',
        gameResult: 'ended',
        teamOutcomes:
          winner?.team && surrendering?.team
            ? {
                [winner.team]: 'win',
                [surrendering.team]: 'lose',
              }
            : {},
        participantOutcomes: {
          ...(winner?.id ? { [winner.id]: 'survived' } : {}),
          ...(surrendering?.id ? { [surrendering.id]: 'retired' } : {}),
        },
        battleScore: {
          outcome: action === 'surrender' ? 'surrender' : 'completed',
          winner: winner?.heroId || winner?.name || null,
          loser: surrendering?.heroId || surrendering?.name || null,
        },
      },
      logs: [
        ...(Array.isArray(session.logs) ? session.logs : []),
        {
          id: `finish-${now}`,
          turnId: '__system_finish__',
          actorId: surrendering?.id || session.actorId || '',
          resultKey: 'battleEndReason',
          input: action,
          result: action,
          display: action === 'surrender' ? '항복으로 전투가 종료되었습니다.' : '전투가 종료되었습니다.',
          createdAt: now,
        },
      ],
    };

    const settledScore = await settleTextBattleSession({
      session: nextSession,
      sessionRow,
      winnerParticipant: winner,
      loserParticipant: surrendering,
      reason: action === 'surrender' ? 'surrender' : 'completed',
    });
    nextSession.values.battleScore = settledScore;

    const { error: turnInsertError } = await supabaseAdmin.from('text_battle_turns').insert({
      session_id: textSessionId,
      turn_index: Number.isFinite(Number(session?.turnIndex)) ? Number(session.turnIndex) + 1 : 0,
      node_id: '__system_finish__',
      node_label: action === 'surrender' ? 'session-surrender' : 'session-finish',
      hero_id: surrendering?.heroId || null,
      rival_id: winner?.heroId || null,
      prompt: action,
      ai_response: action === 'surrender' ? '항복으로 전투가 종료되었습니다.' : '전투가 종료되었습니다.',
      result: action,
      battle_end: true,
      winner: winner?.heroId || winner?.name || null,
      effects: buildBootstrapSessionEffects(nextSession),
      score: nextSession.values?.battleScore || null,
      duration_ms: null,
    });

    if (turnInsertError) {
      return res.status(502).json({ ok: false, error: 'finish_turn_insert_failed', detail: turnInsertError.message || null });
    }

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('text_battle_sessions')
      .update({
        status: 'completed',
        winner: winner?.heroId || winner?.name || null,
        final_score: settledScore || null,
      })
      .eq('id', textSessionId);

    if (sessionUpdateError) {
      return res.status(502).json({ ok: false, error: 'finish_session_update_failed', detail: sessionUpdateError.message || null });
    }

    const { error: bootstrapUpdateError } = await supabaseAdmin
      .from('text_battle_turns')
      .update({
        effects: buildBootstrapSessionEffects(nextSession),
      })
      .eq('session_id', textSessionId)
      .eq('turn_index', -1)
      .eq('node_id', '__bootstrap__');

    if (bootstrapUpdateError) {
      return res.status(502).json({ ok: false, error: 'finish_bootstrap_update_failed', detail: bootstrapUpdateError.message || null });
    }

    await writeBattleDebugLog({
      scope: 'text-battle',
      eventType: 'finish-session',
      ownerId: viewer.id,
      textSessionId,
      heroId: surrendering?.heroId || null,
      status: action,
      payload: {
        action,
        winner: winner?.heroId || winner?.name || null,
        loser: surrendering?.heroId || surrendering?.name || null,
      },
    });

    return res.status(200).json({
      ok: true,
      session: serializeSession(nextSession),
      outcome: {
        action,
        winner: winner?.heroId || winner?.name || null,
        loser: surrendering?.heroId || surrendering?.name || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      detail: error?.message || String(error),
    });
  }
}
