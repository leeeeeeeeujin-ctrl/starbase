const { matchRankParticipants, matchAsyncParticipants } = require('../lib/rank/matching');

function buildEntry({ id, ownerId, heroId, role, score, partyKey, simulated = false } = {}) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    party_key: partyKey ?? null,
    simulated,
    standin: simulated,
    entry: { id, owner_id: ownerId, hero_id: heroId },
  };
}

function checkResult(result, roles, label) {
  const totalSlots = roles.reduce((s, r) => s + (r.slot_count || r.slotCount || 0), 0);
  console.log(`\n=== Scenario: ${label} ===`);
  console.log('totalSlots', totalSlots, 'result.totalSlots', result.totalSlots);

  const filled = (result.assignments || []).reduce((acc, a) => acc + (a.filledSlots || 0), 0);
  console.log('filledSlots total:', filled);

  if (filled > totalSlots) {
    console.error('ERROR: filledSlots exceeds totalSlots');
    return false;
  }

  // Verify per-slot roles across assignments do not exceed declared capacities.
  const remaining = new Map();
  for (const r of roles) {
    remaining.set(String(r.name), Number(r.slot_count || r.slotCount || 0));
  }

  for (const a of result.assignments || []) {
    // roleSlots describe the per-slot role labels
    for (const slot of a.roleSlots || []) {
      const slotRole = slot.role;
      if (!remaining.has(slotRole)) {
        console.error('ERROR: assignment contains slot role not declared in game:', slotRole);
        return false;
      }
      const prev = remaining.get(slotRole) || 0;
      remaining.set(slotRole, prev - 1);
      if ((remaining.get(slotRole) || 0) < 0) {
        console.error('ERROR: assignment consumes more slots for role than declared:', slotRole);
        return false;
      }
    }
  }

  // no duplicate owners or hero across assignments
  const ownerSeen = new Set();
  const heroSeen = new Set();
  for (const a of result.assignments || []) {
    for (const m of a.members || []) {
      const owner = m.owner_id || m.ownerId || null;
      const hero = m.hero_id || m.heroId || null;
      if (owner && ownerSeen.has(owner)) {
        console.error('ERROR: duplicate owner across assignments', owner);
        return false;
      }
      if (hero && heroSeen.has(hero)) {
        console.error('ERROR: duplicate hero across assignments', hero);
        return false;
      }
      if (owner) ownerSeen.add(owner);
      if (hero) heroSeen.add(hero);
    }
  }

  console.log('OK: constraints hold for scenario', label);
  return true;
}

(async function main() {
  const scenarios = [];

  // Scenario 1: complex multi-role layout with mixed parties and standins
  scenarios.push({
    label: 'multi-role-mix',
    roles: [
      { name: 'attack', slot_count: 3 },
      { name: 'support', slot_count: 2 },
      { name: 'tank', slot_count: 1 },
    ],
    queue: [
      buildEntry({ id: 'p1', ownerId: 'o1', heroId: 'h1', role: 'attack', score: 1300 }),
      buildEntry({ id: 'p2', ownerId: 'o2', heroId: 'h2', role: 'attack', score: 1280 }),
      buildEntry({ id: 'p3', ownerId: 'o3', heroId: 'h3', role: 'attack', score: 1290 }),
      buildEntry({ id: 'p4', ownerId: 'o4', heroId: 'h4', role: 'support', score: 1250 }),
      buildEntry({ id: 'p5', ownerId: 'o5', heroId: 'h5', role: 'support', score: 1240 }),
      buildEntry({ id: 'p6', ownerId: 'o6', heroId: 'h6', role: 'tank', score: 1320 }),
      // duplicates and cross-role entries
      buildEntry({ id: 'p7', ownerId: 'o1', heroId: 'h1', role: 'support', score: 1300 }),
      // standin pool entries
      buildEntry({
        id: 's1',
        ownerId: 'bot1',
        heroId: 'hb1',
        role: 'support',
        score: 1200,
        simulated: true,
      }),
    ],
    useAsync: false,
  });

  // Scenario 2: insufficient standins
  scenarios.push({
    label: 'insufficient-standins',
    roles: [
      { name: 'attack', slot_count: 1 },
      { name: 'support', slot_count: 1 },
    ],
    queue: [
      buildEntry({ id: 'h1', ownerId: 'human1', heroId: 'hr1', role: 'attack', score: 1200 }),
    ],
    standins: [],
    useAsync: true,
  });

  // Scenario 3: many small parties, ensure no overfill
  scenarios.push({
    label: 'parties-and-overlap',
    roles: [
      { name: 'duo', slot_count: 2 },
      { name: 'solo', slot_count: 2 },
    ],
    queue: [
      buildEntry({
        id: 'd1',
        ownerId: 'a1',
        heroId: 'ha1',
        role: 'duo',
        score: 1000,
        partyKey: 'partyA',
      }),
      buildEntry({
        id: 'd2',
        ownerId: 'a2',
        heroId: 'ha2',
        role: 'duo',
        score: 1000,
        partyKey: 'partyA',
      }),
      buildEntry({ id: 's1', ownerId: 'b1', heroId: 'hb1', role: 'solo', score: 1050 }),
      buildEntry({ id: 's2', ownerId: 'b2', heroId: 'hb2', role: 'solo', score: 1040 }),
    ],
    useAsync: false,
  });

  let allOk = true;

  for (const sc of scenarios) {
    let result;
    if (sc.useAsync) {
      result = matchAsyncParticipants({
        roles: sc.roles,
        queue: sc.queue,
        standins: sc.standins || [],
        scoreWindows: [200],
      });
    } else {
      result = matchRankParticipants({ roles: sc.roles, queue: sc.queue, scoreWindows: [200] });
    }
    const ok = checkResult(result, sc.roles, sc.label);
    if (!ok) allOk = false;
    console.log('result summary:', {
      ready: result.ready,
      assignments: (result.assignments || []).length,
      totalSlots: result.totalSlots,
      maxWindow: result.maxWindow,
    });
  }

  if (!allOk) process.exitCode = 2;
})();
