import { createClient } from '@supabase/supabase-js';

import {
  buildTurnPromptContext,
  createBattleSession,
  getCurrentTurn,
  resolveTurnActorId,
  submitBattleTurn,
} from '@/lib/battle/session';
import { buildRuntimePromptFromTurn } from '@/lib/battle/agentRuntime';
import { toTextBattleTurnRow } from '@/lib/runtime/textBattlePersistence';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';
import { writeBattleDebugLog } from '@/lib/battle/debugLog';
import { settleTextBattleSession } from '@/lib/battle/textBattleSettlement';
import {
  applyBattleResultToValues,
  parseStructuredBattleResult,
} from '@/lib/battle/resultSchema';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for text-battle run-turn API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function normalizeSessionPayload(session = {}) {
  const participants = Array.isArray(session?.participants?.list)
    ? session.participants.list
    : Array.isArray(session?.participants)
      ? session.participants
      : [];

  const definition = session?.definition && typeof session.definition === 'object' ? session.definition : null;
  const rebuilt = createBattleSession({
    definition,
    participants,
    sessionId: session?.id || '',
    actorId: session?.actorId || '',
    values: session?.values && typeof session.values === 'object' ? session.values : {},
  });

  return {
    ...rebuilt,
    status: session?.status || rebuilt.status,
    currentTurnId: session?.currentTurnId || rebuilt.currentTurnId,
    turnIndex: Number.isFinite(Number(session?.turnIndex)) ? Number(session.turnIndex) : rebuilt.turnIndex,
    logs: Array.isArray(session?.logs) ? session.logs : [],
    createdAt: session?.createdAt || rebuilt.createdAt,
    updatedAt: session?.updatedAt || rebuilt.updatedAt,
  };
}

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

function buildSessionUpdateRow(session) {
  const winner = session?.values?.battleWinner || null;
  const finalScore = session?.values?.battleScore || null;
  return {
    status: winner || session?.status === 'completed' ? 'completed' : 'active',
    winner,
    final_score: finalScore && typeof finalScore === 'object' ? finalScore : null,
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
      } catch (error) {
        return res.status(400).json({ ok: false, error: 'invalid_payload' });
      }
    }

    const session = normalizeSessionPayload(payload?.session || {});
    const actorId =
      (typeof payload?.actorId === 'string' && payload.actorId.trim()) ||
      session.actorId ||
      '';
    const input =
      typeof payload?.input === 'string' || typeof payload?.input === 'number'
        ? String(payload.input)
        : null;
    const textSessionId =
      (typeof payload?.textSessionId === 'string' && payload.textSessionId.trim()) || null;

    const currentTurn = getCurrentTurn(session);
    if (!currentTurn) {
      return res.status(409).json({ ok: false, error: 'turn_not_found' });
    }

    const resolvedActorId = resolveTurnActorId(session, currentTurn, actorId);
    const promptContext = buildTurnPromptContext(session, currentTurn, resolvedActorId);
    const { agentContexts, runtimePrompt } = buildRuntimePromptFromTurn(
      session,
      currentTurn,
      resolvedActorId
    );

    const parsedResult = parseStructuredBattleResult(payload?.result || null);
    const valuesPatch = applyBattleResultToValues(session?.values || {}, parsedResult);

    const nextSession = submitBattleTurn(session, {
      actorId: resolvedActorId,
      input,
      result: payload?.result || null,
      rawResult: parsedResult.raw,
      reply: parsedResult.reply,
      gameResult: parsedResult.gameResult,
      teamOutcomes: parsedResult.teamOutcomes,
      participantOutcomes: parsedResult.participantOutcomes,
      valuesPatch,
    });

    if (textSessionId) {
      const { data: sessionRow, error: sessionLookupError } = await supabaseAdmin
        .from('text_battle_sessions')
        .select('*')
        .eq('id', textSessionId)
        .maybeSingle();

      if (sessionLookupError) {
        return res.status(502).json({
          ok: false,
          error: 'text_session_lookup_failed',
          detail: sessionLookupError.message || null,
        });
      }

      if (nextSession?.status === 'completed') {
        const participants = Array.isArray(nextSession?.participants?.list)
          ? nextSession.participants.list
          : [];
        const winnerHeroId = nextSession?.values?.battleWinner || null;
        const winnerParticipant =
          participants.find(participant => participant?.heroId === winnerHeroId || participant?.id === winnerHeroId) ||
          null;
        const loserParticipant =
          participants.find(participant => participant?.id !== winnerParticipant?.id) || null;
        const settledScore = await settleTextBattleSession({
          session: nextSession,
          sessionRow,
          winnerParticipant,
          loserParticipant,
          reason: 'completed',
        });
        nextSession.values = {
          ...(nextSession.values && typeof nextSession.values === 'object' ? nextSession.values : {}),
          battleScore: settledScore,
        };
      }

      const turnRow = toTextBattleTurnRow({
        sessionId: textSessionId,
        turnIndex: Number.isFinite(Number(session?.turnIndex)) ? Number(session.turnIndex) : 0,
        ctx: {
          node: {
            id: currentTurn.id,
            label: currentTurn.title || currentTurn.id,
          },
          variables: {
            lastPrompt: runtimePrompt,
            aiResponseRaw: parsedResult.reply || payload?.result || null,
            battleLast: {
              result: parsedResult.reply || payload?.result || null,
              narrative: parsedResult.reply || payload?.result || null,
              battleEnd:
                nextSession?.status === 'completed' ||
                ['ended', 'abandoned', 'timed_out'].includes(
                  String(parsedResult?.gameResult || '').toLowerCase()
                ),
              winner: nextSession?.values?.battleWinner || null,
            },
          },
        },
        heroId: agentContexts[0]?.heroId || null,
        rivalId: agentContexts[1]?.heroId || null,
      });

      const { error: turnInsertError } = await supabaseAdmin
        .from('text_battle_turns')
        .insert(turnRow);

      if (turnInsertError) {
        return res.status(502).json({
          ok: false,
          error: 'text_turn_insert_failed',
          detail: turnInsertError.message || null,
        });
      }

      const { error: sessionUpdateError } = await supabaseAdmin
        .from('text_battle_sessions')
        .update(buildSessionUpdateRow(nextSession))
        .eq('id', textSessionId);

      if (sessionUpdateError) {
        return res.status(502).json({
          ok: false,
          error: 'text_session_update_failed',
          detail: sessionUpdateError.message || null,
        });
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
        return res.status(502).json({
          ok: false,
          error: 'text_session_bootstrap_update_failed',
          detail: bootstrapUpdateError.message || null,
        });
      }
    }

    await writeBattleDebugLog({
      scope: 'text-battle',
      eventType: 'run-turn',
      ownerId: viewer.id,
      heroId: agentContexts?.[0]?.heroId || null,
      textSessionId,
      status: nextSession?.status || 'active',
      payload: {
        actorId: resolvedActorId,
        turnIndex: Number.isFinite(Number(session?.turnIndex)) ? Number(session.turnIndex) : 0,
        nodeId: currentTurn?.id || null,
        nodeTitle: currentTurn?.title || null,
        input: input || null,
        parsedGameResult: parsedResult.gameResult || null,
        parsedTeamOutcomes: parsedResult.teamOutcomes || {},
        parsedParticipantOutcomes: parsedResult.participantOutcomes || {},
        nextTurnId: nextSession?.currentTurnId || null,
        valueKeys: Object.keys(nextSession?.values || {}),
        participantCount: Array.isArray(session?.participants?.list)
          ? session.participants.list.length
          : Array.isArray(session?.participants)
            ? session.participants.length
            : 0,
      },
    });

    return res.status(200).json({
      ok: true,
      currentTurn,
      promptContext,
      agentContexts,
      runtimePrompt,
      session: serializeSession(nextSession),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      detail: error?.message || String(error),
    });
  }
}
