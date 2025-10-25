import { buildSlotsFromParticipants } from '@/lib/promptEngine/slots';

describe('buildSlotsFromParticipants', () => {
  it('places heroes into their zero-based slot positions', () => {
    const slots = buildSlotsFromParticipants([
      {
        slot_no: 1,
        hero_id: 'beta',
        role: 'defense',
        status: 'alive',
        hero: { name: '베타' },
      },
      {
        slot_no: 0,
        hero_id: 'alpha',
        role: 'attack',
        status: 'alive',
        hero: { name: '알파' },
      },
    ]);

    expect(slots).toHaveLength(2);
    expect(slots[0]?.id).toBe('alpha');
    expect(slots[0]?.slot_no).toBe(0);
    expect(slots[1]?.id).toBe('beta');
    expect(slots[1]?.slot_no).toBe(1);
  });

  it('keeps empty slots empty when indices are missing', () => {
    const slots = buildSlotsFromParticipants([
      {
        slot_no: 2,
        hero_id: 'gamma',
        role: 'support',
        status: 'alive',
        hero: { name: '감마' },
      },
    ]);

    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(slots[0]).toBeUndefined();
    expect(slots[1]).toBeUndefined();
    expect(slots[2]?.slot_no).toBe(2);
  });

  it('appends overflow entries without slot numbers at the end', () => {
    const slots = buildSlotsFromParticipants([
      {
        slot_no: 0,
        hero_id: 'alpha',
        hero: { name: '알파' },
      },
      {
        hero_id: 'omega',
        hero: { name: '오메가' },
      },
    ]);

    expect(slots[0]?.id).toBe('alpha');
    expect(slots[1]?.id).toBe('omega');
    expect(slots[1]?.slot_no).toBeNull();
  });
});
