// Example scoring script for settlement.
// Input: battleLog (normalized), participants (map), meta (session/game info)
// Output: { scores, winners, losers, draw?, highlightIds? }

module.exports = function scoreBattle({ battleLog, participants = {}, meta = {} }) {
  const events = Array.isArray(battleLog?.events) ? battleLog.events : [];
  const scores = {};

  // Simple rule: +1 per public score_change event with delta.
  for (const ev of events) {
    if (ev.type !== 'score_change') continue;
    if (ev.visibility && ev.visibility !== 'public') continue;
    const slotId = ev.speaker?.slotId || ev.slotId || null;
    if (!slotId) continue;
    const delta = Number(ev.delta || (ev.scoreDelta ?? 0));
    if (!Number.isFinite(delta)) continue;
    scores[slotId] = scores[slotId] || { total: 0, reason: 'score_change' };
    scores[slotId].total += delta;
  }

  // Winners: highest score; ties → draw=true
  let max = -Infinity;
  Object.values(scores).forEach((s) => {
    if (typeof s.total === 'number' && s.total > max) max = s.total;
  });

  const winners = [];
  const losers = [];
  if (max > -Infinity) {
    for (const [slotId, s] of Object.entries(scores)) {
      if (s.total === max) winners.push(slotId);
      else losers.push(slotId);
    }
  }

  const draw = winners.length > 1;

  return {
    scores,
    winners,
    losers,
    draw,
    highlightIds: battleLog?.highlightIds || [],
    meta: { ...meta, computedAt: Date.now() },
  };
};
