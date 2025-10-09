import {
  clearGameMatchData,
  hydrateGameMatchData,
  setGameMatchConfirmation,
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchSnapshot,
  setGameMatchSlotTemplate,
  setGameMatchSessionMeta,
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

  it('builds async fill snapshot for async lobbies', () => {
    setGameMatchParticipation(gameId, {
      roster: [
        {
          slotId: 'slot-1',
          slotIndex: 0,
          role: '지휘관',
          ownerId: 'host-1',
          heroId: 'hero-host',
          heroName: '호스트',
          ready: true,
        },
        {
          slotId: 'slot-2',
          slotIndex: 1,
          role: '지휘관',
          ownerId: 'ally-1',
          heroId: 'hero-ally-1',
          heroName: '동료1',
          ready: true,
        },
        {
          slotId: 'slot-3',
          slotIndex: 2,
          role: '지휘관',
          ownerId: null,
          heroId: null,
          heroName: '',
          ready: false,
        },
        {
          slotId: 'slot-4',
          slotIndex: 3,
          role: '지휘관',
          ownerId: 'ally-2',
          heroId: 'hero-ally-2',
          heroName: '동료2',
          ready: true,
        },
        {
          slotId: 'slot-5',
          slotIndex: 4,
          role: '지휘관',
          ownerId: 'ally-3',
          heroId: 'hero-ally-3',
          heroName: '동료3',
          ready: true,
        },
        {
          slotId: 'slot-6',
          slotIndex: 5,
          role: '탱커',
          ownerId: 'tank-1',
          heroId: 'hero-tank',
          heroName: '탱커',
          ready: true,
        },
      ],
      heroOptions: [],
      participantPool: [
        { ownerId: 'ally-1', role: '지휘관' },
        { ownerId: 'candidate-1', role: '지휘관', heroName: '예비1' },
        { ownerId: 'candidate-2', role: '탱커', heroName: '예비탱커' },
      ],
      heroMap: null,
      realtimeMode: 'off',
      hostOwnerId: 'host-1',
      hostRoleLimit: 3,
    })

    const snapshot = hydrateGameMatchData(gameId)
    const asyncFill = snapshot?.sessionMeta?.asyncFill
    expect(asyncFill?.mode).toBe('off')
    expect(asyncFill?.seatLimit).toMatchObject({ allowed: 3, total: 5 })
    expect(asyncFill?.pendingSeatIndexes).toContain(2)
    expect(asyncFill?.overflow?.map((entry) => entry.slotIndex)).toContain(4)
    expect(asyncFill?.fillQueue).toHaveLength(1)
    expect(asyncFill?.fillQueue?.[0]).toMatchObject({ ownerId: 'candidate-1' })
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

  it('stores slot template data with version metadata', () => {
    setGameMatchSlotTemplate(gameId, {
      slots: [
        {
          slotId: 'slot-1',
          slotIndex: '1',
          role: '딜러',
          ownerId: 'owner-1',
          heroId: 'hero-1',
          heroName: '라나',
          ready: true,
        },
        {
          slotIndex: 'not-a-number',
          role: '탱커',
        },
      ],
      roles: [
        {
          role: '딜러',
          slots: '2',
          members: [
            { ownerId: 'owner-1', heroId: 'hero-1', slotIndex: '1', ready: true },
            { owner_id: 'owner-2', hero_id: 'hero-2' },
          ],
        },
      ],
      version: '3',
      source: 'room-stage',
      updatedAt: 123456,
    })

    const snapshot = hydrateGameMatchData(gameId)
    expect(snapshot?.slotTemplate?.version).toBe(3)
    expect(snapshot?.slotTemplate?.source).toBe('room-stage')
    expect(snapshot?.slotTemplate?.updatedAt).toBe(123456)
    expect(snapshot?.slotTemplate?.slots).toHaveLength(2)
    expect(snapshot?.slotTemplate?.slots?.[0]).toMatchObject({
      slotIndex: 1,
      role: '딜러',
      ownerId: 'owner-1',
    })
    expect(snapshot?.slotTemplate?.roles).toHaveLength(1)
    expect(snapshot?.slotTemplate?.roles?.[0]).toMatchObject({
      role: '딜러',
      slots: 2,
    })
  })

  it('merges session meta updates and supports clearing data', () => {
    setGameMatchSessionMeta(gameId, {
      turnTimer: { baseSeconds: 90, source: 'vote' },
      dropIn: { bonusSeconds: 30 },
      source: 'room-stage',
    })

    const firstSnapshot = hydrateGameMatchData(gameId)
    expect(firstSnapshot?.sessionMeta?.turnTimer).toMatchObject({
      baseSeconds: 90,
      source: 'vote',
    })
    expect(firstSnapshot?.sessionMeta?.dropIn).toMatchObject({ bonusSeconds: 30 })
    expect(firstSnapshot?.sessionMeta?.source).toBe('room-stage')
    expect(firstSnapshot?.sessionMeta?.updatedAt).toBeGreaterThan(0)
    expect(firstSnapshot?.sessionMeta?.turnState).toMatchObject({ turnNumber: 0 })

    setGameMatchSessionMeta(gameId, {
      vote: { '30': 2, '60': 1 },
    })

    const secondSnapshot = hydrateGameMatchData(gameId)
    expect(secondSnapshot?.sessionMeta?.turnTimer).toMatchObject({ baseSeconds: 90 })
    expect(secondSnapshot?.sessionMeta?.vote).toMatchObject({ '30': 2, '60': 1 })

    setGameMatchSessionMeta(gameId, {
      turnState: {
        turnNumber: 3,
        scheduledAt: 10,
        deadline: 6010,
        durationSeconds: 60,
        remainingSeconds: 45,
        dropInBonusSeconds: 15,
        dropInBonusAppliedAt: 12,
        dropInBonusTurn: 3,
        status: 'scheduled',
      },
    })

    const thirdSnapshot = hydrateGameMatchData(gameId)
    expect(thirdSnapshot?.sessionMeta?.turnTimer).toMatchObject({ baseSeconds: 90 })
    expect(thirdSnapshot?.sessionMeta?.turnState).toMatchObject({
      turnNumber: 3,
      deadline: 6010,
      remainingSeconds: 45,
      dropInBonusSeconds: 15,
      status: 'scheduled',
    })

    setGameMatchSessionMeta(gameId, null)

    const clearedSnapshot = hydrateGameMatchData(gameId)
    expect(clearedSnapshot?.sessionMeta?.turnTimer).toBeNull()
    expect(clearedSnapshot?.sessionMeta?.vote).toBeNull()
    expect(clearedSnapshot?.sessionMeta?.dropIn).toBeNull()
    expect(clearedSnapshot?.sessionMeta?.turnState).toMatchObject({
      turnNumber: 0,
      deadline: 0,
      remainingSeconds: 0,
    })
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
