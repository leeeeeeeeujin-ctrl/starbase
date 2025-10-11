const { describe, it, expect, beforeEach } = require('@jest/globals')

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils')

function loadHandler() {
  return loadApiRoute('rank', 'async-standins')
}

describe('POST /api/rank/async-standins', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns 400 when the payload is invalid', async () => {
    const rpcMock = jest.fn()
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    const handler = loadHandler()
    const req = createApiRequest({ method: 'POST', body: {} })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ error: 'invalid_payload' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC throws an error', async () => {
    const rpcMock = jest.fn(() => Promise.reject(new Error('network failure')))
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      body: {
        game_id: 'game-1',
        seat_requests: [{ slotIndex: 1, role: '전략가' }],
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'rpc_failed' })
  })

  it('assigns stand-in candidates across multiple seats', async () => {
    const rpcMock = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            owner_id: 'candidate-1',
            hero_id: 'hero-1',
            hero_name: 'AI One',
            role: '전략가',
            score: 1200,
            rating: 1500,
            battles: 10,
            win_rate: 51.2,
            status: 'active',
            updated_at: '2025-01-01T00:00:00Z',
            score_gap: 5,
            rating_gap: 10,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            owner_id: 'candidate-1',
            hero_id: 'hero-1',
            hero_name: 'AI One',
            role: '전략가',
            score: 1200,
            rating: 1500,
            battles: 10,
            win_rate: 51.2,
            status: 'active',
            updated_at: '2025-01-01T00:00:00Z',
            score_gap: 5,
            rating_gap: 10,
          },
          {
            owner_id: 'candidate-2',
            hero_id: 'hero-2',
            hero_name: 'AI Two',
            role: '전략가',
            score: 1195,
            rating: 1490,
            battles: 8,
            win_rate: 49.5,
            status: 'active',
            updated_at: '2025-01-01T00:05:00Z',
            score_gap: 10,
            rating_gap: 15,
          },
        ],
        error: null,
      })

    registerSupabaseAdminMock(jest.fn(), rpcMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      body: {
        game_id: 'game-async',
        room_id: 'room-async',
        seat_requests: [
          { slotIndex: 1, role: '전략가', score: 1200, rating: 1500 },
          { slotIndex: 2, role: '전략가', score: 1190, rating: 1480 },
        ],
        exclude_owner_ids: ['host-owner'],
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.queue).toHaveLength(2)
    expect(res.body.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotIndex: 1, candidate: expect.objectContaining({ ownerId: 'candidate-1' }) }),
        expect.objectContaining({ slotIndex: 2, candidate: expect.objectContaining({ ownerId: 'candidate-2' }) }),
      ]),
    )
    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'fetch_rank_async_standin_pool',
      expect.objectContaining({
        p_game_id: 'game-async',
        p_role: '전략가',
        p_limit: 6,
        p_reference_score: 1200,
        p_reference_rating: 1500,
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      'fetch_rank_async_standin_pool',
      expect.objectContaining({
        p_excluded_owner_ids: expect.arrayContaining(['host-owner', 'candidate-1']),
        p_reference_score: 1190,
      }),
    )
  })

  it('falls back to any role when role-specific results are empty', async () => {
    const rpcMock = jest
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            owner_id: 'fallback-owner',
            hero_id: 'hero-fallback',
            hero_name: 'AI Fallback',
            role: '지원',
            score: 1100,
            rating: 1400,
            updated_at: '2025-01-01T00:10:00Z',
            score_gap: 20,
            rating_gap: 30,
          },
        ],
        error: null,
      })

    registerSupabaseAdminMock(jest.fn(), rpcMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      body: {
        game_id: 'game-async',
        seat_requests: [{ slotIndex: 5, role: '전략가', score: 1180, rating: 1500 }],
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.queue).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerId: 'fallback-owner' })]),
    )
    expect(res.body.diagnostics).toMatchObject({ roleFallbacks: 1 })

    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'fetch_rank_async_standin_pool',
      expect.objectContaining({ p_role: '전략가' }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      'fetch_rank_async_standin_pool',
      expect.objectContaining({ p_role: null }),
    )
  })

  it('normalizes generic role labels to null before querying', async () => {
    const rpcMock = jest.fn().mockResolvedValue({ data: [], error: null })
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      body: {
        game_id: 'game-async',
        seat_requests: [
          { slotIndex: 1, role: '역할 미지정' },
          { slotIndex: 2, role: 'Unassigned' },
          { slotIndex: 3, role: 'ANY' },
        ],
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(rpcMock).toHaveBeenCalled()
    rpcMock.mock.calls.forEach(([, params]) => {
      expect(params.p_role).toBeNull()
    })
  })
})
