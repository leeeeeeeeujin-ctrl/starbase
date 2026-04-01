import { recordBattle } from '@/lib/rank/persist';

function toId(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeTurnLogs(session = {}) {
  const logs = Array.isArray(session?.logs) ? session.logs : [];
  return logs.map((entry, index) => ({
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
      turnId: entry?.turnId || null,
      actorId: entry?.actorId || null,
      kind: entry?.kind || null,
      title: entry?.title || null,
    },
  }));
}

function buildSettlementPayload({ session, winnerParticipant, loserParticipant, reason }) {
  const participants = Array.isArray(session?.participants?.list) ? session.participants.list : [];
  if (participants.length !== 2) return null;

  const gameId = toId(session?.values?.gameId);
  const ownerId = toId(participants[0]?.ownerId);
  const opponentOwnerId = toId(participants[1]?.ownerId);
  const myHeroId = toId(participants[0]?.heroId);
  const oppHeroId = toId(participants[1]?.heroId);

  if (!gameId || !ownerId || !opponentOwnerId || !myHeroId || !oppHeroId) {
    return null;
  }

  const winnerHeroId = toId(winnerParticipant?.heroId);
  const loserHeroId = toId(loserParticipant?.heroId);

  let outcome = 'draw';
  let delta = 0;
  if (winnerHeroId && loserHeroId) {
    outcome = winnerHeroId === myHeroId ? 'win' : 'lose';
    delta = outcome === 'win' ? 10 : -10;
    if (reason === 'surrender') {
      delta = outcome === 'win' ? 8 : -8;
    }
  }

  return {
    gameId,
    ownerId,
    myHeroIds: [myHeroId],
    oppOwnerIds: [opponentOwnerId],
    oppHeroIds: [oppHeroId],
    outcome,
    delta,
  };
}

export async function settleTextBattleSession({ session, sessionRow, winnerParticipant, loserParticipant, reason }) {
  const existingFinalScore =
    sessionRow?.final_score && typeof sessionRow.final_score === 'object' ? sessionRow.final_score : {};
  if (existingFinalScore?.settledAt) {
    return existingFinalScore;
  }

  const settlementPayload = buildSettlementPayload({
    session,
    winnerParticipant,
    loserParticipant,
    reason,
  });

  const baseScore =
    session?.values?.battleScore && typeof session.values.battleScore === 'object'
      ? { ...session.values.battleScore }
      : {};

  if (!settlementPayload) {
    return {
      ...baseScore,
      settledAt: new Date().toISOString(),
      settlement: 'skipped',
      reason: reason || 'completed',
    };
  }

  await recordBattle({
    game: { id: settlementPayload.gameId },
    userId: settlementPayload.ownerId,
    myHeroIds: settlementPayload.myHeroIds,
    oppOwnerIds: settlementPayload.oppOwnerIds,
    oppHeroIds: settlementPayload.oppHeroIds,
    outcome: settlementPayload.outcome,
    delta: settlementPayload.delta,
    prompt: typeof session?.definition?.name === 'string' ? session.definition.name : 'text-battle',
    aiText:
      typeof session?.values?.battleEndReason === 'string'
        ? session.values.battleEndReason
        : reason || 'completed',
    turnLogs: normalizeTurnLogs(session),
  });

  return {
    ...baseScore,
    settledAt: new Date().toISOString(),
    settlement: 'applied',
    reason: reason || 'completed',
    gameId: settlementPayload.gameId,
    outcome: settlementPayload.outcome,
    delta: settlementPayload.delta,
    winner: toId(winnerParticipant?.heroId || winnerParticipant?.name) || null,
    loser: toId(loserParticipant?.heroId || loserParticipant?.name) || null,
  };
}
