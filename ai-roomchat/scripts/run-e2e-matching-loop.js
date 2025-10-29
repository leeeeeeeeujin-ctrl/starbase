// E2E matching loop simulation
// Simulates adding participants to the queue, running the matcher, simulating a
// completed game with per-role score deltas, applying score updates, and
// re-adding players to the queue for several iterations.

const path = require('path');
const { matchRankParticipants } = require('../lib/rank/matching');

function createParticipant(id, ownerId, heroId, role, score) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    entry: {
      id,
      owner_id: ownerId,
      hero_id: heroId,
    },
  };
}

function buildInitialQueue() {
  // Create 8 participants: 4 attack, 4 support
  return [
    createParticipant('p1', 'a', 'ha', 'attack', 1100),
    createParticipant('p2', 'b', 'hb', 'attack', 1120),
    createParticipant('p3', 'c', 'hc', 'support', 1150),
    createParticipant('p4', 'd', 'hd', 'support', 1160),
    createParticipant('p5', 'e', 'he', 'attack', 1080),
    createParticipant('p6', 'f', 'hf', 'attack', 1090),
    createParticipant('p7', 'g', 'hg', 'support', 1170),
    createParticipant('p8', 'h', 'hh', 'support', 1180),
  ];
}

function computeRoleAverages(queue) {
  const sums = {};
  const counts = {};
  for (const entry of queue) {
    const role = entry.role;
    const s = Number(entry.score) || 0;
    sums[role] = (sums[role] || 0) + s;
    counts[role] = (counts[role] || 0) + 1;
  }
  const avgs = {};
  for (const r of Object.keys(sums)) {
    avgs[r] = Math.round(sums[r] / counts[r]);
  }
  return avgs;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

async function run() {
  const roles = [
    { name: 'attack', slot_count: 2 },
    { name: 'support', slot_count: 2 },
  ];

  // Simulated rank_games_roles config
  const roleDeltas = {
    attack: { min: -5, max: 10 },
    support: { min: -3, max: 8 },
  };

  let queue = buildInitialQueue();

  console.log(
    'Starting queue:',
    queue.map(q => ({ id: q.id, role: q.role, score: q.score }))
  );

  const iterations = 5;
  for (let iter = 1; iter <= iterations; iter++) {
    console.log('\n=== Iteration', iter, '===');
    const roleAvgs = computeRoleAverages(queue);
    console.log('role averages before match', roleAvgs);

    const result = matchRankParticipants({ roles, queue, scoreWindows: [200] });
    console.log('matched ready?', result.ready, 'totalSlots', result.totalSlots);
    console.log(
      'assignments (rooms):',
      result.assignments.map(a => ({
        roomId: a.roomId,
        filled: a.filledSlots,
        ready: a.ready,
        role: a.role,
      }))
    );

    // If nothing matched, break
    if (!result.assignments || !result.assignments.length) {
      console.log('No assignments, stopping.');
      break;
    }

    // For each room, for each role group, compute delta and apply to members
    const updatedPlayers = {};
    result.assignments.forEach(roomAssign => {
      // roomAssign.groups is array of placed groups
      (roomAssign.groups || []).forEach(group => {
        const role = group.role;
        const anchorScore = group.score || 0;
        const roleAvg = roleAvgs[role] || anchorScore || 1000;
        const fraction = clamp((anchorScore - roleAvg) / Math.max(1, roleAvg), -1, 1);
        const { min, max } = roleDeltas[role] || { min: 0, max: 0 };
        const delta = min + (max - min) * ((fraction + 1) / 2);
        const rounded = Math.round(delta);
        // apply to each member in the group
        (group.members || []).forEach(m => {
          const memberEntry = m.entry || m;
          const qid = memberEntry.id || memberEntry.queue_id || memberEntry.queueId;
          if (!qid) return;
          const key = String(qid);
          if (!updatedPlayers[key]) {
            updatedPlayers[key] = { ...memberEntry, prevScore: memberEntry.score || 0 };
          }
          updatedPlayers[key].score = (Number(updatedPlayers[key].score) || 0) + rounded;
        });
      });
    });

    console.log('Updated player deltas:');
    for (const [k, v] of Object.entries(updatedPlayers)) {
      console.log(' ', k, 'prev', v.prevScore, 'new', v.score);
    }

    // Rebuild queue for next iteration: use updated players plus any unplaced original queue members
    const placedIds = new Set(Object.keys(updatedPlayers));
    const unplaced = (result.rooms || [])
      .flatMap(r => r.slots || [])
      .map(s => null)
      .filter(Boolean); // dummy to satisfy linter
    const nextQueue = [];

    // Re-add all players from updatedPlayers
    for (const key of Object.keys(updatedPlayers)) {
      const p = updatedPlayers[key];
      nextQueue.push({
        id: p.id,
        owner_id: p.owner_id,
        hero_id: p.hero_id,
        role: p.role,
        score: p.score,
        entry: { id: p.id, owner_id: p.owner_id, hero_id: p.hero_id },
      });
    }

    // If there were other players not matched this round (e.g., leftovers in earlier queue), include them unchanged
    const matchedIds = new Set(Object.keys(updatedPlayers));
    for (const q of queue) {
      if (matchedIds.has(String(q.id))) continue;
      // re-add with same score
      nextQueue.push(q);
    }

    queue = nextQueue;
    console.log(
      'Queue for next iter:',
      queue.map(q => ({ id: q.id, role: q.role, score: q.score }))
    );
  }

  console.log('\nSimulation complete. Final queue:');
  console.log(queue.map(q => ({ id: q.id, role: q.role, score: q.score })));
}

run().catch(err => {
  console.error('E2E simulation error', err);
  process.exitCode = 2;
});
