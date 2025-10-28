import {
  matchRankParticipants,
  matchAsyncParticipants,
} from '@/lib/rank/matching';

function buildQueueEntry({ id, ownerId, heroId, role, score, partyKey } = {}) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    party_key: partyKey ?? null,
    entry: {
      id,
      owner_id: ownerId,
      hero_id: heroId,
    },
  };
}

function buildStandin({ id, ownerId, heroId, role, score } = {}) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    simulated: true,
    standin: true,
    entry: {
      id,
      owner_id: ownerId,
      hero_id: heroId,
    },
  };
}

describe('matching extensive scenarios', () => {
  it('fills multi-role multi-slot rooms', () => {
    const roles = [
      { name: 'attack', slot_count: 2 },
      { name: 'support', slot_count: 2 },
    ];

    const queue = [
      buildQueueEntry({ id: 'q1', ownerId: 'a', heroId: 'ha', role: 'attack', score: 1100 }),
      buildQueueEntry({ id: 'q2', ownerId: 'b', heroId: 'hb', role: 'attack', score: 1120 }),
      buildQueueEntry({ id: 'q3', ownerId: 'c', heroId: 'hc', role: 'support', score: 1150 }),
      buildQueueEntry({ id: 'q4', ownerId: 'd', heroId: 'hd', role: 'support', score: 1160 }),
    ];

  const result = matchRankParticipants({ roles, queue, scoreWindows: [300] });
  expect(result.ready).toBe(true);
  expect(result.totalSlots).toBe(4);
  // This scenario fills multi-role slots; check the per-role scoped assignments
  // produced in `roleAssignments`.
  expect(result.roleAssignments).toHaveLength(2);
  const filled = result.roleAssignments.reduce((acc, a) => acc + (a.slots || 0), 0);
  expect(filled).toBe(4);
  });

  it('respects party grouping for multi-member parties', () => {
    const roles = [{ name: 'duo', slot_count: 2 }];
    const queue = [
      buildQueueEntry({ id: 'p1-0', ownerId: 'owner1', heroId: 'h1', role: 'duo', score: 1000, partyKey: 'partyX' }),
      buildQueueEntry({ id: 'p1-1', ownerId: 'owner2', heroId: 'h2', role: 'duo', score: 1000, partyKey: 'partyX' }),
    ];

    const result = matchRankParticipants({ roles, queue });
    expect(result.ready).toBe(true);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].ready).toBe(true);
    expect(result.assignments[0].members).toHaveLength(2);
  });

  it('async matcher fills missing slots from standin pool', () => {
    const roles = [
      { name: 'attack', slot_count: 1 },
      { name: 'support', slot_count: 1 },
    ];

    const queue = [
      buildQueueEntry({ id: 'real-attack', ownerId: 'human1', heroId: 'h-real', role: 'attack', score: 1200 }),
    ];

    const standins = [
      buildStandin({ id: 's1', ownerId: 'bot1', heroId: 'hb1', role: 'support', score: 1100 }),
    ];

    const result = matchAsyncParticipants({ roles, queue, standins, scoreWindows: [500] });
    expect(result.ready).toBe(true);
    expect(result.totalSlots).toBe(2);
    const members = result.assignments.flatMap(a => a.members || []);
    // should include human and standin
    expect(members.some(m => String(m.owner_id) === 'human1')).toBe(true);
    expect(members.some(m => String(m.owner_id) === 'bot1')).toBe(true);
  });

  it('async matcher reports not-ready when standins insufficient', () => {
    const roles = [
      { name: 'attack', slot_count: 1 },
      { name: 'support', slot_count: 1 },
    ];

    const queue = [
      buildQueueEntry({ id: 'real-attack', ownerId: 'human1', heroId: 'h-real', role: 'attack', score: 1200 }),
    ];

    const standins = []; // none available

    const result = matchAsyncParticipants({ roles, queue, standins, scoreWindows: [500] });
    expect(result.ready).toBe(false);
    // should indicate missing candidate for support
    expect(result.error).toBeTruthy();
  });
});
