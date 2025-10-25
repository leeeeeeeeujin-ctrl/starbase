import {
  buildOwnerParticipantMap,
  buildOwnerRosterSnapshot,
  collectUniqueOwnerIds,
} from '@/components/rank/StartClient/engine/participants';

describe('participants helpers', () => {
  const makeParticipant = (overrides = {}) => ({
    id: overrides.id || Math.random().toString(36).slice(2),
    owner_id: overrides.owner_id ?? overrides.ownerId ?? 'owner-a',
    role: overrides.role || 'attacker',
    status: overrides.status || 'active',
    hero: overrides.hero || { id: 'hero-1', name: 'Hero One' },
    ...overrides,
  });

  it('collects unique owner ids in first-seen order', () => {
    const participants = [
      makeParticipant({ owner_id: 'alpha ' }),
      makeParticipant({ owner_id: 'beta' }),
      makeParticipant({ owner_id: 'alpha' }),
      makeParticipant({ owner_id: 'gamma' }),
    ];

    expect(collectUniqueOwnerIds(participants)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('builds an owner-participant map keyed by normalized owner id', () => {
    const first = makeParticipant({ owner_id: ' viewer-1 ' });
    const second = makeParticipant({ owner_id: 'viewer-2', hero: { id: 'hero-2' } });
    const fallback = makeParticipant({ owner_id: 'viewer-1', hero: { id: 'hero-3' } });

    const map = buildOwnerParticipantMap([first, second, fallback]);

    expect(Array.from(map.keys())).toEqual(['viewer-1', 'viewer-2']);
    expect(map.get('viewer-1')).toBe(first);
    expect(map.get('viewer-2')).toBe(second);
  });

  it('creates a roster snapshot with hero metadata', () => {
    const participants = [
      makeParticipant({ owner_id: 'one', hero: { id: 'h1', name: 'Alpha' }, role: 'tank' }),
      makeParticipant({ owner_id: 'two', hero_id: 'h2', hero: { name: 'Beta' }, role: 'dps' }),
      makeParticipant({ owner_id: 'one', hero: { id: 'h3', name: 'Gamma' }, role: 'support' }),
    ];

    expect(buildOwnerRosterSnapshot(participants)).toEqual([
      {
        ownerId: 'one',
        heroId: 'h1',
        heroName: 'Alpha',
        role: 'tank',
        status: 'active',
      },
      {
        ownerId: 'two',
        heroId: 'h2',
        heroName: 'Beta',
        role: 'dps',
        status: 'active',
      },
    ]);
  });
});
