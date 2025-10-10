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

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClientImplementation(...args),
}))

jest.mock('@/lib/rank/realtimeEventNotifications', () => ({
  broadcastRealtimeTimeline: jest.fn(),
  notifyRealtimeTimelineWebhook: jest.fn(),
}))

const {
  broadcastRealtimeTimeline,
  notifyRealtimeTimelineWebhook,
} = require('@/lib/rank/realtimeEventNotifications')

function loadHandler() {
  return loadApiRoute('rank', 'session-meta')
}

describe('POST /api/rank/session-meta', () => {
  let getUserMock
  let rpcMock
  let fromMock
  let timelineUpsertMock

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockCreateClientImplementation = jest.fn(() => ({
      auth: { getUser: getUserMock },
    }))

    rpcMock = jest.fn().mockResolvedValue({ data: [{ session_id: 'session-1' }], error: null })
    timelineUpsertMock = jest.fn().mockResolvedValue({ data: null, error: null })
    fromMock = jest.fn(() => ({
      upsert: timelineUpsertMock,
    }))
    registerSupabaseAdminMock(fromMock, rpcMock)
    broadcastRealtimeTimeline.mockResolvedValue(true)
    notifyRealtimeTimelineWebhook.mockResolvedValue(true)
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

  it('requires authorization', async () => {
    const handler = loadHandler()

    const req = createApiRequest({ method: 'POST' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
    expect(getUserMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 401 when Supabase user lookup fails', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid') })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'session-1', meta: {} },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('token')
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
  })

  it('persists session meta and turn-state events', async () => {
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        game_id: 'game-1',
        meta: {
          selected_time_limit_seconds: 120,
          drop_in_bonus_seconds: 30,
          realtime_mode: 'standard',
          time_vote: { selections: { '120': 3 } },
        turn_state: { turnNumber: 2, deadline: Date.now(), status: 'active' },
      },
      turn_state_event: {
        turn_state: { turnNumber: 2, deadline: Date.now(), status: 'active' },
        turn_number: 2,
        source: 'start-client',
        extras: {
          dropInBonusSeconds: 30,
          dropIn: {
            status: 'bonus-applied',
            bonusSeconds: 30,
            arrivals: [
              {
                ownerId: 'owner-1',
                role: '딜러',
                queueDepth: 1,
              },
            ],
          },
        },
      },
    },
  })

    const res = createMockResponse()

    await handler(req, res)

    expect(getUserMock).toHaveBeenCalledWith('token')
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'upsert_match_session_meta',
      expect.objectContaining({
        p_session_id: 'session-1',
        p_selected_time_limit: 120,
        p_drop_in_bonus_seconds: 30,
        p_realtime_mode: 'standard',
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      'enqueue_rank_turn_state_event',
      expect.objectContaining({
        p_session_id: 'session-1',
        p_turn_number: 2,
        p_source: 'start-client',
        p_extras: expect.objectContaining({
          dropInBonusSeconds: 30,
          dropIn: expect.objectContaining({ status: 'bonus-applied', bonusSeconds: 30 }),
        }),
      }),
    )
    expect(timelineUpsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          session_id: 'session-1',
          game_id: 'game-1',
          event_type: 'turn_extended',
        }),
      ]),
      expect.objectContaining({ onConflict: 'event_id', ignoreDuplicates: false }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(res.body.timelineEvent).toEqual(
      expect.objectContaining({
        type: 'turn_extended',
        context: expect.objectContaining({ bonusSeconds: 30 }),
      }),
    )
  })

  it('propagates upsert errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'failed' } })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'session-1', meta: { selected_time_limit_seconds: 60 } },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'upsert_failed' })
  })

  it('continues when turn-state event RPC fails', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ session_id: 'session-1' }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'event failed' } })

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        meta: { selected_time_limit_seconds: 90 },
        turn_state_event: { turn_state: { turnNumber: 1 } },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, meta: expect.any(Object) })
    expect(timelineUpsertMock).not.toHaveBeenCalled()
  })
})
