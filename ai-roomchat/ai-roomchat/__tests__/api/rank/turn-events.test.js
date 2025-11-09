const { describe, it, expect, beforeEach } = require('@jest/globals');

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminRpcMock,
} = require('../testUtils');

function loadHandler() {
  return loadApiRoute('rank', 'turn-events');
}

describe('GET /api/rank/turn-events', () => {
  let rpcMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    rpcMock = jest.fn().mockResolvedValue({ data: [], error: null });
    registerSupabaseAdminRpcMock(rpcMock);
  });

  it('rejects non-GET methods', async () => {
    const handler = loadHandler();
    const req = createApiRequest({ method: 'POST' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(['GET']);
  });

  it('requires a session id', async () => {
    const handler = loadHandler();
    const req = createApiRequest({ method: 'GET' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'missing_session_id' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects invalid limit', async () => {
    const handler = loadHandler();
    const req = createApiRequest({
      method: 'GET',
      query: { sessionId: 'session-1', limit: 'abc' },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_limit' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('propagates rpc errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const handler = loadHandler();
    const req = createApiRequest({
      method: 'GET',
      query: { sessionId: 'session-1' },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'fetch_failed' });
    expect(rpcMock).toHaveBeenCalledWith('fetch_rank_turn_state_events', {
      p_session_id: 'session-1',
      p_since: null,
      p_limit: 50,
    });
  });

  it('returns events from RPC', async () => {
    const events = [
      {
        id: 1,
        session_id: 'session-1',
        state: { turnNumber: 2 },
        emitted_at: '2024-01-01T00:00:00.000Z',
      },
    ];
    rpcMock.mockResolvedValueOnce({ data: events, error: null });
    const handler = loadHandler();
    const req = createApiRequest({
      method: 'GET',
      query: {
        sessionId: 'session-1',
        since: `${Date.UTC(2024, 0, 1)}`,
        limit: '120',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(rpcMock).toHaveBeenCalledWith(
      'fetch_rank_turn_state_events',
      expect.objectContaining({
        p_session_id: 'session-1',
        p_limit: 120,
      })
    );
    const payload = rpcMock.mock.calls[0][1];
    expect(typeof payload.p_since).toBe('string');
    expect(new Date(payload.p_since).getTime()).toBe(Number(req.query.since));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, events });
  });
});
