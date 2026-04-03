function toId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function parseStructuredBattleResult(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return {
      raw: '',
      usedFallback: false,
      reply: '',
      gameResult: '',
      teamOutcomes: {},
      participantOutcomes: {},
    };
  }

  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return {
        raw: text,
        usedFallback: false,
        reply: typeof parsed?.reply === 'string' ? parsed.reply.trim() : text,
        segments: Array.isArray(parsed?.segments) ? parsed.segments : [],
        gameResult: toId(parsed?.gameResult || parsed?.result || parsed?.battleResult),
        teamOutcomes: toObject(parsed?.teamOutcomes),
        participantOutcomes: toObject(parsed?.participantOutcomes),
        visibleParticipants: Array.isArray(parsed?.visibleParticipants) ? parsed.visibleParticipants.map(toId).filter(Boolean) : [],
        focusParticipants: Array.isArray(parsed?.focusParticipants) ? parsed.focusParticipants.map(toId).filter(Boolean) : [],
        sceneBackground: toId(parsed?.sceneBackground),
      };
    } catch {
      // Try next shape.
    }
  }

  return {
    raw: text,
    usedFallback: true,
    reply: text,
    segments: [],
    gameResult: '',
    teamOutcomes: {},
    participantOutcomes: {},
    visibleParticipants: [],
    focusParticipants: [],
    sceneBackground: '',
  };
}

export function applyBattleResultToValues(values = {}, parsedResult = {}) {
  const nextValues = {
    ...(values && typeof values === 'object' ? values : {}),
  };

  const teamOutcomes = toObject(parsedResult?.teamOutcomes);
  const participantOutcomes = toObject(parsedResult?.participantOutcomes);
  const normalizedGameResult = toId(parsedResult?.gameResult).toLowerCase();

  if (Object.keys(teamOutcomes).length) {
    nextValues.teamOutcomes = teamOutcomes;
  }
  if (Object.keys(participantOutcomes).length) {
    nextValues.participantOutcomes = participantOutcomes;
  }
  if (normalizedGameResult) {
    nextValues.gameResult = normalizedGameResult;
    if (normalizedGameResult === 'ended' || normalizedGameResult === 'abandoned' || normalizedGameResult === 'timed_out') {
      nextValues.battleEndReason = normalizedGameResult;
    }
  }

  const winningTeams = Object.entries(teamOutcomes)
    .filter(([, outcome]) => toId(outcome).toLowerCase() === 'win')
    .map(([team]) => toId(team))
    .filter(Boolean);
  if (winningTeams.length) {
    nextValues.winningTeams = winningTeams;
  }

  const losingTeams = Object.entries(teamOutcomes)
    .filter(([, outcome]) => toId(outcome).toLowerCase() === 'lose')
    .map(([team]) => toId(team))
    .filter(Boolean);
  if (losingTeams.length) {
    nextValues.losingTeams = losingTeams;
  }

  const eliminatedIds = Object.entries(participantOutcomes)
    .filter(([, outcome]) => {
      const normalized = toId(outcome).toLowerCase();
      return normalized === 'eliminated' || normalized === 'retired';
    })
    .map(([participantId]) => toId(participantId))
    .filter(Boolean);
  if (eliminatedIds.length) {
    nextValues.eliminatedParticipantIds = eliminatedIds;
  }
  if (Array.isArray(parsedResult?.visibleParticipants) && parsedResult.visibleParticipants.length) {
    nextValues.visibleParticipants = parsedResult.visibleParticipants.map(toId).filter(Boolean);
  }
  if (Array.isArray(parsedResult?.focusParticipants) && parsedResult.focusParticipants.length) {
    nextValues.focusParticipants = parsedResult.focusParticipants.map(toId).filter(Boolean);
  }
  if (toId(parsedResult?.sceneBackground)) {
    nextValues.sceneBackground = toId(parsedResult.sceneBackground);
  }

  if (!nextValues.battleWinner && winningTeams.length === 1) {
    nextValues.battleWinner = winningTeams[0];
  }

  if (!nextValues.battleWinner) {
    const survivingParticipants = Object.entries(participantOutcomes)
      .filter(([, outcome]) => toId(outcome).toLowerCase() === 'survived')
      .map(([participantId]) => toId(participantId))
      .filter(Boolean);
    if (survivingParticipants.length === 1) {
      nextValues.battleWinner = survivingParticipants[0];
    }
  }

  return nextValues;
}
