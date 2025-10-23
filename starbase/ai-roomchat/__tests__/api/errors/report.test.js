const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseInsertChain,
} = require('../testUtils');

function loadHandler() {
  return loadApiRoute('errors', 'report');
}

describe('POST /api/errors/report', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects non-POST methods', async () => {
    const { fromMock } = createSupabaseInsertChain();
    registerSupabaseAdminMock(fromMock);

    const handler = loadHandler();
    const req = createApiRequest({ method: 'GET' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(['POST']);
  });

  it('validates presence of error message', async () => {
    const { insertMock, fromMock } = createSupabaseInsertChain();
    registerSupabaseAdminMock(fromMock);

    const handler = loadHandler();

    const req = createApiRequest({ method: 'POST', body: { message: '   ' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing error message' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('persists sanitized payloads', async () => {
    const { insertMock, fromMock } = createSupabaseInsertChain();
    registerSupabaseAdminMock(fromMock);

    const handler = loadHandler();

    const longPath = '/dashboard'.padEnd(600, 'x');
    const req = createApiRequest({
      method: 'POST',
      headers: {
        'user-agent': 'JestSuite/1.0',
        'x-forwarded-for': '203.0.113.1',
      },
      body: {
        message: 'Unhandled rejection ',
        stack: 'Error: boom',
        context: { foo: 'bar' },
        path: longPath,
        sessionId: ' session-123 ',
        severity: 'WARNING',
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload.session_id).toBe('session-123');
    expect(payload.path.length).toBeLessThanOrEqual(512);
    expect(payload.message).toBe('Unhandled rejection');
    expect(payload.severity).toBe('warn');
    expect(payload.user_agent).toBe('JestSuite/1.0');
    expect(typeof payload.context).toBe('object');
  });

  it('enforces throttling per ip/session pair', async () => {
    const { insertMock, fromMock } = createSupabaseInsertChain();
    registerSupabaseAdminMock(fromMock);

    const handler = loadHandler();

    for (let index = 0; index < 12; index += 1) {
      const req = createApiRequest({
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.5' },
        body: { message: `Issue ${index}`, sessionId: 'abc' },
      });
      const res = createMockResponse();
      await handler(req, res);
      expect(res.statusCode).toBe(201);
    }

    const throttledReq = createApiRequest({
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.5' },
      body: { message: 'Final issue', sessionId: 'abc' },
    });
    const throttledRes = createMockResponse();
    await handler(throttledReq, throttledRes);

    expect(throttledRes.statusCode).toBe(429);
    expect(throttledRes.body).toEqual({ error: 'Too many error reports, please slow down.' });
    expect(insertMock).toHaveBeenCalledTimes(12);
  });

  it('returns 500 when persistence fails', async () => {
    const { insertMock, fromMock } = createSupabaseInsertChain(() =>
      Promise.resolve({ error: { message: 'db down' } })
    );
    registerSupabaseAdminMock(fromMock);

    const handler = loadHandler();

    const req = createApiRequest({ method: 'POST', body: { message: 'boom' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to persist error report' });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
