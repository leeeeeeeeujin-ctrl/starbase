const path = require('path');
const fs = require('fs');
const matching = require('../../../lib/rank/matching.js');

describe('regression: matching scenarios from logs', () => {
  const fixturesPath = path.join(process.cwd(), 'logs', 'matching-scenarios-2025-10-25T04-41-22-428Z.json');
  if (!fs.existsSync(fixturesPath)) {
    test('fixtures file exists', () => {
      throw new Error(`Missing fixtures file: ${fixturesPath}`);
    });
    return;
  }

  const data = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const idsToTest = [1, 25, 32, 40];
  const scenarios = data.results.filter(r => idsToTest.includes(r.scenario.id));

  scenarios.forEach((s) => {
    test(`scenario ${s.scenario.id} should reproduce non-ready rooms`, () => {
      const roles = s.scenario.roles.map(r => ({ name: r.name, slotCount: r.slotCount }));
      const queue = s.queue;
      const scoreWindows = s.scenario.scoreWindows || [100, 200];

      const res = matching.matchRankParticipants({ roles, queue, scoreWindows });

      // Expect a result object and 'rooms' array
      expect(res).toBeTruthy();
      expect(Array.isArray(res.rooms)).toBe(true);

      // The original scenario had no fully-ready rooms; assert same reproduction
      const anyReady = res.rooms.some(r => r.ready === true);
      expect(anyReady).toBe(false);
    });
  });
});
