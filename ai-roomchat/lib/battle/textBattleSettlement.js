import { supabaseAdmin } from '@/lib/supabaseAdmin';

function toId(value) {
  return value == null ? '' : String(value).trim();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildZeroSumDelta(outcome, reason) {
  if (outcome !== 'win' && outcome !== 'lose') {
    return { attacker: 0, defender: 0 };
  }

  let base = 10;
  if (reason === 'surrender') {
    base = 8;
  } else if (reason === 'abandoned' || reason === 'timed_out') {
    base = 0;
  }

  if (outcome === 'win') {
    return { attacker: base, defender: -base };
  }
  return { attacker: -base, defender: base };
}

function normalizeTurnLogs(session = {}, gameId, battleId, outcome) {
  const logs = Array.isArray(session?.logs) ? session.logs : [];
  if (!logs.length) {
    return [
      {
        game_id: gameId,
        battle_id: battleId,
        turn_no: 1,
        prompt: typeof session?.definition?.name === 'string' ? session.definition.name : 'text-battle',
        ai_response:
          typeof session?.values?.battleEndReason === 'string'
            ? session.values.battleEndReason
            : outcome,
        meta: { outcome },
      },
    ];
  }

  return logs.map((entry, index) => ({
    game_id: gameId,
    battle_id: battleId,
    turn_no: Number.isFinite(Number(entry?.turnIndex)) ? Number(entry.turnIndex) + 1 : index + 1,
    prompt:
      typeof entry?.promptTemplate === 'string' && entry.promptTemplate.trim()
        ? entry.promptTemplate
        : typeof entry?.display === 'string'
          ? entry.display
          : '',
    ai_response:
      typeof entry?.result === 'string'
        ? entry.result
        : entry?.result != null
          ? JSON.stringify(entry.result)
          : '',
    meta: {
      outcome,
      turnId: entry?.turnId || null,
      actorId: entry?.actorId || null,
      kind: entry?.kind || null,
      title: entry?.title || null,
    },
  }));
}

function resolveParticipantStatus(outcome, side) {
  if (outcome === 'draw') return 'active';
  if (side === 'attacker') {
    return outcome === 'win' ? 'victory' : 'defeated';
  }
  return outcome === 'win' ? 'defeated' : 'victory';
}

function resolveStatusFromOutcome(outcome = '') {
  const normalized = toId(outcome).toLowerCase();
  if (normalized === 'survived' || normalized === 'win' || normalized === 'victory') return 'victory';
  if (normalized === 'eliminated') return 'eliminated';
  if (normalized === 'retired') return 'retired';
  if (normalized === 'lose' || normalized === 'defeated') return 'defeated';
  return 'active';
}

async function upsertParticipantOutcome({
  gameId,
  ownerId,
  heroId,
  delta,
  status,
}) {
  if (!gameId || !ownerId || !heroId) return;

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('rank_participants')
    .select('id, hero_id, hero_ids, rating, score, battles')
    .eq('game_id', gameId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload = {
    hero_id: heroId,
    hero_ids: Array.from(
      new Set(
        [heroId]
          .concat(Array.isArray(existing?.hero_ids) ? existing.hero_ids : [])
          .filter(Boolean)
      )
    ),
    rating: toNumber(existing?.rating, 1000) + delta,
    score: toNumber(existing?.score, toNumber(existing?.rating, 1000)) + delta,
    battles: toNumber(existing?.battles, 0) + 1,
    status,
    updated_at: now,
  };

  if (existing?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('rank_participants')
      .update(payload)
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('rank_participants')
    .insert({
      game_id: gameId,
      owner_id: ownerId,
      created_at: now,
      ...payload,
    });
  if (insertError) throw insertError;
}

function buildSettlementPayload({ session, winnerParticipant, loserParticipant, reason }) {
  const participants = Array.isArray(session?.participants?.list) ? session.participants.list : [];
  if (participants.length !== 2) return null;

  const gameId = toId(session?.values?.gameId);
  const attacker = participants[0] || null;
  const defender = participants[1] || null;

  if (!gameId || !attacker?.ownerId || !attacker?.heroId || !defender?.ownerId || !defender?.heroId) {
    return null;
  }

  const teamOutcomes = toObject(session?.values?.teamOutcomes);
  const participantOutcomes = toObject(session?.values?.participantOutcomes);
  const attackerOutcome =
    participantOutcomes[attacker.id] ||
    participantOutcomes[attacker.heroId] ||
    participantOutcomes[attacker.ownerId] ||
    '';
  const defenderOutcome =
    participantOutcomes[defender.id] ||
    participantOutcomes[defender.heroId] ||
    participantOutcomes[defender.ownerId] ||
    '';
  const attackerTeamOutcome = attacker?.team ? teamOutcomes[attacker.team] || '' : '';
  const defenderTeamOutcome = defender?.team ? teamOutcomes[defender.team] || '' : '';
  const winnerHeroId = toId(winnerParticipant?.heroId);
  const loserHeroId = toId(loserParticipant?.heroId);
  let outcome = 'draw';

  if (toId(attackerTeamOutcome).toLowerCase() === 'win' && toId(defenderTeamOutcome).toLowerCase() === 'lose') {
    outcome = 'win';
  } else if (toId(attackerTeamOutcome).toLowerCase() === 'lose' && toId(defenderTeamOutcome).toLowerCase() === 'win') {
    outcome = 'lose';
  } else if (
    ['survived', 'win', 'victory'].includes(toId(attackerOutcome).toLowerCase()) &&
    ['eliminated', 'retired', 'lose', 'defeated'].includes(toId(defenderOutcome).toLowerCase())
  ) {
    outcome = 'win';
  } else if (
    ['survived', 'win', 'victory'].includes(toId(defenderOutcome).toLowerCase()) &&
    ['eliminated', 'retired', 'lose', 'defeated'].includes(toId(attackerOutcome).toLowerCase())
  ) {
    outcome = 'lose';
  } else if (winnerHeroId && loserHeroId) {
    outcome = winnerHeroId === toId(attacker.heroId) ? 'win' : 'lose';
  }

  const delta = buildZeroSumDelta(outcome, reason);

  return {
    gameId,
    attacker,
    defender,
    outcome,
    delta,
    attackerStatus: attackerOutcome ? resolveStatusFromOutcome(attackerOutcome) : resolveParticipantStatus(outcome, 'attacker'),
    defenderStatus: defenderOutcome ? resolveStatusFromOutcome(defenderOutcome) : resolveParticipantStatus(outcome, 'defender'),
  };
}

export async function settleTextBattleSession({ session, sessionRow, winnerParticipant, loserParticipant, reason }) {
  const existingFinalScore =
    sessionRow?.final_score && typeof sessionRow.final_score === 'object' ? sessionRow.final_score : {};
  if (existingFinalScore?.settledAt) {
    return existingFinalScore;
  }

  const baseScore =
    session?.values?.battleScore && typeof session.values.battleScore === 'object'
      ? { ...session.values.battleScore }
      : {};

  const settlement = buildSettlementPayload({
    session,
    winnerParticipant,
    loserParticipant,
    reason,
  });

  if (!settlement) {
    return {
      ...baseScore,
      settledAt: new Date().toISOString(),
      settlement: 'skipped',
      reason: reason || 'completed',
    };
  }

  const now = new Date().toISOString();
  const { data: battleRow, error: battleError } = await supabaseAdmin
    .from('rank_battles')
    .insert({
      game_id: settlement.gameId,
      attacker_owner_id: settlement.attacker.ownerId,
      attacker_hero_ids: [settlement.attacker.heroId],
      defender_owner_id: settlement.defender.ownerId,
      defender_hero_ids: [settlement.defender.heroId],
      result: settlement.outcome,
      score_delta: settlement.delta,
      hidden: false,
      created_at: now,
    })
    .select('id')
    .single();

  if (battleError) {
    throw battleError;
  }

  const logs = normalizeTurnLogs(session, settlement.gameId, battleRow.id, settlement.outcome);
  const { error: logsError } = await supabaseAdmin.from('rank_battle_logs').insert(logs);
  if (logsError) {
    throw logsError;
  }

  await upsertParticipantOutcome({
    gameId: settlement.gameId,
    ownerId: settlement.attacker.ownerId,
    heroId: settlement.attacker.heroId,
    delta: settlement.delta.attacker,
    status: settlement.attackerStatus,
  });
  await upsertParticipantOutcome({
    gameId: settlement.gameId,
    ownerId: settlement.defender.ownerId,
    heroId: settlement.defender.heroId,
    delta: settlement.delta.defender,
    status: settlement.defenderStatus,
  });

  return {
    ...baseScore,
    settledAt: now,
    settlement: 'applied',
    reason: reason || 'completed',
    battleId: battleRow.id,
    gameId: settlement.gameId,
    outcome: settlement.outcome,
    delta: settlement.delta.attacker,
    deltas: settlement.delta,
    winner: toId(winnerParticipant?.heroId || winnerParticipant?.name) || null,
    loser: toId(loserParticipant?.heroId || loserParticipant?.name) || null,
  };
}
