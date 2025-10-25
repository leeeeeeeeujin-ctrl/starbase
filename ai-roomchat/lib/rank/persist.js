// lib/rank/persist.js
import { supabase } from './db';

const PARTICIPANT_UPDATE_RETRIES = 4;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function coerceUuidArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => item).filter(Boolean);
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function resolveStatus(outcome, perspective) {
  if (perspective === 'defender') {
    if (outcome === 'win') return 'defeated';
    if (outcome === 'lose') return 'victory';
    return 'active';
  }

  if (outcome === 'win') return 'victory';
  if (outcome === 'lose') return 'defeated';
  return 'active';
}

function normalizeTurnLogs({
  turnLogs,
  fallbackPrompt,
  fallbackResponse,
  outcome,
  gameId,
  battleId,
}) {
  const fallbackEntry = {
    game_id: gameId,
    battle_id: battleId,
    turn_no: 1,
    prompt: fallbackPrompt || '',
    ai_response: fallbackResponse || '',
    meta: { outcome },
  };

  if (!Array.isArray(turnLogs) || turnLogs.length === 0) {
    return [fallbackEntry];
  }

  const seenTurns = new Set();
  const rows = [];

  turnLogs.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;

    const rawTurn = entry.turn_no ?? entry.turnNo ?? entry.index ?? index + 1;
    let turnNo = coerceNumber(rawTurn, index + 1);
    while (seenTurns.has(turnNo) || turnNo <= 0) {
      turnNo += 1;
    }
    seenTurns.add(turnNo);

    const prompt = typeof entry.prompt === 'string' ? entry.prompt : fallbackPrompt || '';
    const response =
      typeof entry.ai_response === 'string'
        ? entry.ai_response
        : typeof entry.aiResponse === 'string'
          ? entry.aiResponse
          : fallbackResponse || '';

    let meta = entry.meta;
    if (!meta || typeof meta !== 'object') {
      meta = { outcome };
    } else if (!('outcome' in meta)) {
      meta = { ...meta, outcome };
    }

    rows.push({
      game_id: gameId,
      battle_id: battleId,
      turn_no: turnNo,
      prompt,
      ai_response: response,
      meta,
    });
  });

  if (!rows.length) {
    return [fallbackEntry];
  }

  return rows.sort((a, b) => a.turn_no - b.turn_no);
}

function mergeHeroIds(existing, incoming) {
  const merged = new Set();
  if (Array.isArray(existing)) {
    existing.filter(Boolean).forEach(value => merged.add(value));
  }
  if (Array.isArray(incoming)) {
    incoming.filter(Boolean).forEach(value => merged.add(value));
  }
  return Array.from(merged);
}

async function applyParticipantOutcome({
  gameId,
  ownerId,
  heroIds,
  primaryHeroId,
  delta = 0,
  status = 'active',
  now,
}) {
  if (!gameId || !ownerId) return;

  const heroArray = coerceUuidArray(heroIds);
  const heroId = primaryHeroId || heroArray[0] || null;

  let attempt = 0;
  let lastError = null;

  while (attempt < PARTICIPANT_UPDATE_RETRIES) {
    attempt += 1;

    const { data: existing, error: fetchError } = await supabase
      .from('rank_participants')
      .select('id, hero_id, hero_ids, rating, score, battles, status, updated_at, created_at')
      .eq('game_id', gameId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const baseRating = coerceNumber(existing?.rating, 1000);
    const baseScore = coerceNumber(existing?.score, baseRating);
    const baseBattles = coerceNumber(existing?.battles, 0);
    const mergedHeroIds = mergeHeroIds(existing?.hero_ids ?? existing?.heroIds, heroArray);

    const payload = {
      hero_id: heroId || existing?.hero_id || null,
      hero_ids: mergedHeroIds,
      rating: baseRating + delta,
      score: baseScore + delta,
      battles: baseBattles + 1,
      status,
      updated_at: now,
    };

    if (existing?.id) {
      let query = supabase
        .from('rank_participants')
        .update(payload)
        .eq('game_id', gameId)
        .eq('owner_id', ownerId);

      if (existing.updated_at) {
        query = query.eq('updated_at', existing.updated_at);
      } else {
        query = query.is('updated_at', null);
      }

      const { data: updatedRows, error: updateError } = await query.select('id');
      if (updateError) {
        lastError = updateError;
        if (updateError.code === '23505') {
          await sleep(25);
          continue;
        }
        throw updateError;
      }

      if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        return;
      }

      await sleep(25);
      continue;
    }

    const insertPayload = {
      game_id: gameId,
      owner_id: ownerId,
      hero_id: heroId,
      hero_ids: mergedHeroIds,
      rating: baseRating + delta,
      score: baseScore + delta,
      battles: baseBattles + 1,
      status,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await supabase
      .from('rank_participants')
      .insert(insertPayload, { defaultToNull: false });

    if (!insertError) {
      return;
    }

    lastError = insertError;
    if (insertError.code === '23505') {
      await sleep(25);
      continue;
    }

    throw insertError;
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('participant_update_conflict');
}

export async function recordBattle({
  game,
  userId,
  myHeroIds,
  oppOwnerIds,
  oppHeroIds,
  outcome,
  delta,
  prompt,
  aiText,
  turnLogs,
}) {
  const attackerHeroIds = coerceUuidArray(myHeroIds);
  const defenderHeroIds = coerceUuidArray(oppHeroIds);
  const defenderOwners = Array.isArray(oppOwnerIds) ? oppOwnerIds.filter(Boolean) : [];
  const numericDelta = coerceNumber(delta, 0);
  const now = new Date().toISOString();

  const { data: battle, error: battleError } = await supabase
    .from('rank_battles')
    .insert({
      game_id: game.id,
      attacker_owner_id: userId,
      attacker_hero_ids: attackerHeroIds,
      defender_owner_id: defenderOwners[0] || null,
      defender_hero_ids: defenderHeroIds,
      result: outcome,
      score_delta: numericDelta,
      hidden: false,
      created_at: now,
    })
    .select()
    .single();

  if (battleError) throw battleError;

  const logsPayload = normalizeTurnLogs({
    turnLogs,
    fallbackPrompt: prompt,
    fallbackResponse: aiText,
    outcome,
    gameId: game.id,
    battleId: battle.id,
  });

  const { error: logsError } = await supabase.from('rank_battle_logs').insert(logsPayload);
  if (logsError) throw logsError;

  const attackerStatus = resolveStatus(outcome, 'attacker');
  await applyParticipantOutcome({
    gameId: game.id,
    ownerId: userId,
    heroIds: attackerHeroIds,
    primaryHeroId: attackerHeroIds[0] || null,
    delta: numericDelta,
    status: attackerStatus,
    now,
  });

  const defenderStatus = resolveStatus(outcome, 'defender');
  const defenderDelta = Number.isFinite(numericDelta) ? -numericDelta : 0;
  if (defenderOwners.length) {
    const defenderPairs = defenderOwners.map((ownerId, index) => ({
      ownerId,
      heroId: defenderHeroIds[index] || defenderHeroIds[0] || null,
    }));

    for (const { ownerId, heroId } of defenderPairs) {
      await applyParticipantOutcome({
        gameId: game.id,
        ownerId,
        heroIds: defenderHeroIds,
        primaryHeroId: heroId,
        delta: defenderDelta,
        status: defenderStatus,
        now,
      });
    }
  }

  return {
    battleId: battle.id,
    attackerStatus,
    defenderStatus,
    defenderOwners,
  };
}
