const { runClientAction } = require('../lib/rank/clientActions');

describe('clientActions', () => {
  test('award_xp increases xp for owner', async () => {
    const participants = [
      { owner_id: 'user-1', meta: { xp: 5 } },
      { owner_id: 'user-2', meta: {} },
    ];

    const res = await runClientAction('award_xp', {
      payload: { ownerId: 'user-1', amount: 10 },
      participants,
    });
    expect(res.ok).toBe(true);
    expect(res.changes).toBeDefined();
    const updated = res.changes.participants;
    const p1 = updated.find(p => p.owner_id === 'user-1');
    expect(p1.meta.xp).toBe(15);
  });

  test('give_item adds item to owner meta.items', async () => {
    const participants = [
      { owner_id: 'user-1', meta: { items: ['shield'] } },
      { owner_id: 'user-2', meta: {} },
    ];

    const res = await runClientAction('give_item', {
      payload: { ownerId: 'user-2', itemId: 'sword' },
      participants,
    });
    expect(res.ok).toBe(true);
    const updated = res.changes.participants;
    const p2 = updated.find(p => p.owner_id === 'user-2');
    expect(Array.isArray(p2.meta.items)).toBe(true);
    expect(p2.meta.items).toContain('sword');
  });

  test('toggle_flag flips a named flag', async () => {
    const participants = [{ owner_id: 'user-1', meta: { flags: { god: false } } }];

    const res1 = await runClientAction('toggle_flag', {
      payload: { ownerId: 'user-1', flag: 'god' },
      participants,
    });
    expect(res1.ok).toBe(true);
    let updated = res1.changes.participants;
    let p = updated.find(p => p.owner_id === 'user-1');
    expect(p.meta.flags.god).toBe(true);

    const res2 = await runClientAction('toggle_flag', {
      payload: { ownerId: 'user-1', flag: 'god' },
      participants: updated,
    });
    expect(res2.ok).toBe(true);
    updated = res2.changes.participants;
    p = updated.find(p => p.owner_id === 'user-1');
    expect(p.meta.flags.god).toBe(false);
  });
});
