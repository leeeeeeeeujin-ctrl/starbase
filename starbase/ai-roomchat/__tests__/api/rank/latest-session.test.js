const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils')

let mockWithTableQuery

jest.mock('@/lib/supabaseTables', () => ({
  withTableQuery: (...args) => mockWithTableQuery(...args),
}))

describe('POST /api/rank/latest-session', () => {
  let handler
  let rpcMock
  let tableResponses

  function createQueryChain(result) {
    const query = {
      eq: jest.fn(() => query),
      in: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(() => Promise.resolve(result)),
    }
    return query
  }

  function configureTableResponses(...responses) {
    tableResponses = [...responses]
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'))

    tableResponses = []
    mockWithTableQuery = jest.fn(async (_client, logicalName, handlerFn) => {
      const next = tableResponses.length ? tableResponses.shift() : { data: null, error: null }
      const query = createQueryChain(next)
      const fromMock = {
        select: jest.fn(() => query),
      }
      return handlerFn(fromMock, logicalName)
    })

    rpcMock = jest.fn()
    registerSupabaseAdminMock(jest.fn(), rpcMock)

    handler = loadApiRoute('rank', 'latest-session')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('opens the circuit on ordered-set errors and bypasses RPC calls until cooldown expires', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42809', message: 'WITHIN GROUP is required for ordered-set aggregate mode' },
    })

    configureTableResponses(
      { data: null, error: { code: '42809', message: 'WITHIN GROUP is required for ordered-set aggregate mode' } },
      {
        data: {
          id: 'session-fallback',
          status: 'ready',
          owner_id: 'owner-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:05:00Z',
        },
        error: null,
      },
    )

    const req = createApiRequest({
      method: 'POST',
      body: { game_id: 'game-1' },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      session: {
        id: 'session-fallback',
        owner_id: 'owner-1',
        status: 'ready',
      },
      via: 'table-ordered-set-recovery',
      circuitBreaker: {
        active: true,
        reason: 'ordered_set_failure',
        disabledUntil: expect.any(Number),
        remainingMs: expect.any(Number),
        hint: expect.stringContaining('WITHIN GROUP'),
      },
      diagnostics: expect.objectContaining({
        via: 'table-ordered-set-recovery',
        hintSuppressed: true,
        error: null,
      }),
    })
    expect(res.body).not.toHaveProperty('error')
    expect(res.body).not.toHaveProperty('hint')
    expect(res.body).not.toHaveProperty('supabaseError')
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(mockWithTableQuery).toHaveBeenCalledTimes(2)

    rpcMock.mockClear()
    mockWithTableQuery.mockClear()

    configureTableResponses({
      data: {
        id: 'session-circuit',
        status: 'ready',
        owner_id: 'owner-1',
        created_at: '2025-01-01T00:10:00Z',
        updated_at: '2025-01-01T00:11:00Z',
      },
      error: null,
    })

    const req2 = createApiRequest({
      method: 'POST',
      body: { game_id: 'game-1' },
    })
    const res2 = createMockResponse()

    await handler(req2, res2)

    expect(res2.statusCode).toBe(200)
    expect(res2.body).toMatchObject({
      session: {
        id: 'session-circuit',
      },
      via: 'table',
      circuitBreaker: expect.objectContaining({ active: true }),
      diagnostics: expect.objectContaining({ hintSuppressed: true }),
    })
    expect(res2.body).not.toHaveProperty('error')
    expect(res2.body).not.toHaveProperty('hint')
    expect(res2.body).not.toHaveProperty('supabaseError')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(mockWithTableQuery).toHaveBeenCalledTimes(1)

    rpcMock.mockClear()
    mockWithTableQuery.mockClear()

    jest.advanceTimersByTime(5 * 60 * 1000 + 1)

    rpcMock.mockResolvedValueOnce({
      data: {
        id: 'session-rpc',
        status: 'ready',
        owner_id: 'owner-1',
        created_at: '2025-01-01T00:20:00Z',
        updated_at: '2025-01-01T00:21:00Z',
      },
      error: null,
    })

    configureTableResponses()

    const req3 = createApiRequest({
      method: 'POST',
      body: { game_id: 'game-1' },
    })
    const res3 = createMockResponse()

    await handler(req3, res3)

    expect(res3.statusCode).toBe(200)
    expect(res3.body).toMatchObject({
      session: {
        id: 'session-rpc',
        status: 'ready',
      },
      circuitBreaker: { active: false, reason: null, remainingMs: 0, disabledUntil: null, supabaseError: null, hint: null },
    })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(mockWithTableQuery).not.toHaveBeenCalled()
  })
})
