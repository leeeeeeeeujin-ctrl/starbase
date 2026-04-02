const { evaluateBattleReadiness } = require('../../../lib/battle/matchReadiness');

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runScenario({
  label,
  definition,
  hero,
  heroLookup,
  scoreboard,
  runs = 1000,
  recentOpponentCounts = {},
}) {
  const counts = new Map();

  for (let index = 0; index < runs; index += 1) {
    const result = evaluateBattleReadiness({
      definition,
      hero,
      heroLookup,
      scoreboard,
      randomFn: createSeededRandom(index + 1),
      recentOpponentCounts,
    });
    const opponentId = result.heroIds.find(heroId => heroId !== hero.id) || 'none';
    counts.set(opponentId, (counts.get(opponentId) || 0) + 1);
  }

  return {
    label,
    runs,
    distribution: Array.from(counts.entries())
      .map(([heroId, count]) => ({
        heroId,
        count,
        ratio: Number((count / runs).toFixed(4)),
      }))
      .sort((left, right) => right.count - left.count),
  };
}

describe('battle match readiness simulation', () => {
  test('prints selection distribution for weighted candidate pools', () => {
    const heroLookup = {
      h1: { id: 'h1', name: '아린' },
      h2: { id: 'h2', name: '세린' },
      h3: { id: 'h3', name: '루나' },
      h4: { id: 'h4', name: '이브' },
    };

    const definition = {
      minPlayers: 2,
      maxPlayers: 2,
      scoreRange: 400,
      roles: [
        { name: 'attacker', limit: 1, team: '1' },
        { name: 'defender', limit: 1, team: '2' },
      ],
    };

    const scenarios = [
      {
        label: 'close_scores',
        definition,
        hero: { id: 'h1' },
        heroLookup,
        scoreboard: [
          { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
          { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1010 },
          { hero_id: 'h3', role: 'defender', slot_no: 3, rating: 1040 },
          { hero_id: 'h4', role: 'defender', slot_no: 4, rating: 1090 },
        ],
      },
      {
        label: 'wider_scores',
        definition,
        hero: { id: 'h1' },
        heroLookup,
        scoreboard: [
          { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
          { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1005 },
          { hero_id: 'h3', role: 'defender', slot_no: 3, rating: 1200 },
          { hero_id: 'h4', role: 'defender', slot_no: 4, rating: 1380 },
        ],
      },
      {
        label: 'recent_opponent_penalty',
        definition,
        hero: { id: 'h1' },
        heroLookup,
        recentOpponentCounts: { h2: 8 },
        scoreboard: [
          { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
          { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1010 },
          { hero_id: 'h3', role: 'defender', slot_no: 3, rating: 1015 },
          { hero_id: 'h4', role: 'defender', slot_no: 4, rating: 1020 },
        ],
      },
    ];

    const report = scenarios.map(runScenario);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    expect(report).toHaveLength(3);
    report.forEach(entry => {
      const ratioTotal = entry.distribution.reduce((sum, item) => sum + item.ratio, 0);
      expect(ratioTotal).toBeGreaterThan(0.99);
      expect(ratioTotal).toBeLessThan(1.01);
    });
  });
});
