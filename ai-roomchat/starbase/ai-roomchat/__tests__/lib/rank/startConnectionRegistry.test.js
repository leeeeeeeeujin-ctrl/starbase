import {
  getConnectionEntriesForGame,
  registerMatchConnections,
  removeConnectionEntries,
} from '@/lib/rank/startConnectionRegistry';

function createMatchPayload() {
  return {
    matchCode: 'ABC123',
    assignments: [
      {
        role: 'attacker',
        roleSlots: [
          {
            role: 'attacker',
            slotIndex: 0,
            localIndex: 0,
          },
        ],
        members: [
          {
            owner_id: 'owner-1',
            hero_id: 'hero-1',
            hero_name: 'Alpha',
          },
        ],
      },
      {
        role: 'defender',
        roleSlots: [
          {
            role: 'defender',
            slotIndex: 1,
            localIndex: 0,
          },
        ],
        members: [
          {
            owner_id: 'owner-2',
            hero_id: 'hero-2',
            hero_name: 'Beta',
          },
        ],
      },
    ],
    heroMap: new Map([
      [
        'hero-1',
        {
          id: 'hero-1',
          name: 'Alpha Hero',
        },
      ],
      [
        'hero-2',
        {
          id: 'hero-2',
          name: 'Beta Hero',
        },
      ],
    ]),
  };
}

describe('startConnectionRegistry', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear();
    }
  });

  test('registerMatchConnections stores roster entries for each assignment', () => {
    const match = createMatchPayload();
    registerMatchConnections({ gameId: 'game-1', match, viewerId: 'owner-1' });

    const entries = getConnectionEntriesForGame('game-1');
    expect(entries).toHaveLength(2);

    const attacker = entries.find(entry => entry.ownerId === 'owner-1');
    expect(attacker).toBeTruthy();
    expect(attacker.heroId).toBe('hero-1');
    expect(attacker.role).toBe('attacker');
    expect(attacker.slotIndex).toBe(0);
    expect(attacker.viewerId).toBe('owner-1');

    const defender = entries.find(entry => entry.ownerId === 'owner-2');
    expect(defender).toBeTruthy();
    expect(defender.heroName).toBe('Beta Hero');
    expect(defender.slotIndex).toBe(1);
  });

  test('registerMatchConnections updates existing owner entry with latest hero and slot data', () => {
    const match = createMatchPayload();
    registerMatchConnections({ gameId: 'game-1', match, viewerId: 'owner-1' });

    const updatedMatch = {
      ...match,
      assignments: [
        {
          role: 'attacker',
          roleSlots: [
            {
              role: 'attacker',
              slotIndex: 2,
              localIndex: 2,
            },
          ],
          members: [
            {
              owner_id: 'owner-1',
              hero_id: 'hero-9',
              hero_name: 'Omega',
            },
          ],
        },
      ],
      heroMap: {
        'hero-9': { id: 'hero-9', name: 'Omega Hero' },
      },
    };

    registerMatchConnections({ gameId: 'game-1', match: updatedMatch, viewerId: 'owner-1' });

    const entries = getConnectionEntriesForGame('game-1');
    expect(entries).toHaveLength(2);
    const attacker = entries.find(entry => entry.ownerId === 'owner-1');
    expect(attacker.heroId).toBe('hero-9');
    expect(attacker.heroName).toBe('Omega Hero');
    expect(attacker.slotIndex).toBe(2);
  });

  test('removeConnectionEntries clears roster for the specified game', () => {
    const match = createMatchPayload();
    registerMatchConnections({ gameId: 'game-1', match, viewerId: 'owner-1' });
    expect(getConnectionEntriesForGame('game-1')).toHaveLength(2);

    removeConnectionEntries({ gameId: 'game-1' });
    expect(getConnectionEntriesForGame('game-1')).toHaveLength(0);
  });
});
