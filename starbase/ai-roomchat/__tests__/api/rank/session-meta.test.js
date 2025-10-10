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
  let sessionSelectMock
  let sessionEqMock
  let sessionMaybeSingleMock
  let roomSlotSelectMock
  let roomSlotFirstEqMock
  let roomSlotSecondEqMock
  let roomSlotMaybeSingleMock
  let roomSelectMock
  let roomEqMock
  let roomMaybeSingleMock
  let rosterSelectMock
  let rosterFirstEqMock
  let rosterSecondEqMock
  let rosterMaybeSingleMock
  let participantSelectMock
  let participantGameEqMock
  let participantOwnerEqMock
  let participantMaybeSingleMock

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockCreateClientImplementation = jest.fn((urlArg, keyArg, options = {}) => {
      const authHeader = options?.global?.headers?.Authorization
      const anonHeader = `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`

      if (authHeader === anonHeader) {
        return {
          auth: { getUser: getUserMock },
        }
      }

      if (authHeader && authHeader !== anonHeader) {
        return {
          from: (table) => {
            if (table === 'rank_sessions') {
              return { select: sessionSelectMock }
            }
            return {
              select: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
            }
          },
        }
      }

      throw new Error(`Unexpected Authorization header: ${authHeader}`)
    })

    rpcMock = jest.fn().mockResolvedValue({ data: [{ session_id: 'session-1' }], error: null })
    timelineUpsertMock = jest.fn().mockResolvedValue({ data: null, error: null })
    sessionMaybeSingleMock = jest
      .fn()
      .mockResolvedValue({
        data: { id: 'session-1', owner_id: 'user-1', game_id: 'game-1' },
        error: null,
      })
    sessionEqMock = jest.fn(() => ({ maybeSingle: sessionMaybeSingleMock }))
    sessionSelectMock = jest.fn(() => ({ eq: sessionEqMock }))
    roomSlotMaybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    roomSlotSecondEqMock = jest.fn(() => ({ maybeSingle: roomSlotMaybeSingleMock }))
    roomSlotFirstEqMock = jest.fn(() => ({ eq: roomSlotSecondEqMock, maybeSingle: roomSlotMaybeSingleMock }))
    roomSlotSelectMock = jest.fn(() => ({ eq: roomSlotFirstEqMock }))
    roomMaybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    roomEqMock = jest.fn(() => ({ maybeSingle: roomMaybeSingleMock }))
    roomSelectMock = jest.fn(() => ({ eq: roomEqMock }))
    rosterMaybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    rosterSecondEqMock = jest.fn(() => ({ maybeSingle: rosterMaybeSingleMock }))
    rosterFirstEqMock = jest.fn(() => ({ eq: rosterSecondEqMock, maybeSingle: rosterMaybeSingleMock }))
    rosterSelectMock = jest.fn(() => ({ eq: rosterFirstEqMock }))
    participantMaybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    participantOwnerEqMock = jest.fn(() => ({ maybeSingle: participantMaybeSingleMock }))
    participantGameEqMock = jest.fn(() => ({ eq: participantOwnerEqMock, maybeSingle: participantMaybeSingleMock }))
    participantSelectMock = jest.fn(() => ({ eq: participantGameEqMock }))
    fromMock = jest.fn((table) => {
      if (table === 'rank_sessions') {
        return { select: sessionSelectMock }
      }
      if (table === 'rank_room_slots') {
        return { select: roomSlotSelectMock }
      }
      if (table === 'rank_rooms') {
        return { select: roomSelectMock }
      }
      if (table === 'rank_match_roster') {
        return { select: rosterSelectMock }
      }
      if (table === 'rank_participants') {
        return { select: participantSelectMock }
      }
      if (table === 'rank_session_timeline_events') {
        return { upsert: timelineUpsertMock }
      }
      return {
        select: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
      }
    })
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
    expect(sessionSelectMock).toHaveBeenCalledWith('id, owner_id, game_id')
    expect(sessionEqMock).toHaveBeenCalledWith('id', 'session-1')
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

  it('returns 404 when session is not found', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'missing', meta: {} },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'session_not_found' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects when caller is not the session owner', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'other-user', game_id: 'game-1' },
      error: null,
    })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'session-1', meta: {} },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('allows session collaborators occupying the room to update meta', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'owner-99', game_id: 'game-1' },
      error: null,
    })
    roomSlotMaybeSingleMock.mockResolvedValueOnce({
      data: { occupant_owner_id: 'user-1', room_id: 'room-1' },
      error: null,
    })
    roomMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'room-1', game_id: 'game-1' },
      error: null,
    })

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        game_id: 'game-1',
        room_id: 'room-1',
        collaborators: ['user-1'],
        meta: { selected_time_limit_seconds: 45 },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(roomSlotSelectMock).toHaveBeenCalled()
    expect(roomSlotFirstEqMock).toHaveBeenCalledWith('room_id', 'room-1')
    expect(roomSlotSecondEqMock).toHaveBeenCalledWith('occupant_owner_id', 'user-1')
    expect(roomSelectMock).toHaveBeenCalled()
    expect(roomEqMock).toHaveBeenCalledWith('id', 'room-1')
    expect(res.statusCode).toBe(200)
    expect(rpcMock).toHaveBeenCalled()
  })

  it('rejects room collaborators when room game does not match session', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'owner-99', game_id: 'game-1' },
      error: null,
    })
    roomSlotMaybeSingleMock.mockResolvedValueOnce({
      data: { occupant_owner_id: 'user-1', room_id: 'room-2' },
      error: null,
    })
    roomMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'room-2', game_id: 'other-game' },
      error: null,
    })

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        game_id: 'game-1',
        room_id: 'room-2',
        collaborators: ['user-1'],
        meta: { selected_time_limit_seconds: 45 },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(roomSlotSelectMock).toHaveBeenCalled()
    expect(roomSelectMock).toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('allows session collaborators recorded in match roster to update meta', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'owner-99', game_id: 'game-1' },
      error: null,
    })
    rosterMaybeSingleMock.mockResolvedValueOnce({
      data: { owner_id: 'user-1', game_id: 'game-1' },
      error: null,
    })

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        game_id: 'game-1',
        match_instance_id: 'match-1',
        meta: { selected_time_limit_seconds: 60 },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(rosterSelectMock).toHaveBeenCalled()
    expect(rosterFirstEqMock).toHaveBeenCalledWith('match_instance_id', 'match-1')
    expect(rosterSecondEqMock).toHaveBeenCalledWith('owner_id', 'user-1')
    expect(res.statusCode).toBe(200)
    expect(rpcMock).toHaveBeenCalled()
  })

  it('rejects collaborators without active seats or roster entries', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'owner-99', game_id: 'game-1' },
      error: null,
    })

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        session_id: 'session-1',
        game_id: 'game-1',
        room_id: 'room-2',
        match_instance_id: 'match-404',
        collaborators: ['user-1'],
        meta: {},
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects when session game does not match request payload', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({
      data: { id: 'session-1', owner_id: 'user-1', game_id: 'game-2' },
      error: null,
    })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'session-1', game_id: 'game-1', meta: {} },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'session_game_mismatch' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 400 when session lookup fails', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const handler = loadHandler()

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { session_id: 'session-1', meta: {} },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'session_lookup_failed' })
    expect(rpcMock).not.toHaveBeenCalled()
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
