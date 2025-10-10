const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils')

let mockCreateClientImplementation = () => {
  throw new Error('createClient mock not configured')
}
let mockWithTableQuery

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClientImplementation(...args),
}))

jest.mock('@/lib/supabaseTables', () => ({
  withTableQuery: (...args) => mockWithTableQuery(...args),
}))

function loadHandler() {
  return loadApiRoute('rank', 'stage-room-match')
}

describe('POST /api/rank/stage-room-match', () => {
  let getUserMock
  let rpcMock

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockCreateClientImplementation = jest.fn(() => ({
      auth: { getUser: getUserMock },
    }))

    rpcMock = jest.fn().mockResolvedValue({ data: [{ inserted_count: 1 }], error: null })
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    mockWithTableQuery = jest.fn().mockImplementation(async () => ({ data: [], error: null }))
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it('rejects non-POST methods', async () => {
    const handler = loadHandler()

    const req = createApiRequest({ method: 'GET' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['POST'])
  })

  it('requires a bearer token', async () => {
    const handler = loadHandler()

    const req = createApiRequest({ method: 'POST' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
    expect(getUserMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the roster version conflicts', async () => {
    const handler = loadHandler()

    const roster = [
      {
        slotIndex: 0,
        role: '딜러',
        ownerId: 'owner-1',
        heroId: 'hero-1',
        ready: true,
      },
    ]

    mockWithTableQuery.mockResolvedValueOnce({ data: [], error: null })
    mockWithTableQuery.mockResolvedValueOnce({ data: [], error: null })

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'slot_version_conflict' },
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        room_id: 'room-1',
        game_id: 'game-1',
        roster,
        slot_template: { version: 123, source: 'client', updated_at: '2025-02-01T10:00:00Z' },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('session-token')
    expect(rpcMock).toHaveBeenCalledWith(
      'sync_rank_match_roster',
      expect.objectContaining({
        p_game_id: 'game-1',
        p_room_id: 'room-1',
        p_match_instance_id: 'match-1',
        p_slot_template_version: expect.any(Number),
      }),
    )
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'slot_version_conflict' })
  })

  it('stages the roster and returns the summary payload', async () => {
    const handler = loadHandler()

    const roster = [
      {
        slotIndex: 1,
        slotId: 'slot-1',
        role: '서포터',
        ownerId: 'owner-2',
        heroId: 'hero-2',
        heroName: '베타',
        ready: false,
        joinedAt: '2025-02-03T12:00:00Z',
      },
    ]

    mockWithTableQuery
      .mockResolvedValueOnce({ data: [{ owner_id: 'owner-2', score: 1500, rating: 1200 }], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'hero-2',
            name: '베타',
            description: '지원형',
            image_url: 'https://cdn/hero-2.png',
          },
        ],
        error: null,
      })

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          inserted_count: 1,
          slot_template_version: 456,
          slot_template_updated_at: '2025-02-03T12:00:00Z',
        },
      ],
      error: null,
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer bearer-token' },
      body: {
        match_instance_id: 'match-2',
        room_id: 'room-9',
        game_id: 'game-42',
        roster,
        hero_map: {
          'hero-2': { id: 'hero-2', name: '베타' },
        },
        slot_template: { version: 987, source: 'room-stage', updated_at: '2025-02-03T12:00:00Z' },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('bearer-token')
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(1, expect.any(Object), 'rank_participants', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(2, expect.any(Object), 'heroes', expect.any(Function))
    expect(rpcMock).toHaveBeenCalledWith(
      'sync_rank_match_roster',
      expect.objectContaining({
        p_room_id: 'room-9',
        p_game_id: 'game-42',
        p_match_instance_id: 'match-2',
        p_roster: expect.arrayContaining([
          expect.objectContaining({
            slot_index: 1,
            role: '서포터',
            owner_id: 'owner-2',
            hero_id: 'hero-2',
            ready: false,
          }),
        ]),
      }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      staged: 1,
      slot_template_version: 456,
      slot_template_updated_at: '2025-02-03T12:00:00Z',
    })
  })
})
