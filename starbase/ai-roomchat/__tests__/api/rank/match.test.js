import handler from '@/pages/api/rank/match'

jest.mock('@/lib/supabaseTables', () => ({
  withTable: jest.fn(),
}))

jest.mock('@/lib/rank/matchingPipeline', () => ({
  buildCandidateSample: jest.fn(),
  extractMatchingToggles: jest.fn(),
  findRealtimeDropInTarget: jest.fn(),
  loadMatchingResources: jest.fn(),
}))

jest.mock('@/lib/rank/matchmakingLogs', () => ({
  recordMatchmakingLog: jest.fn(),
  buildAssignmentSummary: jest.fn(() => ({})),
}))

jest.mock('@/lib/rank/matchRoleSummary', () => ({
  computeRoleReadiness: jest.fn(),
}))

jest.mock('@/lib/rank/matchmakingService', () => ({
  loadHeroesByIds: jest.fn(),
  markAssignmentsMatched: jest.fn(),
  runMatching: jest.fn(),
  flattenAssignmentMembers: jest.fn(),
  postCheckMatchAssignments: jest.fn(),
  sanitizeAssignments: jest.fn(),
}))

jest.mock('@/lib/rank/db', () => ({
  supabase: {},
}))

const { withTable } = require('@/lib/supabaseTables')
const {
  buildCandidateSample,
  extractMatchingToggles,
  findRealtimeDropInTarget,
  loadMatchingResources,
} = require('@/lib/rank/matchingPipeline')
const { recordMatchmakingLog } = require('@/lib/rank/matchmakingLogs')
const { computeRoleReadiness } = require('@/lib/rank/matchRoleSummary')
const {
  loadHeroesByIds,
  markAssignmentsMatched,
  runMatching,
  flattenAssignmentMembers,
  postCheckMatchAssignments,
  sanitizeAssignments: sanitizeAssignmentsMock,
} = require('@/lib/rank/matchmakingService')

function createReq(body = {}) {
  return { method: 'POST', body }
}

function createRes() {
  const res = {}
  res.statusCode = 200
  res.headers = {}
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.setHeader = (name, value) => {
    res.headers[name] = value
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  return res
}

describe('POST /api/rank/match', () => {
  const hostOwnerId = '26002fab-6edc-4956-9c56-3f2d6f4f9b1d'
  const hostHeroId = '0f98b94a-5e6a-4fd8-8070-cb7802620b80'
  const standinOwnerId = 'f63ce37c-d3bd-4c00-b9fc-bac4d74b2c89'
  const standinHeroId = '57e894fc-60ac-42a5-9b07-c18f8b88b3f2'

  const duplicateAssignments = [
    {
      role: '공격 · 수비',
      members: [
        { owner_id: hostOwnerId, hero_id: hostHeroId },
        { owner_id: hostOwnerId, hero_id: hostHeroId },
        { owner_id: standinOwnerId, hero_id: standinHeroId },
        { owner_id: standinOwnerId, hero_id: standinHeroId },
      ],
      roleSlots: [
        {
          role: '공격',
          slotIndex: 0,
          members: [
            { owner_id: hostOwnerId, hero_id: hostHeroId },
            { owner_id: hostOwnerId, hero_id: hostHeroId },
          ],
          member: { owner_id: hostOwnerId, hero_id: hostHeroId },
        },
        {
          role: '수비',
          slotIndex: 1,
          members: [
            { owner_id: standinOwnerId, hero_id: standinHeroId },
            { owner_id: standinOwnerId, hero_id: standinHeroId },
          ],
          member: { owner_id: standinOwnerId, hero_id: standinHeroId },
        },
      ],
    },
  ]

  const postCheckAssignments = [
    {
      role: '공격 · 수비',
      members: [
        { owner_id: hostOwnerId, hero_id: hostHeroId },
        { owner_id: hostOwnerId, hero_id: hostHeroId },
        { owner_id: standinOwnerId, hero_id: standinHeroId },
        { owner_id: standinOwnerId, hero_id: standinHeroId },
      ],
      roleSlots: duplicateAssignments[0].roleSlots,
    },
  ]

  const sanitizedMembers = [
    { owner_id: hostOwnerId, hero_id: hostHeroId },
    { owner_id: standinOwnerId, hero_id: standinHeroId, standin: true },
  ]

  const sanitizedRoleSlots = [
    {
      role: '공격',
      slotIndex: 0,
      occupied: true,
      members: [{ owner_id: hostOwnerId, hero_id: hostHeroId }],
      member: { owner_id: hostOwnerId, hero_id: hostHeroId },
    },
    {
      role: '수비',
      slotIndex: 1,
      occupied: true,
      members: [{ owner_id: standinOwnerId, hero_id: standinHeroId, standin: true }],
      member: { owner_id: standinOwnerId, hero_id: standinHeroId, standin: true },
    },
  ]

  const sanitizedRemoved = [
    {
      ownerId: hostOwnerId,
      heroId: hostHeroId,
      role: '공격',
      slotIndex: 0,
      reason: 'duplicate_owner',
    },
    {
      ownerId: standinOwnerId,
      heroId: standinHeroId,
      role: '수비',
      slotIndex: 1,
      reason: 'duplicate_owner',
    },
  ]

  const sanitizedFirst = [
    {
      role: '공격 · 수비',
      members: sanitizedMembers,
      roleSlots: sanitizedRoleSlots,
      removedMembers: sanitizedRemoved,
    },
  ]

  const sanitizedSecond = [
    {
      role: '공격 · 수비',
      members: sanitizedMembers,
      roleSlots: sanitizedRoleSlots,
      removedMembers: sanitizedRemoved,
    },
  ]

  beforeEach(() => {
    jest.resetAllMocks()

    withTable.mockResolvedValue({
      data: { id: 'game-1', realtime_match: false, rules: '{}' },
      error: null,
    })

    extractMatchingToggles.mockReturnValue({
      realtimeEnabled: false,
      dropInEnabled: false,
    })

    loadMatchingResources.mockResolvedValue({
      roles: [{ name: '공격' }, { name: '수비' }],
      slotLayout: [
        { slotIndex: 0, role: '공격' },
        { slotIndex: 1, role: '수비' },
      ],
      queue: [],
      participantPool: [],
      roleStatusMap: new Map(),
    })

    buildCandidateSample.mockReturnValue({ sample: [], meta: {}, standins: [] })
    findRealtimeDropInTarget.mockResolvedValue(null)

    runMatching.mockResolvedValue({
      ready: true,
      assignments: duplicateAssignments,
      rooms: [],
      totalSlots: 2,
      maxWindow: 0,
    })

    postCheckMatchAssignments.mockResolvedValue({
      assignments: postCheckAssignments,
      rooms: [],
      removedMembers: [
        {
          ownerId: 'extra-owner',
          heroId: 'extra-hero',
          role: '지원',
          slotIndex: 2,
          reason: 'post_check',
        },
      ],
    })

    computeRoleReadiness.mockReturnValue({ ready: true, buckets: [] })
    sanitizeAssignmentsMock
      .mockImplementationOnce(() => sanitizedFirst)
      .mockImplementationOnce(() => sanitizedSecond)

    flattenAssignmentMembers.mockReturnValue(sanitizedMembers)

    loadHeroesByIds.mockResolvedValue(
      new Map([
        [hostHeroId, { id: hostHeroId }],
        [standinHeroId, { id: standinHeroId }],
      ]),
    )

    markAssignmentsMatched.mockResolvedValue(undefined)
    recordMatchmakingLog.mockResolvedValue(undefined)
  })

  test('returns sanitized assignments and aggregates removed members', async () => {
    const req = createReq({ gameId: 'game-1' })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.ready).toBe(true)
    expect(res.body.assignments).toBe(sanitizedSecond)
    expect(res.body.removedMembers).toEqual([
      ...sanitizedRemoved,
      {
        ownerId: 'extra-owner',
        heroId: 'extra-hero',
        role: '지원',
        slotIndex: 2,
        reason: 'post_check',
      },
    ])

    expect(markAssignmentsMatched).toHaveBeenCalledWith(expect.any(Object), {
      assignments: sanitizedSecond,
      gameId: 'game-1',
      mode: undefined,
      matchCode: expect.any(String),
    })

    expect(flattenAssignmentMembers).toHaveBeenCalledWith(sanitizedSecond)

    expect(sanitizeAssignmentsMock).toHaveBeenCalledTimes(2)
    expect(Array.isArray(sanitizeAssignmentsMock.mock.calls[0][0])).toBe(true)
    expect(Array.isArray(sanitizeAssignmentsMock.mock.calls[1][0])).toBe(true)
  })
})
