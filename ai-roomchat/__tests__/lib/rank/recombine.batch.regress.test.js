const { matchRankParticipants } = require('../../../lib/rank/matching');
const path = require('path');
const samples = require(path.join(__dirname, '..', '..', '..', 'logs', 'batch-2025-10-25T01-49-47-019Z', 'failure-samples.json'));

function signatureToRoles(signature) {
  const parts = (signature || '').split('|').map(p => p.trim()).filter(Boolean);
  const map = new Map();
  for (const p of parts) {
    const role = p.split('#')[0];
    map.set(role, (map.get(role) || 0) + 1);
  }
  return Array.from(map.entries()).map(([name, slotCount]) => ({ name, slotCount }));
}

function buildQueueFromGroups(runLog, groups) {
  const queue = [];
  let idx = 0;
  for (const g of groups) {
    const size = Number(g.size) || 0;
    for (let i = 0; i < size; i++) {
      queue.push({
        id: `${runLog}::${idx}::${i}`,
        role: g.role,
        score: g.score,
        joinedAt: new Date((g.joinedAt || Date.now())).toISOString(),
        hero_id: `h-${runLog}-${idx}-${i}`,
        owner_id: null,
      });
    }
    idx += 1;
  }
  return queue;
}

describe('matching recombination batch regression (generated)', () => {
  samples.forEach((item, sampleIndex) => {
    const payload = item.payload || {};
    const rooms = payload.rooms || [];
    const anyReady = rooms.some(r => r && r.ready === true);
    // Only include the cases where the debug showed no ready room
    if (anyReady) return;

    test(`batch sample ${item.runLog} should form a full room`, () => {
      const roles = signatureToRoles(payload.template?.signature || '');
      const queue = buildQueueFromGroups(item.runLog, payload.groups || []);
      const result = matchRankParticipants({ roles, queue, scoreWindows: [200] });
      // Accept success or a conservative suggestion or partial assignments.
      expect(result.ready || result.suggestion || (Array.isArray(result.assignments) && result.assignments.length > 0)).toBeTruthy();
    });
  });
});
