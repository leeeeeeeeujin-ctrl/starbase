const { describe, it, expect, beforeEach } = require('@jest/globals');

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseSelectChain,
} = require('../testUtils');

const mockGetUser = jest.fn();

jest.mock('@/lib/rank/db', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
  },
}));

function loadHandler() {
  return loadApiRoute('rank', 'register-game');
}

describe('POST /api/rank/register-game', () => {
  let rpcMock;
  let promptSetChain;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    rpcMock = jest.fn().mockResolvedValue({ data: [{ game_id: 'game-1' }], error: null });

    promptSetChain = createSupabaseSelectChain(
      Promise.resolve({ data: [{ id: 'set-1' }], error: null })
    );

    registerSupabaseAdminMock(tableName => {
      if (tableName === 'prompt_sets' || tableName === 'rank_prompt_sets') {
        return promptSetChain.fromMock();
      }
      return {
        insert: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn() })) })),
        delete: jest.fn(),
      };
    }, rpcMock);
  });

  function createValidBody(overrides = {}) {
    return {
      name: '테스트 게임',
      description: '설명',
      prompt_set_id: 'set-1',
      realtime_match: 'standard',
      slots: [
        { slot_index: 0, role: '딜러', active: true },
        { slot_index: 1, role: '탱커', active: true },
      ],
      roles: [
        { name: '딜러', slot_count: 1, score_delta_min: 10, score_delta_max: 20 },
        { name: '탱커', slot_count: 1, score_delta_min: 15, score_delta_max: 25 },
      ],
      rules: {},
      ...overrides,
    };
  }

  it('requires a bearer token', async () => {
    const handler = loadHandler();
    const req = createApiRequest({ method: 'POST', body: createValidBody() });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('registers the game when RPCs succeed', async () => {
    const handler = loadHandler();

    rpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ game_id: 'game-xyz' }], error: null });

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(mockGetUser).toHaveBeenCalledWith('token');
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'verify_rank_roles_and_slots',
      expect.objectContaining({
        p_roles: expect.any(Array),
        p_slots: expect.any(Array),
      })
    );
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      'register_rank_game',
      expect.objectContaining({ p_owner_id: 'user-123' })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, gameId: 'game-xyz' });
  });

  it('returns 400 when verification fails', async () => {
    const handler = loadHandler();

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid_roles', details: 'slot_count_mismatch:탱커' },
    });

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'roles_slots_invalid', detail: 'slot_count_mismatch:탱커' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('continues when verification RPC is missing', async () => {
    const handler = loadHandler();

    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'function verify_rank_roles_and_slots(jsonb,jsonb) does not exist' },
      })
      .mockResolvedValueOnce({ data: [{ game_id: 'game-777' }], error: null });

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, gameId: 'game-777' });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown prompt sets', async () => {
    const handler = loadHandler();

    promptSetChain.limitMock.mockResolvedValueOnce({ data: [], error: null });

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: createValidBody({ prompt_set_id: 'missing' }),
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_prompt_set' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prompt set lookup fails', async () => {
    const handler = loadHandler();

    promptSetChain.limitMock.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });

    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: createValidBody(),
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'prompt_set_lookup_failed' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
