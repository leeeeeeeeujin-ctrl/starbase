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

  test('blocks when a role exceeds its configured limit', () => {
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
  });

  test('blocks when joined participants exceed max players', () => {
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

    expect(result.ready).toBe(false);
    expect(result.tooManyPlayers).toBe(true);
    expect(result.joinedCount).toBe(5);
    expect(result.maxPlayers).toBe(4);
  });
});
