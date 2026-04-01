function toId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildParticipantKeys(participant = {}) {
  return [participant?.id, participant?.heroId, participant?.hero_id, participant?.name]
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(Boolean);
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
        gameResult: toId(parsed?.gameResult || parsed?.result || parsed?.battleResult),
        teamOutcomes: toObject(parsed?.teamOutcomes),
        participantOutcomes: toObject(parsed?.participantOutcomes),
      };
    } catch {
      // Try next shape.
    }
  }

  return {
    raw: text,
    usedFallback: true,
    reply: text,
    gameResult: '',
    teamOutcomes: {},
    participantOutcomes: {},
  };
}

export function inferBattleResultFromNarrative(reply, participants = []) {
  const text = typeof reply === 'string' ? reply.trim() : '';
  const list = Array.isArray(participants) ? participants : [];
  if (!text || list.length !== 2) {
    return {
      gameResult: '',
      teamOutcomes: {},
      participantOutcomes: {},
      battleWinner: '',
    };
  }

  const normalized = text.replace(/\s+/g, ' ');
  const winner = list.find(participant => {
    const keys = buildParticipantKeys(participant);
    return keys.some(name => {
      if (!name) return false;
      return (
        normalized.includes(`${name}가 승리`) ||
        normalized.includes(`${name}이 승리`) ||
        normalized.includes(`${name}의 승리`) ||
        normalized.includes(`${name} 승리`) ||
        normalized.includes(`${name}가 이겼`) ||
        normalized.includes(`${name}이 이겼`) ||
        normalized.includes(`${name}의 승리로`) ||
        normalized.includes(`${name} winner`)
      );
    });
  }) || null;

  if (!winner) {
    return {
      gameResult: '',
      teamOutcomes: {},
      participantOutcomes: {},
      battleWinner: '',
    };
  }

  const loser = list.find(participant => participant !== winner) || null;
  const participantOutcomes = {
    [winner.id || winner.heroId || winner.name]: 'survived',
  };
  if (loser) {
    participantOutcomes[loser.id || loser.heroId || loser.name] = 'eliminated';
  }

  const teamOutcomes =
    winner?.team && loser?.team
      ? {
          [winner.team]: 'win',
          [loser.team]: 'lose',
        }
      : {};

  return {
    gameResult: 'ended',
    teamOutcomes,
    participantOutcomes,
    battleWinner: winner.heroId || winner.id || winner.name || '',
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

  if (!nextValues.battleWinner && parsedResult?.battleWinner) {
    nextValues.battleWinner = toId(parsedResult.battleWinner);
  }

  return nextValues;
}
