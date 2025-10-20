import handler from '@/pages/api/rank/stage-room-match'
import {
  extractBearerToken,
  parseStageRequestBody,
} from '@/services/rank/matchStageRequest'
import {
  callPrepareMatchSession,
  fetchHeroSummaries,
  fetchParticipantStats,
  fetchRoomContext,
  fetchUserByToken,
  mergeRosterMetadata,
  verifyRolesAndSlots,
} from '@/services/rank/matchSupabase'

jest.mock('@/services/rank/matchStageRequest', () => ({
  extractBearerToken: jest.fn(),
  parseStageRequestBody: jest.fn(),
}))

jest.mock('@/services/rank/matchSupabase', () => ({
  callPrepareMatchSession: jest.fn(),
  fetchHeroSummaries: jest.fn(),
  fetchParticipantStats: jest.fn(),
  fetchRoomContext: jest.fn(),
  fetchUserByToken: jest.fn(),
  mergeRosterMetadata: jest.fn(),
  verifyRolesAndSlots: jest.fn(),
}))

function createReq({ method = 'POST', headers = {}, body = {} } = {}) {
  return { method, headers, body }
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

beforeEach(() => {
  jest.resetAllMocks()
})

describe('POST /api/rank/stage-room-match', () => {
  test('rejects non-POST methods', async () => {
    const req = createReq({ method: 'GET' })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['POST'])
    expect(res.body).toEqual({ error: 'method_not_allowed' })
  })

  test('requires bearer token', async () => {
    extractBearerToken.mockReturnValue(null)
    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
    expect(fetchUserByToken).not.toHaveBeenCalled()
  })

  test('returns 401 when user lookup fails', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: false })
    const req = createReq()
    const res = createRes()

    await handler(req, res)

    expect(fetchUserByToken).toHaveBeenCalledWith('token-1')
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
  })

  test('returns parse error when request invalid', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    parseStageRequestBody.mockReturnValue({ ok: false, error: 'missing_room_id' })

    const req = createReq({ body: {} })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'missing_room_id' })
  })

  test('rejects callers who are not the room owner', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: [{ owner_id: 'owner-1', slot_index: 0 }],
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-2',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })

    const req = createReq({ body: {} })
    const res = createRes()

    await handler(req, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
  })

  test('propagates role verification failure', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: [{ owner_id: 'owner-1', slot_index: 0 }],
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        verificationRoles: ['tank'],
        verificationSlots: [{ id: 'slot-1' }],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({
      ok: false,
      status: 400,
      body: { error: 'roles_slots_invalid' },
    })

    const res = createRes()

    await handler(createReq({ body: {} }), res)

    expect(verifyRolesAndSlots).toHaveBeenCalledWith(['tank'], [{ id: 'slot-1' }])
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'roles_slots_invalid' })
  })

  test('propagates participant lookup errors', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: [{ owner_id: 'owner-1', slot_index: 0 }],
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({ ok: true })
    fetchParticipantStats.mockResolvedValue({
      ok: false,
      status: 400,
      body: { error: 'participant_lookup_failed' },
    })

    const res = createRes()
    await handler(createReq({ body: {} }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'participant_lookup_failed' })
  })

  test('propagates hero lookup errors', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: [{ owner_id: 'owner-1', slot_index: 0 }],
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({ ok: true })
    fetchParticipantStats.mockResolvedValue({ ok: true, map: new Map() })
    fetchHeroSummaries.mockResolvedValue({
      ok: false,
      status: 400,
      body: { error: 'hero_lookup_failed' },
    })

    const res = createRes()
    await handler(createReq({ body: {} }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'hero_lookup_failed' })
  })

  test('propagates prepare session errors', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    const normalizedRoster = [{ owner_id: 'owner-1', slot_index: 0 }]
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: normalizedRoster,
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({ ok: true })
    fetchParticipantStats.mockResolvedValue({ ok: true, map: new Map() })
    fetchHeroSummaries.mockResolvedValue({ ok: true, map: new Map(), heroMapFromRequest: {} })
    mergeRosterMetadata.mockReturnValue(normalizedRoster)
    callPrepareMatchSession.mockResolvedValue({
      ok: false,
      status: 500,
      body: { error: 'missing_prepare_rank_match_session' },
    })

    const res = createRes()
    await handler(createReq({ body: {} }), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'missing_prepare_rank_match_session' })
  })

  test('returns session details on success', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    const normalizedRoster = [
      { owner_id: 'owner-1', slot_index: 0, hero_name: 'Alice', hero_id: 'hero-x' },
    ]
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: normalizedRoster,
        heroMap: {},
        readyVote: { confirm: true },
        asyncFillMeta: { enabled: true },
        matchMode: 'duo',
        slotTemplate: { version: 10, source: 'client', updatedAt: '2023-02-02T00:00:00.000Z' },
        allowPartial: false,
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({ ok: true })
    fetchParticipantStats.mockResolvedValue({ ok: true, map: new Map() })
    fetchHeroSummaries.mockResolvedValue({ ok: true, map: new Map(), heroMapFromRequest: {} })
    mergeRosterMetadata.mockReturnValue(normalizedRoster)
    callPrepareMatchSession.mockResolvedValue({
      ok: true,
      data: {
        sessionId: 'session-1',
        slotTemplateVersion: 10,
        slotTemplateUpdatedAt: '2023-02-02T00:00:00.000Z',
        queueReconciled: 5,
        queueInserted: 3,
        queueRemoved: 2,
        sanitizedRoster: [
          {
            owner_id: 'owner-1',
            slot_index: 0,
            hero_id: '00000000-0000-4000-8000-000000000111',
            role: '딜러',
          },
        ],
      },
    })

    const res = createRes()
    await handler(createReq({ body: {} }), res)

    expect(callPrepareMatchSession).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        gameId: 'game-1',
        matchInstanceId: 'match-1',
        mode: 'duo',
        readyVote: { confirm: true },
        asyncFillMeta: { enabled: true },
        allowPartial: false,
      }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      session_id: 'session-1',
      slot_template_version: 10,
      slot_template_updated_at: '2023-02-02T00:00:00.000Z',
      queue: { reconciled: 5, inserted: 3, removed: 2 },
      roster: [
        expect.objectContaining({
          owner_id: 'owner-1',
          slot_index: 0,
          hero_id: '00000000-0000-4000-8000-000000000111',
          role: '딜러',
        }),
      ],
    })
  })

  test('applies sanitized roster when duplicates removed', async () => {
    extractBearerToken.mockReturnValue('token-1')
    fetchUserByToken.mockResolvedValue({ ok: true, user: { id: 'owner-1' } })
    const normalizedRoster = [
      { owner_id: 'owner-1', slot_index: 0, hero_id: 'hero-a', role: '탱커' },
      { owner_id: 'owner-1', slot_index: 1, hero_id: 'hero-b', role: '딜러' },
      { owner_id: 'owner-2', slot_index: 2, hero_id: 'hero-c', role: '힐러' },
    ]
    parseStageRequestBody.mockReturnValue({
      ok: true,
      value: {
        matchInstanceId: 'match-1',
        roomId: 'room-1',
        gameId: 'game-1',
        roster: normalizedRoster,
        heroMap: {},
        readyVote: {},
        asyncFillMeta: null,
        matchMode: null,
        slotTemplate: {},
        allowPartial: true,
        verificationRoles: [],
        verificationSlots: [],
      },
    })
    fetchRoomContext.mockResolvedValue({
      ok: true,
      ownerId: 'owner-1',
      mode: 'solo',
      slotTemplate: { version: 1, source: 'room', updatedAt: '2023-01-01T00:00:00.000Z' },
    })
    verifyRolesAndSlots.mockResolvedValue({ ok: true })
    fetchParticipantStats.mockResolvedValue({ ok: true, map: new Map() })
    fetchHeroSummaries.mockResolvedValue({ ok: true, map: new Map(), heroMapFromRequest: {} })
    mergeRosterMetadata.mockReturnValue(normalizedRoster)
    callPrepareMatchSession.mockResolvedValue({
      ok: true,
      data: {
        sessionId: 'session-1',
        slotTemplateVersion: 2,
        slotTemplateUpdatedAt: '2023-03-03T00:00:00.000Z',
        queueReconciled: 2,
        queueInserted: 1,
        queueRemoved: 1,
        sanitizedRoster: [
          { owner_id: 'owner-1', slot_index: 0, hero_id: 'hero-a', role: '탱커' },
          { owner_id: 'owner-2', slot_index: 2, hero_id: 'hero-c', role: '힐러' },
        ],
      },
    })

    const res = createRes()
    await handler(createReq({ body: {} }), res)

    expect(callPrepareMatchSession).toHaveBeenCalledWith(
      expect.objectContaining({ allowPartial: true }),
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.queue).toEqual({ reconciled: 2, inserted: 1, removed: 1 })
    expect(res.body.roster).toHaveLength(2)
    expect(res.body.roster.map((entry) => entry.owner_id)).toEqual([
      'owner-1',
      'owner-2',
    ])
  })
})
