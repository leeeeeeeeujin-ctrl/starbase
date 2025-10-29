const { matchRankParticipants, matchAsyncParticipants } = require('../lib/rank/matching');

function buildEntry({ id, ownerId, heroId, role, score, gameId, simulated = false } = {}) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    game_id: gameId,
    simulated,
    standin: simulated,
    entry: { id, owner_id: ownerId, hero_id: heroId },
  };
}

function analyzeRuns(games, queuesByGame) {
  // Run matchers for each game and collect assignments
  const results = {};
  for (const g of games) {
    const q = queuesByGame[g.id] || [];
    const res = matchRankParticipants({ roles: g.roles, queue: q, scoreWindows: [200] });
    results[g.id] = { game: g, queue: q, result: res };
  }

  // checks
  const errors = [];
  const ownerAssignments = new Map();

  for (const gid of Object.keys(results)) {
    const { game, queue, result } = results[gid];
    // check total slots
    const totalSlots = game.roles.reduce((s, r) => s + (r.slot_count || r.slotCount || 0), 0);
    const filled = (result.assignments || []).reduce((acc, a) => acc + (a.filledSlots || 0), 0);
    if (filled > totalSlots) {
      errors.push({ type: 'totalSlotsExceeded', gameId: gid, totalSlots, filled });
    }

    // check per-role slot consumption
    const remaining = new Map();
    for (const r of game.roles)
      remaining.set(String(r.name), Number(r.slot_count || r.slotCount || 0));
    for (const a of result.assignments || []) {
      for (const slot of a.roleSlots || []) {
        const slotRole = slot.role;
        if (!remaining.has(slotRole)) {
          errors.push({
            type: 'undeclaredRoleUsed',
            gameId: gid,
            slotRole,
            assignmentRole: a.role,
          });
        } else {
          remaining.set(slotRole, (remaining.get(slotRole) || 0) - 1);
          if ((remaining.get(slotRole) || 0) < 0) {
            errors.push({ type: 'roleOverConsumed', gameId: gid, slotRole });
          }
        }
      }
    }

    // record owner assignments
    for (const a of result.assignments || []) {
      for (const m of a.members || []) {
        const owner = m.owner_id || m.ownerId || null;
        if (!owner) continue;
        const set = ownerAssignments.get(owner) || new Set();
        set.add(gid);
        ownerAssignments.set(owner, set);
      }
    }
  }

  // owners matched in multiple games
  for (const [owner, set] of ownerAssignments.entries()) {
    if (set.size > 1) {
      errors.push({ type: 'ownerMatchedMultipleGames', owner, games: Array.from(set) });
    }
  }

  return { results, errors };
}

(async function main() {
  // Define multiple games with different role setups
  const games = [
    {
      id: 'game-A',
      roles: [
        { name: 'attack', slot_count: 2 },
        { name: 'support', slot_count: 1 },
      ],
    },
    {
      id: 'game-B',
      roles: [
        { name: 'attack', slot_count: 1 },
        { name: 'defense', slot_count: 1 },
      ],
    },
    { id: 'game-C', roles: [{ name: 'duo', slot_count: 2 }] },
  ];

  // initial empty queues
  const queues = {};
  for (const g of games) queues[g.id] = [];

  // pool of participants to add incrementally with explicit target games (includes cross-game attempts)
  const participants = [
    { ownerId: 'u1', heroId: 'h1', role: 'attack', gameId: 'game-A' },
    { ownerId: 'u2', heroId: 'h2', role: 'attack', gameId: 'game-B' },
    { ownerId: 'u3', heroId: 'h3', role: 'support', gameId: 'game-C' },
    { ownerId: 'u4', heroId: 'h4', role: 'defense', gameId: 'game-A' },
    { ownerId: 'u5', heroId: 'h5', role: 'duo', gameId: 'game-B' },
    { ownerId: 'u6', heroId: 'h6', role: 'duo', gameId: 'game-C' },
    // cross-game attempts
    { ownerId: 'u1', heroId: 'h1', role: 'defense', gameId: 'game-B' }, // u1 also tries to join game-B
    { ownerId: 'u2', heroId: 'h2', role: 'duo', gameId: 'game-C' }, // u2 tries game-C as well
    { ownerId: 'u8', heroId: 'h8', role: 'support', gameId: 'game-A' },
  ];

  // We'll add one participant at a time to their explicit game
  const errorsCollected = [];
  let step = 0;
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const targetGame = games.find(gg => gg.id === p.gameId);
    if (!targetGame) {
      console.warn('Skipping participant with unknown gameId', p);
      continue;
    }
    const entry = buildEntry({
      id: `${p.ownerId}-${step}`,
      ownerId: p.ownerId,
      heroId: p.heroId,
      role: p.role,
      score: 1000 + i * 10,
      gameId: targetGame.id,
    });
    queues[targetGame.id].push(entry);
    step += 1;

    console.log(
      `\n--- Step ${step}: added ${entry.owner_id} to ${targetGame.id} as ${entry.role} ---`
    );
    const { results, errors } = analyzeRuns(games, queues);
    if (errors.length) {
      console.warn('Errors detected at step', step, errors);
      errorsCollected.push({ step, errors, queuesSnapshot: JSON.parse(JSON.stringify(queues)) });
    } else {
      console.log('No errors at step', step);
    }
  }

  console.log('\n=== Summary ===');
  if (errorsCollected.length === 0) {
    console.log('No cross-game or constraint errors detected across run.');
    process.exitCode = 0;
  } else {
    console.log('Errors found in incremental run:', JSON.stringify(errorsCollected, null, 2));
    process.exitCode = 2;
  }
})();
