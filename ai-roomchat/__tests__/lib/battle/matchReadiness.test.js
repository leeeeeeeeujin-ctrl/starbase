const { evaluateBattleReadiness } = require('../../../lib/battle/matchReadiness');

describe('battle match readiness', () => {
  const definition = {
    minPlayers: 3,
    maxPlayers: 4,
    roles: [
      { name: 'attacker', limit: 1, team: 'red' },
      { name: 'defender', limit: 1, team: 'blue' },
      { name: 'support', limit: 1, team: 'blue' },
    ],
  };

  const heroLookup = {
    h1: { id: 'h1', name: '아린' },
    h2: { id: 'h2', name: '세린' },
    h3: { id: 'h3', name: '루나' },
  };

  test('is ready when min players and role counts are satisfied', () => {
    const result = evaluateBattleReadiness({
      definition,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1 },
        { hero_id: 'h2', role: 'defender', slot_no: 2 },
        { hero_id: 'h3', role: 'support', slot_no: 3 },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.heroIds).toEqual(['h1', 'h2', 'h3']);
    expect(result.missingRoles).toEqual([]);
  });

  test('reports missing roles when joined roster is incomplete', () => {
    const result = evaluateBattleReadiness({
      definition,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1 },
        { hero_id: 'h2', role: 'defender', slot_no: 2 },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.enoughPlayers).toBe(false);
    expect(result.roleReady).toBe(false);
    expect(result.missingRoles.map(entry => entry.name)).toEqual(['support']);
  });

  test('still blocks when overflow exists but a required role is missing', () => {
    const result = evaluateBattleReadiness({
      definition,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1 },
        { hero_id: 'h2', role: 'defender', slot_no: 2 },
        { hero_id: 'h3', role: 'defender', slot_no: 3 },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.roleReady).toBe(false);
    expect(result.overflowRoles.map(entry => entry.name)).toEqual(['defender']);
    expect(result.heroIds).toEqual(['h1', 'h2', 'h3']);
  });

  test('keeps a playable subset when there are extra participants beyond the role limits', () => {
    const result = evaluateBattleReadiness({
      definition,
      hero: { id: 'h1' },
      heroLookup: {
        ...heroLookup,
        h4: { id: 'h4', name: '이브' },
      },
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1 },
        { hero_id: 'h2', role: 'defender', slot_no: 2 },
        { hero_id: 'h3', role: 'support', slot_no: 3 },
        { hero_id: 'h4', role: 'support', slot_no: 4 },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.roleReady).toBe(true);
    expect(result.overflowRoles.map(entry => entry.name)).toEqual(['support']);
    expect(result.heroIds).toEqual(['h1', 'h2', 'h3', 'h4']);
  });

  test('keeps a playable subset when joined participants exceed max players', () => {
    const result = evaluateBattleReadiness({
      definition,
      hero: { id: 'h1' },
      heroLookup: {
        ...heroLookup,
        h4: { id: 'h4', name: '이브' },
        h5: { id: 'h5', name: '카인' },
      },
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1 },
        { hero_id: 'h2', role: 'defender', slot_no: 2 },
        { hero_id: 'h3', role: 'support', slot_no: 3 },
        { hero_id: 'h4', role: 'support', slot_no: 4 },
        { hero_id: 'h5', role: 'support', slot_no: 5 },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.tooManyPlayers).toBe(true);
    expect(result.joinedCount).toBe(5);
    expect(result.maxPlayers).toBe(4);
    expect(result.heroIds).toHaveLength(4);
    expect(result.heroIds).toEqual(expect.arrayContaining(['h1', 'h2']));
    expect(result.heroIds.filter(heroId => ['h3', 'h4', 'h5'].includes(heroId))).toHaveLength(2);
  });

  test('blocks readiness when selected participants exceed configured score gap', () => {
    const result = evaluateBattleReadiness({
      definition: {
        ...definition,
        minPlayers: 2,
        maxPlayers: 2,
        roles: [
          { name: 'attacker', limit: 1, team: 'red' },
          { name: 'defender', limit: 1, team: 'blue' },
        ],
        scoreRange: 100,
      },
      hero: { id: 'h1' },
      heroLookup,
      scoreboard: [
        { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
        { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1305 },
      ],
    });

    expect(result.roleReady).toBe(true);
    expect(result.enoughPlayers).toBe(true);
    expect(result.scoreReady).toBe(false);
    expect(result.scoreGap).toBe(305);
    expect(result.ready).toBe(false);
  });

  test('weighted selection can vary repeated pairing candidates', () => {
    const definitionWithSingleRoles = {
      minPlayers: 2,
      maxPlayers: 2,
      scoreRange: 400,
      roles: [
        { name: 'attacker', limit: 1, team: 'red' },
        { name: 'defender', limit: 1, team: 'blue' },
      ],
    };
    const scoreboard = [
      { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
      { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1010 },
      { hero_id: 'h3', role: 'defender', slot_no: 3, rating: 1040 },
    ];

    const lowRoll = evaluateBattleReadiness({
      definition: definitionWithSingleRoles,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard,
      randomFn: () => 0.01,
    });
    const highRoll = evaluateBattleReadiness({
      definition: definitionWithSingleRoles,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard,
      randomFn: () => 0.99,
    });

    expect(lowRoll.heroIds[0]).toBe('h1');
    expect(highRoll.heroIds[0]).toBe('h1');
    expect(lowRoll.heroIds[1]).not.toBe(highRoll.heroIds[1]);
  });

  test('recent opponents are deprioritized during weighted selection', () => {
    const definitionWithSingleRoles = {
      minPlayers: 2,
      maxPlayers: 2,
      scoreRange: 400,
      roles: [
        { name: 'attacker', limit: 1, team: 'red' },
        { name: 'defender', limit: 1, team: 'blue' },
      ],
    };
    const scoreboard = [
      { hero_id: 'h1', role: 'attacker', slot_no: 1, rating: 1000 },
      { hero_id: 'h2', role: 'defender', slot_no: 2, rating: 1010 },
      { hero_id: 'h3', role: 'defender', slot_no: 3, rating: 1015 },
    ];

    const baseline = evaluateBattleReadiness({
      definition: definitionWithSingleRoles,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard,
      randomFn: () => 0.4,
    });

    const penalized = evaluateBattleReadiness({
      definition: definitionWithSingleRoles,
      hero: { id: 'h1' },
      heroLookup,
      scoreboard,
      randomFn: () => 0.4,
      recentOpponentCounts: { h2: 8 },
    });

    expect(baseline.heroIds[1]).toBe('h2');
    expect(penalized.heroIds[1]).toBe('h3');
  });
});
