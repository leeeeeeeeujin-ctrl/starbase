export function buildOutcomeStatusMessage(snapshot) {
  if (!snapshot) {
    return '모든 역할군 결과가 확정되어 세션을 종료합니다.';
  }
  const summaries = Array.isArray(snapshot.roleSummaries) ? snapshot.roleSummaries : [];
  const wins = summaries.filter(entry => entry.status === 'won').length;
  const losses = summaries.filter(entry => entry.status === 'lost').length;
  const baseLabel = (() => {
    switch (snapshot.overallResult) {
      case 'won':
        return '승리';
      case 'lost':
        return '패배';
      case 'draw':
        return '무승부';
      default:
        return '종료';
    }
  })();
  const pieces = [];
  if (wins) pieces.push(`${wins}승`);
  if (losses) pieces.push(`${losses}패`);
  const summary = pieces.length ? ` (${pieces.join(' · ')})` : '';
  return `모든 역할군 결과가 확정되어 세션을 ${baseLabel}로 마무리했습니다.${summary}`;
}

export function buildTurnStateMeta({ loggedTurnNumber, turn, advanceReason, now = Date.now() }) {
  const numericLogged = Number(loggedTurnNumber);
  const numericTurn = Number(turn);
  const effectiveTurnNumber = Number.isFinite(numericLogged)
    ? Math.floor(numericLogged)
    : Number.isFinite(numericTurn)
      ? Math.floor(numericTurn)
      : null;

  if (effectiveTurnNumber === null) {
    return { turnNumber: null, payload: null };
  }

  const payload = {
    turnState: {
      turnNumber: effectiveTurnNumber,
      status: `completed:${advanceReason}`,
      updatedAt: now,
      source: 'client/run-turn',
    },
    source: 'client/run-turn',
  };

  return { turnNumber: effectiveTurnNumber, payload };
}
