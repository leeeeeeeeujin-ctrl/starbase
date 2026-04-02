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

function normalizeOutcomeKey(value) {
  return toId(value)
    .normalize('NFC')
    .replace(/\s+/g, '')
    .replace(/^팀(?=\S)/, '')
    .toLowerCase();
}

export function lookupTeamOutcome(teamOutcomes = {}, team = '') {
  const entries = Object.entries(toObject(teamOutcomes));
  if (!entries.length) return '';

  const teamId = toId(team);
  if (!teamId) return '';

  const direct = teamOutcomes[teamId];
  if (direct) return direct;
  const prefixed = teamOutcomes[`팀 ${teamId}`];
  if (prefixed) return prefixed;

  const normalizedTeam = normalizeOutcomeKey(teamId);
  if (!normalizedTeam) return '';

  const matched = entries.find(([key]) => normalizeOutcomeKey(key) === normalizedTeam);
  return matched?.[1] || '';
}

export function lookupParticipantOutcome(participantOutcomes = {}, participant = {}) {
  const outcomes = toObject(participantOutcomes);
  const entries = Object.entries(outcomes);
  if (!entries.length || !participant || typeof participant !== 'object') return '';

  const directCandidates = [
    participant.id,
    participant.heroId,
    participant.ownerId,
    participant.name,
    participant.heroName,
    participant.displayName,
  ]
    .map(toId)
    .filter(Boolean);

  for (const candidate of directCandidates) {
    if (Object.prototype.hasOwnProperty.call(outcomes, candidate)) {
      return outcomes[candidate];
    }
  }

  const normalizedCandidates = new Set(
    directCandidates
      .map(normalizeOutcomeKey)
      .filter(Boolean)
  );
  if (!normalizedCandidates.size) return '';

  const matched = entries.find(([key]) => normalizedCandidates.has(normalizeOutcomeKey(key)));
  return matched?.[1] || '';
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

function adjustZeroSumDeltaByRating(delta = {}, attackerRating = 1000, defenderRating = 1000) {
  const attackerBase = toNumber(delta?.attacker, 0);
  const defenderBase = toNumber(delta?.defender, 0);
  if (attackerBase === 0 && defenderBase === 0) {
    return { attacker: 0, defender: 0 };
  }

  const gap = Math.max(-400, Math.min(400, toNumber(attackerRating, 1000) - toNumber(defenderRating, 1000)));
  const swing = Math.max(-4, Math.min(4, Math.round(gap / 100)));

  if (attackerBase > 0) {
    const adjusted = Math.max(4, attackerBase - swing);
    return { attacker: adjusted, defender: -adjusted };
  }

  if (attackerBase < 0) {
    const adjusted = Math.max(4, Math.abs(attackerBase) + swing);
    return { attacker: -adjusted, defender: adjusted };
  }

  return { attacker: attackerBase, defender: defenderBase };
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

async function loadParticipantRating({ gameId, ownerId }) {
  if (!gameId || !ownerId) return 1000;
  const { data, error } = await supabaseAdmin
    .from('rank_participants')
    .select('rating, score')
    .eq('game_id', gameId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const rating = toNumber(data?.rating, NaN);
  if (Number.isFinite(rating)) return rating;
  return toNumber(data?.score, 1000);
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
  const attackerOutcome = lookupParticipantOutcome(participantOutcomes, attacker);
  const defenderOutcome = lookupParticipantOutcome(participantOutcomes, defender);
  const attackerTeamOutcome = lookupTeamOutcome(teamOutcomes, attacker?.team || '');
  const defenderTeamOutcome = lookupTeamOutcome(teamOutcomes, defender?.team || '');
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

  const [attackerRating, defenderRating] = await Promise.all([
    loadParticipantRating({
      gameId: settlement.gameId,
      ownerId: settlement.attacker.ownerId,
    }),
    loadParticipantRating({
      gameId: settlement.gameId,
      ownerId: settlement.defender.ownerId,
    }),
  ]);

  settlement.delta = adjustZeroSumDeltaByRating(
    settlement.delta,
    attackerRating,
    defenderRating
  );

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
      score_delta: settlement.delta.attacker,
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
