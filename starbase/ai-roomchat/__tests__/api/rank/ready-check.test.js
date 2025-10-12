const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils')

let mockWithTableQuery
let mockCreateClientImplementation
let supabaseAdminClient
let serviceTableResponse

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClientImplementation(...args),
}))

jest.mock('@/lib/supabaseTables', () => ({
  withTableQuery: (...args) => mockWithTableQuery(...args),
}))

describe('POST /api/rank/ready-check', () => {
  let handler
  let rpcMock

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    ;({ supabaseAdmin: supabaseAdminClient } = require('@/lib/supabaseAdmin'))

    serviceTableResponse = { data: null, error: null }

    const getUserMock = jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    mockCreateClientImplementation = jest.fn((urlArg, keyArg, options = {}) => {
      const authHeader = options?.global?.headers?.Authorization
      if (authHeader === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
        return {
          auth: { getUser: getUserMock },
        }
      }

      if (authHeader === 'Bearer user-access-token') {
        return {
          rpc: jest.fn(),
        }
      }

      throw new Error(`Unexpected Authorization header: ${authHeader}`)
    })

    mockWithTableQuery = jest.fn(async (client, logicalName) => {
      if (logicalName === 'rank_sessions') {
        if (client === supabaseAdminClient) {
          return serviceTableResponse
        }
        return { data: null, error: null }
      }
      if (logicalName === 'rank_match_roster') {
        return {
          data: { owner_id: 'user-1', game_id: 'game-1' },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    rpcMock = jest.fn(async (fnName) => {
      if (fnName === 'fetch_latest_rank_session_v2') {
        return {
          data: {
            id: 'session-rpc',
            owner_id: 'user-1',
            game_id: 'game-1',
          },
          error: null,
        }
      }
      if (fnName === 'register_match_ready_signal') {
        return {
          data: { ready: true },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    registerSupabaseAdminMock(jest.fn(), rpcMock)

    handler = loadApiRoute('rank', 'ready-check')
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it('recovers the session via RPC when the direct lookup misses', async () => {
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      body: {
        session_id: 'stale-session-id',
        game_id: 'game-1',
        match_instance_id: 'match-1',
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      sessionId: 'session-rpc',
      gameId: 'game-1',
      readyCheck: { ready: true },
      diagnostics: { sessionRecovered: true, via: 'service-role' },
    })

    expect(mockWithTableQuery).toHaveBeenCalledWith(expect.anything(), 'rank_sessions', expect.any(Function))
    expect(rpcMock).toHaveBeenCalledWith('fetch_latest_rank_session_v2', {
      p_game_id: 'game-1',
      p_owner_id: 'user-1',
    })
    expect(rpcMock).toHaveBeenCalledWith('register_match_ready_signal', expect.objectContaining({
      p_session_id: 'session-rpc',
    }))
  })

  it('recovers the session via service-role table fallback', async () => {
    serviceTableResponse = {
      data: {
        id: 'session-admin',
        owner_id: 'host-1',
        game_id: 'game-1',
      },
      error: null,
    }

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      body: {
        session_id: 'stale-session-id',
        game_id: 'game-1',
        match_instance_id: 'match-1',
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      sessionId: 'session-admin',
      diagnostics: { sessionRecovered: true, via: 'service-role-table' },
    })

    expect(rpcMock).not.toHaveBeenCalledWith('fetch_latest_rank_session_v2', expect.anything())
    expect(rpcMock).toHaveBeenCalledWith('register_match_ready_signal', expect.objectContaining({
      p_session_id: 'session-admin',
    }))
  })
})
