import {
  reconcileParticipantsForGame,
  formatPreflightSummary,
} from '@/components/rank/StartClient/engine/preflight';

describe('reconcileParticipantsForGame', () => {
  const baseHero = {
    id: 'hero-alpha',
    name: '알파',
  };

  it('keeps participants whose roles match the slot layout', () => {
    const result = reconcileParticipantsForGame({
      participants: [
        { id: 'p1', role: 'attack', slot_no: 0, hero: baseHero },
        { id: 'p2', role: 'defense', slot_no: 1, hero: { id: 'hero-beta', name: '베타' } },
      ],
      slotLayout: [
        { slot_index: 0, role: 'attack' },
        { slot_index: 1, role: 'defense' },
      ],
    });

    expect(result.participants).toHaveLength(2);
    expect(result.removed).toHaveLength(0);
  });

  it('removes participants whose roles conflict with slot expectations', () => {
    const result = reconcileParticipantsForGame({
      participants: [
        { id: 'p1', role: 'defense', slot_no: 0, hero: baseHero },
        { id: 'p2', role: 'defense', slot_no: 1, hero: { id: 'hero-beta', name: '베타' } },
      ],
      slotLayout: [
        { slot_index: 0, role: 'attack' },
        { slot_index: 1, role: 'defense' },
      ],
    });

    expect(result.participants).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toMatchObject({
      participantId: 'p1',
      expectedRole: 'attack',
      actualRole: 'defense',
      slotIndex: 0,
    });
  });

  it('consults matching metadata when layout data is incomplete', () => {
    const participants = [
      {
        id: 'p-meta',
        role: 'support',
        slot_no: 2,
        hero_id: 'hero-meta',
        hero: { id: 'hero-meta', name: '메타' },
        owner_id: 'owner-42',
      },
    ];

    const matchingMetadata = {
      assignments: [
        {
          role: 'attack',
          members: [{ hero_id: 'hero-meta', owner_id: 'owner-42', slot_no: 2 }],
        },
      ],
    };

    const result = reconcileParticipantsForGame({
      participants,
      slotLayout: [],
      matchingMetadata,
    });

    expect(result.participants).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toMatchObject({
      participantId: 'p-meta',
      expectedRole: 'attack',
      actualRole: 'support',
    });
  });
});

describe('formatPreflightSummary', () => {
  it('produces a readable summary for removed participants', () => {
    const text = formatPreflightSummary([
      {
        heroName: '알파',
        slotIndex: 3,
        expectedRole: 'attack',
        actualRole: 'support',
      },
    ]);

    expect(text).toContain('알파');
    expect(text).toContain('슬롯 3');
    expect(text).toContain('attack');
    expect(text).toContain('support');
  });
});
