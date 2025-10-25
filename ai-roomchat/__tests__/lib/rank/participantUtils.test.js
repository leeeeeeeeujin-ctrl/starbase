import {
  buildOwnerParticipantIndex,
  guessOwnerParticipant,
  normalizeHeroIdValue,
  normalizeParticipantRecord,
  resolveParticipantHeroId,
} from '@/lib/rank/participantUtils';

describe('normalizeHeroIdValue', () => {
  it('normalizes numeric ids to strings', () => {
    expect(normalizeHeroIdValue(42)).toBe('42');
  });

  it('returns null for empty strings', () => {
    expect(normalizeHeroIdValue('   ')).toBeNull();
  });
});

describe('resolveParticipantHeroId', () => {
  it('prefers direct hero_id when present', () => {
    expect(
      resolveParticipantHeroId({
        hero_id: 'hero-direct',
        hero_ids: ['hero-fallback'],
      })
    ).toBe('hero-direct');
  });

  it('falls back to hero_ids array when direct id missing', () => {
    expect(resolveParticipantHeroId({ hero_ids: [null, 'hero-alt'] })).toBe('hero-alt');
  });

  it('falls back to nested hero object id', () => {
    expect(resolveParticipantHeroId({ hero: { id: 123 } })).toBe('123');
  });
});

describe('normalizeParticipantRecord', () => {
  it('normalizes participant fields for roster indexing', () => {
    const record = normalizeParticipantRecord({
      owner_id: 'owner-1',
      hero_id: 'hero-1',
      role: 'attack',
      score: 1500,
      slot_index: 1,
      updated_at: '2024-02-01T10:00:00Z',
    });

    expect(record).toMatchObject({
      ownerId: 'owner-1',
      heroId: 'hero-1',
      role: 'attack',
      score: 1500,
      slotIndex: 1,
    });
    expect(record.updatedAt).toBeGreaterThan(0);
  });
});

describe('buildOwnerParticipantIndex', () => {
  it('groups participants by owner and sorts by recency', () => {
    const roster = buildOwnerParticipantIndex([
      {
        owner_id: 'owner-1',
        hero_id: 'hero-old',
        role: 'tank',
        updated_at: '2023-12-01T00:00:00Z',
      },
      {
        owner_id: 'owner-1',
        hero_id: 'hero-new',
        role: 'attack',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        owner_id: 'owner-2',
        hero_id: 'hero-support',
        role: 'support',
      },
    ]);

    expect(roster.get('owner-1')?.[0]?.heroId).toBe('hero-new');
    expect(roster.get('owner-1')?.[1]?.heroId).toBe('hero-old');
    expect(roster.get('owner-2')?.[0]?.heroId).toBe('hero-support');
  });
});

describe('guessOwnerParticipant', () => {
  it('prefers matching role entries when available', () => {
    const roster = buildOwnerParticipantIndex([
      {
        owner_id: 'owner-3',
        hero_id: 'hero-attack',
        role: 'attack',
      },
      {
        owner_id: 'owner-3',
        hero_id: 'hero-support',
        role: 'support',
      },
    ]);

    const guess = guessOwnerParticipant({
      ownerId: 'owner-3',
      roster,
      rolePreference: 'support',
    });

    expect(guess.heroId).toBe('hero-support');
    expect(guess.role).toBe('support');
  });

  it('falls back to explicit hero when roster missing', () => {
    const guess = guessOwnerParticipant({
      ownerId: 'owner-4',
      roster: new Map(),
      fallbackHeroId: 'hero-explicit',
    });

    expect(guess.heroId).toBe('hero-explicit');
    expect(guess.source).toBe('explicit');
  });
});
