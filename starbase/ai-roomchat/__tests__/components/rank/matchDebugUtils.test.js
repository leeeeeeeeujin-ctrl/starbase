import { summarizeAssignments, summarizeRemovedMembers } from '@/components/rank/matchDebugUtils';

describe('matchDebugUtils.summarizeAssignments', () => {
  it('flattens role slots and preserves individual roles', () => {
    const assignments = [
      {
        role: '수비 · 공격',
        roleSlots: [
          {
            slotIndex: 0,
            role: '수비',
            members: [
              { owner_id: 'owner-a', hero_id: 'hero-a', ready: true },
              { owner_id: 'owner-a', hero_id: 'hero-a', ready: true },
            ],
          },
          {
            slotIndex: 1,
            role: '공격',
            members: [{ owner_id: 'owner-b', hero_id: 'hero-b', ready: false }],
          },
        ],
        removedMembers: [
          { ownerId: 'owner-a', heroId: 'hero-a', slotIndex: 0, reason: 'duplicate_slot_member' },
          { ownerId: 'owner-a', heroId: 'hero-a', slotIndex: 0, reason: 'duplicate_slot_member' },
          { ownerId: 'owner-b', heroId: 'hero-b', slotIndex: 1, reason: 'duplicate_slot_member' },
        ],
      },
    ];

    const summary = summarizeAssignments(assignments);

    expect(summary).toEqual([
      {
        role: '수비',
        slotIndex: 0,
        members: [
          {
            index: 0,
            ownerId: 'owner-a',
            heroId: 'hero-a',
            ready: true,
            standin: false,
            status: null,
            heroName: null,
          },
          {
            index: 1,
            ownerId: 'owner-a',
            heroId: 'hero-a',
            ready: true,
            standin: false,
            status: null,
            heroName: null,
          },
        ],
        removedMembers: [
          {
            ownerId: 'owner-a',
            heroId: 'hero-a',
            slotIndex: 0,
            role: null,
            reason: 'duplicate_slot_member',
            slotKey: null,
          },
        ],
      },
      {
        role: '공격',
        slotIndex: 1,
        members: [
          {
            index: 0,
            ownerId: 'owner-b',
            heroId: 'hero-b',
            ready: false,
            standin: false,
            status: null,
            heroName: null,
          },
        ],
        removedMembers: [
          {
            ownerId: 'owner-b',
            heroId: 'hero-b',
            slotIndex: 1,
            role: null,
            reason: 'duplicate_slot_member',
            slotKey: null,
          },
        ],
      },
    ]);
  });

  it('falls back to aggregated members when slots are missing', () => {
    const assignments = [
      {
        role: '지원',
        members: [
          { owner_id: 'owner-c', hero_id: 'hero-c', ready: false },
          { owner_id: 'owner-d', hero_id: 'hero-d', ready: true },
        ],
      },
    ];

    const summary = summarizeAssignments(assignments);

    expect(summary).toEqual([
      {
        role: '지원',
        slotIndex: 0,
        members: [
          {
            index: 0,
            ownerId: 'owner-c',
            heroId: 'hero-c',
            ready: false,
            standin: false,
            status: null,
            heroName: null,
          },
          {
            index: 1,
            ownerId: 'owner-d',
            heroId: 'hero-d',
            ready: true,
            standin: false,
            status: null,
            heroName: null,
          },
        ],
        removedMembers: [],
      },
    ]);
  });
});

describe('matchDebugUtils.summarizeRemovedMembers', () => {
  it('deduplicates identical removed entries', () => {
    const entries = [
      { ownerId: 'owner-a', heroId: 'hero-a', slotIndex: 0, reason: 'duplicate' },
      { ownerId: 'owner-a', heroId: 'hero-a', slotIndex: 0, reason: 'duplicate' },
      {
        ownerId: 'owner-a',
        heroId: 'hero-a',
        slotIndex: 0,
        reason: 'duplicate',
        slotKey: 'slot:0',
      },
      { ownerId: 'owner-b', heroId: 'hero-b', slotIndex: 1, reason: 'duplicate' },
    ];

    const summary = summarizeRemovedMembers(entries);

    expect(summary).toEqual([
      {
        ownerId: 'owner-a',
        heroId: 'hero-a',
        slotIndex: 0,
        role: null,
        reason: 'duplicate',
        slotKey: null,
      },
      {
        ownerId: 'owner-a',
        heroId: 'hero-a',
        slotIndex: 0,
        role: null,
        reason: 'duplicate',
        slotKey: 'slot:0',
      },
      {
        ownerId: 'owner-b',
        heroId: 'hero-b',
        slotIndex: 1,
        role: null,
        reason: 'duplicate',
        slotKey: null,
      },
    ]);
  });
});
