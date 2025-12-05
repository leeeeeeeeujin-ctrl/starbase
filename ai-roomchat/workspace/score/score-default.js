function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildScoreboardFromEvents(events) {
  const totals = {};
  if (!Array.isArray(events)) return {};
  for (const ev of events) {
    if (!ev || ev.type !== 'score_change') continue;
    const delta = toNumber(ev.delta);
    if (!delta) continue;
    const speakerSlot = ev.speaker && ev.speaker.slotId ? String(ev.speaker.slotId) : null;
    const targetSlot =
      ev.slotId || ev.slot_id || ev.targetSlotId || ev.target_slot_id || speakerSlot;
    if (!targetSlot) continue;
    const key = String(targetSlot);
    const prev = totals[key] || 0;
    totals[key] = prev + delta;
  }
  const scoreboard = {};
  Object.keys(totals).forEach((slotId) => {
    const score = totals[slotId];
    scoreboard[slotId] = { score, delta: score };
  });
  return scoreboard;
}

function mergeParticipants(scoreboard, participants) {
  const merged = { ...scoreboard };
  if (!participants || typeof participants !== 'object') return merged;
  Object.keys(participants).forEach((slotId) => {
    if (!Object.prototype.hasOwnProperty.call(merged, slotId)) {
      merged[slotId] = { score: 0, delta: 0 };
    }
  });
  return merged;
}

function pickHighlightIds(battleLog, outcome) {
  if (battleLog && Array.isArray(battleLog.highlightIds) && battleLog.highlightIds.length) {
    return battleLog.highlightIds.slice();
  }
  if (outcome && Array.isArray(outcome.highlightIds) && outcome.highlightIds.length) {
    return outcome.highlightIds.slice();
  }
  return [];
}

function computeWinnersAndLosers(scoreboard, outcome) {
  const result = {
    winners: [],
    losers: [],
    draw: false,
  };

  if (outcome && typeof outcome === 'object') {
    if (Array.isArray(outcome.winners)) {
      result.winners = outcome.winners.filter((x) => x != null).map((x) => String(x));
    }
    if (Array.isArray(outcome.losers)) {
      result.losers = outcome.losers.filter((x) => x != null).map((x) => String(x));
    }
    if (outcome.draw === true) {
      result.draw = true;
    }
    if (result.winners.length || result.losers.length || result.draw) {
      return result;
    }
  }

  const slotIds = Object.keys(scoreboard || {});
  if (!slotIds.length) {
    result.draw = true;
    return result;
  }

  let maxScore = -Infinity;
  slotIds.forEach((slotId) => {
    const value = toNumber(scoreboard[slotId] && scoreboard[slotId].score);
    if (value > maxScore) {
      maxScore = value;
    }
  });

  if (!Number.isFinite(maxScore) || maxScore === -Infinity) {
    result.draw = true;
    return result;
  }

  const winners = slotIds.filter((slotId) => toNumber(scoreboard[slotId].score) === maxScore);
  const losers = slotIds.filter((slotId) => !winners.includes(slotId));

  result.winners = winners;
  result.losers = losers;
  result.draw = winners.length === 0 || (winners.length > 1 && losers.length === 0);

  return result;
}

function scoreDefault(input) {
  const battleLog =
    input && input.battleLog && typeof input.battleLog === 'object'
      ? input.battleLog
      : input && typeof input === 'object'
        ? input
        : {};
  const participants =
    input && input.participants && typeof input.participants === 'object'
      ? input.participants
      : battleLog.participants && typeof battleLog.participants === 'object'
        ? battleLog.participants
        : {};
  const metaInput =
    input && input.meta && typeof input.meta === 'object'
      ? input.meta
      : {};
  const outcome =
    battleLog && battleLog.outcome && typeof battleLog.outcome === 'object'
      ? battleLog.outcome
      : null;

  let scoreboard =
    battleLog && battleLog.scoreboard && typeof battleLog.scoreboard === 'object'
      ? battleLog.scoreboard
      : null;

  if (!scoreboard && outcome && outcome.scores && typeof outcome.scores === 'object') {
    const fromOutcome = {};
    Object.keys(outcome.scores).forEach((slotId) => {
      const v = outcome.scores[slotId] || {};
      const score = toNumber(v.total !== undefined ? v.total : v.score);
      const delta = v.delta !== undefined ? toNumber(v.delta) : score;
      fromOutcome[slotId] = { score, delta };
    });
    scoreboard = fromOutcome;
  }

  if (!scoreboard) {
    scoreboard = buildScoreboardFromEvents(battleLog && battleLog.events);
  }

  scoreboard = mergeParticipants(scoreboard, participants);

  const wl = computeWinnersAndLosers(scoreboard, outcome);
  const highlightIds = pickHighlightIds(battleLog, outcome);

  const meta = {
    ...battleLog.meta,
    ...metaInput,
  };

  if (meta.sessionId == null && metaInput.sessionId != null) {
    meta.sessionId = metaInput.sessionId;
  }
  if (meta.gameId == null && metaInput.gameId != null) {
    meta.gameId = metaInput.gameId;
  }

  meta.source = meta.source || 'workspace/score/score-default';

  return {
    scores: scoreboard,
    winners: wl.winners,
    losers: wl.losers,
    draw: wl.draw,
    highlightIds,
    meta,
  };
}

module.exports = scoreDefault;

