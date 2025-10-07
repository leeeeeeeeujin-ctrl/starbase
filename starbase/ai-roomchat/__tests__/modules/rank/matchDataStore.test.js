import {
  clearGameMatchData,
  hydrateGameMatchData,
  setGameMatchConfirmation,
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchSnapshot,
} from '../../../modules/rank/matchDataStore'

describe('matchDataStore', () => {
  const gameId = 'test-game'

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear()
    }
    clearGameMatchData(gameId)
  })

  it('stores hero selection per game', () => {
    setGameMatchHeroSelection(gameId, {
      heroId: 'hero-1',
      viewerId: 'owner-1',
      role: '공격',
    })

    const snapshot = hydrateGameMatchData(gameId)
    expect(snapshot?.heroSelection).toMatchObject({
      heroId: 'hero-1',
      viewerId: 'owner-1',
      role: '공격',
    })
  })

  it('keeps participation lists and hero options', () => {
    setGameMatchParticipation(gameId, {
      roster: [{ heroId: 'hero-1', role: '공격' }],
      heroOptions: [{ heroId: 'hero-1', name: '유이' }],
      heroMap: new Map([
        [
          'hero-1',
          {
            id: 'hero-1',
            name: '유이',
          },
        ],
      ]),
    })

    const snapshot = hydrateGameMatchData(gameId)
    expect(snapshot?.participation?.roster).toHaveLength(1)
    expect(snapshot?.participation?.heroOptions).toHaveLength(1)
    expect(snapshot?.participation?.heroMap).toHaveProperty('hero-1')
  })

  it('persists match snapshots to session storage', () => {
    const createdAt = Date.now()
    setGameMatchSnapshot(gameId, {
      match: { matchCode: 'ABCD', matchType: 'standard' },
      viewerId: 'owner-1',
      heroId: 'hero-1',
      role: '공격',
      mode: 'rank',
      createdAt,
    })

    const stored = hydrateGameMatchData(gameId)
    expect(stored?.matchSnapshot).toMatchObject({
      match: { matchCode: 'ABCD', matchType: 'standard' },
      viewerId: 'owner-1',
      heroId: 'hero-1',
      role: '공격',
      mode: 'rank',
      createdAt,
    })

    const raw = window.sessionStorage.getItem(`rank.match.game.${gameId}`)
    expect(raw).toBeTruthy()
  })

  it('updates confirmation payloads consistently', () => {
    setGameMatchConfirmation(gameId, {
      gameId,
      mode: 'rank',
      roleName: '공격',
      viewerId: 'owner-1',
      heroId: 'hero-1',
      createdAt: Date.now(),
    })

    const snapshot = hydrateGameMatchData(gameId)
    expect(snapshot?.confirmation).toMatchObject({
      gameId,
      mode: 'rank',
      roleName: '공격',
    })
  })
})
