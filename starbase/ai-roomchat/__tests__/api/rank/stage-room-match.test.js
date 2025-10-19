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
  let roomQueryResponse
  let participantQueryResponse
  let heroQueryResponse

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockCreateClientImplementation = jest.fn(() => ({
      auth: { getUser: getUserMock },
    }))

    rpcMock = jest.fn().mockImplementation(async (fnName, params) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        const rosterLength = Array.isArray(params?.p_roster) ? params.p_roster.length : 0
        return {
          data: [
            {
              reconciled: rosterLength,
              inserted: rosterLength,
              removed: 0,
              sanitized: Array.isArray(params?.p_roster) ? params.p_roster : [],
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    roomQueryResponse = { data: { id: 'room-1', owner_id: 'user-1', mode: 'rank' }, error: null }
    participantQueryResponse = { data: [], error: null }
    heroQueryResponse = { data: [], error: null }

    mockWithTableQuery = jest.fn().mockImplementation(async (_client, tableName) => {
      if (tableName === 'rank_rooms') {
        return roomQueryResponse
      }
      if (tableName === 'rank_participants') {
        return participantQueryResponse
      }
      if (tableName === 'heroes') {
        return heroQueryResponse
      }
      return { data: [], error: null }
    })
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

  it('rejects calls from non-owners', async () => {
    const handler = loadHandler()

    roomQueryResponse = { data: { id: 'room-1', owner_id: 'owner-9', mode: 'rank' }, error: null }

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        room_id: 'room-1',
        game_id: 'game-1',
        roster: [
          {
            slotIndex: 0,
            role: '딜러',
            ownerId: 'owner-1',
            heroId: 'hero-1',
            ready: true,
          },
        ],
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
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

    rpcMock.mockImplementation(async (fnName, params) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        const length = Array.isArray(params?.p_roster) ? params.p_roster.length : 0
        return {
          data: [
            {
              reconciled: length,
              inserted: length,
              removed: 0,
              sanitized: Array.isArray(params?.p_roster) ? params.p_roster : [],
            },
          ],
          error: null,
        }
      }
      if (fnName === 'sync_rank_match_roster') {
        return { data: null, error: { message: 'slot_version_conflict' } }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-1',
        room_id: 'room-1',
        game_id: 'game-1',
        roster,
        slot_template: {
          version: 123,
          source: 'client',
          updated_at: '2025-02-01T10:00:00Z',
          slots: [
            { slot_index: 0, role: '딜러', active: true },
            { slot_index: 1, role: '탱커', active: true },
          ],
          roles: [
            { name: '딜러', slot_count: 1 },
            { name: '탱커', slot_count: 1 },
          ],
        },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('session-token')
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(1, expect.any(Object), 'rank_rooms', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(2, expect.any(Object), 'rank_participants', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(3, expect.any(Object), 'heroes', expect.any(Function))

    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'verify_rank_roles_and_slots',
      expect.objectContaining({
        p_roles: expect.any(Array),
        p_slots: expect.any(Array),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'assert_room_ready', { p_room_id: 'room-1' })
    expect(rpcMock).toHaveBeenNthCalledWith(
      3,
      'reconcile_rank_queue_for_roster',
      expect.objectContaining({
        p_game_id: 'game-1',
        p_mode: 'rank',
        p_roster: [
          expect.objectContaining({ owner_id: 'owner-1', hero_id: 'hero-1', role: '딜러', slot_index: 0 }),
        ],
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      4,
      'sync_rank_match_roster',
      expect.objectContaining({
        p_game_id: 'game-1',
        p_room_id: 'room-1',
        p_match_instance_id: 'match-1',
        p_request_owner_id: 'user-1',
        p_slot_template_version: expect.any(Number),
      }),
    )
    expect(rpcMock).toHaveBeenCalledTimes(4)
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

    participantQueryResponse = {
      data: [{ owner_id: 'owner-2', score: 1500, rating: 1200 }],
      error: null,
    }
    heroQueryResponse = {
      data: [
        {
          id: 'hero-2',
          name: '베타',
          description: '지원형',
          image_url: 'https://cdn/hero-2.png',
        },
      ],
      error: null,
    }

    rpcMock.mockImplementation(async (fnName, params) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        const length = Array.isArray(params?.p_roster) ? params.p_roster.length : 0
        return {
          data: [
            {
              reconciled: length,
              inserted: length,
              removed: 0,
              sanitized: Array.isArray(params?.p_roster) ? params.p_roster : [],
            },
          ],
          error: null,
        }
      }
      if (fnName === 'sync_rank_match_roster') {
        return {
          data: [
            {
              inserted_count: 1,
              slot_template_version: 456,
              slot_template_updated_at: '2025-02-03T12:00:00Z',
            },
          ],
          error: null,
        }
      }
      if (fnName === 'ensure_rank_session_for_room') {
        return { data: ['session-room-9'], error: null }
      }
      return { data: [], error: null }
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
        slot_template: {
          version: 987,
          source: 'room-stage',
          updated_at: '2025-02-03T12:00:00Z',
          slots: [
            { slot_index: 1, role: '서포터', active: true },
          ],
          roles: [
            { name: '서포터', slot_count: 1 },
          ],
        },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('bearer-token')
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(1, expect.any(Object), 'rank_rooms', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(2, expect.any(Object), 'rank_participants', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(3, expect.any(Object), 'heroes', expect.any(Function))
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'verify_rank_roles_and_slots',
      expect.objectContaining({
        p_roles: expect.any(Array),
        p_slots: expect.any(Array),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'assert_room_ready', { p_room_id: 'room-9' })
    expect(rpcMock).toHaveBeenNthCalledWith(
      3,
      'reconcile_rank_queue_for_roster',
      expect.objectContaining({
        p_game_id: 'game-42',
        p_mode: 'rank',
        p_roster: [
          expect.objectContaining({ owner_id: 'owner-2', hero_id: 'hero-2', role: '서포터', slot_index: 1 }),
        ],
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      4,
      'sync_rank_match_roster',
      expect.objectContaining({
        p_room_id: 'room-9',
        p_game_id: 'game-42',
        p_match_instance_id: 'match-2',
        p_request_owner_id: 'user-1',
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
    expect(rpcMock).toHaveBeenNthCalledWith(
      5,
      'ensure_rank_session_for_room',
      expect.objectContaining({
        p_room_id: 'room-9',
        p_owner_id: 'user-1',
        p_mode: 'rank',
      }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        staged: 1,
        slot_template_version: 456,
        slot_template_updated_at: '2025-02-03T12:00:00Z',
      }),
    )
  })

  it('reapplies queue reconciliation output to remove duplicate owners', async () => {
    const handler = loadHandler()

    const roster = [
      {
        slotIndex: 0,
        slotId: 'slot-a',
        role: '딜러',
        ownerId: 'owner-1',
        heroId: 'hero-1',
        ready: true,
      },
      {
        slotIndex: 1,
        slotId: 'slot-b',
        role: '딜러',
        ownerId: 'owner-1',
        heroId: 'hero-1',
        ready: false,
      },
      {
        slotIndex: 2,
        slotId: 'slot-c',
        role: '탱커',
        ownerId: 'owner-2',
        heroId: 'hero-2',
        ready: true,
      },
    ]

    participantQueryResponse = {
      data: [
        { owner_id: 'owner-1', score: 1200, rating: 1100 },
        { owner_id: 'owner-2', score: 1350, rating: 1250 },
      ],
      error: null,
    }

    heroQueryResponse = {
      data: [
        { id: 'hero-1', name: '알파' },
        { id: 'hero-2', name: '베타' },
      ],
      error: null,
    }

    rpcMock.mockImplementation(async (fnName, params) => {
      if (fnName === 'verify_rank_roles_and_slots' || fnName === 'assert_room_ready') {
        return { data: [], error: null }
      }
      if (fnName === 'reconcile_rank_queue_for_roster') {
        return {
          data: [
            {
              reconciled: 2,
              inserted: 2,
              removed: 1,
              sanitized: [
                { owner_id: 'owner-1', hero_id: 'hero-1', role: '딜러', slot_index: 0 },
                { owner_id: 'owner-2', hero_id: 'hero-2', role: '탱커', slot_index: 2 },
              ],
            },
          ],
          error: null,
        }
      }
      if (fnName === 'sync_rank_match_roster') {
        return { data: [{ inserted_count: 2 }], error: null }
      }
      if (fnName === 'ensure_rank_session_for_room') {
        return { data: ['session-dup'], error: null }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer dupe-token' },
      body: {
        match_instance_id: 'match-dupe',
        room_id: 'room-dupe',
        game_id: 'game-dupe',
        roster,
        slot_template: {
          version: 321,
          source: 'room-stage',
          updated_at: '2025-05-01T00:00:00Z',
          slots: [
            { slot_index: 0, role: '딜러', active: true },
            { slot_index: 1, role: '딜러', active: true },
            { slot_index: 2, role: '탱커', active: true },
          ],
          roles: [
            { name: '딜러', slot_count: 2 },
            { name: '탱커', slot_count: 1 },
          ],
        },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    const syncCall = rpcMock.mock.calls.find(([fnName]) => fnName === 'sync_rank_match_roster')
    expect(syncCall).toBeTruthy()
    const syncParams = syncCall[1]
    expect(Array.isArray(syncParams.p_roster)).toBe(true)
    expect(syncParams.p_roster).toHaveLength(2)
    const ownerIds = syncParams.p_roster.map((row) => row.owner_id)
    expect(ownerIds).toEqual(['owner-1', 'owner-2'])
    const ownerOne = syncParams.p_roster.find((row) => row.owner_id === 'owner-1')
    expect(ownerOne.slot_index).toBe(0)
    expect(ownerOne.role).toBe('딜러')
    expect(ownerOne.hero_id).toBe('hero-1')
    const ownerTwo = syncParams.p_roster.find((row) => row.owner_id === 'owner-2')
    expect(ownerTwo.slot_index).toBe(2)
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.session_id).toBe('session-dup')
  })

  it('propagates stand-in metadata when participant stats are missing', async () => {
    const handler = loadHandler()

    const roster = [
      {
        slotIndex: 0,
        role: '딜러',
        ownerId: 'standin-owner',
        heroId: 'standin-hero',
        heroName: '스탠딘',
        ready: true,
        standin: true,
        matchSource: 'async_standin',
        score: 1777,
        rating: 1550,
        battles: 123,
        winRate: 0.66,
        status: 'standin',
      },
    ]

    rpcMock.mockImplementation(async (fnName, params) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        const length = Array.isArray(params?.p_roster) ? params.p_roster.length : 0
        return {
          data: [
            {
              reconciled: length,
              inserted: length,
              removed: 0,
              sanitized: Array.isArray(params?.p_roster) ? params.p_roster : [],
            },
          ],
          error: null,
        }
      }
      if (fnName === 'sync_rank_match_roster') {
        return {
          data: [
            {
              inserted_count: 1,
              slot_template_version: 99,
              slot_template_updated_at: '2025-02-04T00:00:00Z',
            },
          ],
          error: null,
        }
      }
      if (fnName === 'ensure_rank_session_for_room') {
        return { data: ['session-standin'], error: null }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: {
        match_instance_id: 'match-standin',
        room_id: 'room-standin',
        game_id: 'game-standin',
        roster,
        slot_template: {
          version: 42,
          source: 'room-stage',
          updated_at: '2025-02-04T00:00:00Z',
          slots: [{ slot_index: 0, role: '딜러', active: true }],
          roles: [{ name: '딜러', slot_count: 1 }],
        },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(mockWithTableQuery).toHaveBeenNthCalledWith(1, expect.any(Object), 'rank_rooms', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(2, expect.any(Object), 'rank_participants', expect.any(Function))
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(3, expect.any(Object), 'heroes', expect.any(Function))
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'verify_rank_roles_and_slots',
      expect.objectContaining({
        p_roles: expect.any(Array),
        p_slots: expect.any(Array),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'assert_room_ready', { p_room_id: 'room-standin' })
    expect(rpcMock).toHaveBeenNthCalledWith(
      3,
      'reconcile_rank_queue_for_roster',
      expect.objectContaining({
        p_game_id: 'game-standin',
        p_mode: 'rank',
        p_roster: [
          expect.objectContaining({ owner_id: 'standin-owner', hero_id: 'standin-hero', role: '딜러', slot_index: 0 }),
        ],
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      4,
      'sync_rank_match_roster',
      expect.objectContaining({
        p_request_owner_id: 'user-1',
        p_roster: expect.arrayContaining([
          expect.objectContaining({
            slot_index: 0,
            owner_id: 'standin-owner',
            standin: true,
            match_source: 'async_standin',
            score: 1777,
            rating: 1550,
            battles: 123,
            win_rate: 0.66,
            status: 'standin',
          }),
        ]),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      5,
      'ensure_rank_session_for_room',
      expect.objectContaining({ p_owner_id: 'user-1', p_room_id: 'room-standin' }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        staged: 1,
        slot_template_version: 99,
        slot_template_updated_at: '2025-02-04T00:00:00Z',
      }),
    )
    expect(res.body.session_id).toBe('session-standin')
  })

  it('returns 409 when the queue reconciliation fails to normalize slots', async () => {
    const handler = loadHandler()

    rpcMock.mockImplementation(async (fnName, params) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        return { data: null, error: { message: 'queue_reconcile_failed' } }
      }
      if (fnName === 'verify_rank_roles_and_slots' || fnName === 'assert_room_ready') {
        return { data: [], error: null }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token-q' },
      body: {
        match_instance_id: 'match-q',
        room_id: 'room-q',
        game_id: 'game-q',
        roster: [
          { slotIndex: 0, role: '딜러', ownerId: 'owner-q', heroId: 'hero-q', ready: true },
        ],
        slot_template: {
          version: 7,
          slots: [{ slot_index: 0, role: '딜러', active: true }],
          roles: [{ name: '딜러', slot_count: 1 }],
        },
      },
    })

    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'queue_reconcile_failed' })
    expect(rpcMock).toHaveBeenCalledTimes(3)
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'reconcile_rank_queue_for_roster', expect.any(Object))
  })

  it('surfaces a deployment hint when the queue reconciliation RPC is missing', async () => {
    const handler = loadHandler()

    rpcMock.mockImplementation(async (fnName) => {
      if (fnName === 'reconcile_rank_queue_for_roster') {
        return {
          data: null,
          error: { message: 'function reconcile_rank_queue_for_roster does not exist' },
        }
      }
      if (fnName === 'verify_rank_roles_and_slots' || fnName === 'assert_room_ready') {
        return { data: [], error: null }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token-hint' },
      body: {
        match_instance_id: 'match-hint',
        room_id: 'room-hint',
        game_id: 'game-hint',
        roster: [
          { slotIndex: 0, role: '탱커', ownerId: 'owner-h', heroId: 'hero-h', ready: false },
        ],
        slot_template: {
          version: 9,
          slots: [{ slot_index: 0, role: '탱커', active: true }],
          roles: [{ name: '탱커', slot_count: 1 }],
        },
      },
    })

    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('missing_reconcile_rank_queue_for_roster')
    expect(res.body.hint).toContain('reconcile_rank_queue_for_roster')
    expect(res.body.hint).toContain('drop function if exists')
    expect(rpcMock).toHaveBeenCalledTimes(3)
  })

  it('clears placeholder owner IDs before syncing roster rows', async () => {
    const handler = loadHandler()

    const roster = [
      {
        slotIndex: 2,
        role: '탱커',
        ownerId: 'placeholder-owner',
        placeholderOwnerId: 'placeholder-owner',
        heroId: null,
        heroName: 'AI 자동 대역',
        ready: true,
        standin: true,
        standinPlaceholder: true,
        matchSource: 'async_standin_placeholder',
        score: null,
        rating: null,
        battles: null,
        winRate: null,
        status: 'standin',
      },
    ]

    rpcMock.mockImplementation(async (fnName) => {
      if (fnName === 'sync_rank_match_roster') {
        return {
          data: [
            {
              inserted_count: 1,
              slot_template_version: 77,
              slot_template_updated_at: '2025-02-05T00:00:00Z',
            },
          ],
          error: null,
        }
      }
      if (fnName === 'ensure_rank_session_for_room') {
        return { data: ['session-placeholder'], error: null }
      }
      return { data: [], error: null }
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer standin' },
      body: {
        match_instance_id: 'match-placeholder',
        room_id: 'room-placeholder',
        game_id: 'game-placeholder',
        roster,
        slot_template: {
          version: 11,
          source: 'room-stage',
          updated_at: '2025-02-05T00:00:00Z',
          slots: [{ slot_index: 2, role: '탱커', active: true }],
          roles: [{ name: '탱커', slot_count: 1 }],
        },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(mockWithTableQuery).toHaveBeenCalledTimes(1)
    expect(mockWithTableQuery).toHaveBeenNthCalledWith(1, expect.any(Object), 'rank_rooms', expect.any(Function))
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'verify_rank_roles_and_slots',
      expect.objectContaining({
        p_roles: expect.any(Array),
        p_slots: expect.any(Array),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'assert_room_ready', { p_room_id: 'room-placeholder' })
    expect(rpcMock).toHaveBeenNthCalledWith(
      3,
      'sync_rank_match_roster',
      expect.objectContaining({
        p_request_owner_id: 'user-1',
        p_roster: expect.arrayContaining([
          expect.objectContaining({
            slot_index: 2,
            owner_id: null,
            match_source: 'async_standin_placeholder',
            standin: true,
          }),
        ]),
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      4,
      'ensure_rank_session_for_room',
      expect.objectContaining({ p_owner_id: 'user-1', p_room_id: 'room-placeholder' }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        staged: 1,
        slot_template_version: 77,
        slot_template_updated_at: '2025-02-05T00:00:00Z',
      }),
    )
    expect(res.body.session_id).toBe('session-placeholder')
  })

  it('propagates verification errors from the RPC', async () => {
    const handler = loadHandler()

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid_roles', details: 'slot_count_mismatch:딜러' },
    })

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer tkn' },
      body: {
        match_instance_id: 'match-77',
        room_id: 'room-22',
        game_id: 'game-88',
        roster: [
          { slotIndex: 0, role: '딜러', ownerId: 'owner-x', heroId: 'hero-x', ready: true },
        ],
        slot_template: {
          version: 1,
          slots: [
            { slot_index: 0, role: '딜러', active: true },
            { slot_index: 1, role: '딜러', active: true },
          ],
          roles: [
            { name: '딜러', slot_count: 1 },
          ],
        },
      },
    })

    const res = createMockResponse()
    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({
      error: 'roles_slots_invalid',
      detail: 'slot_count_mismatch:딜러',
    })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(getUserMock).toHaveBeenCalledWith('tkn')
  })
})
