const crypto = require('crypto');
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseSelectChain,
} = require('../testUtils');

function loadHandler() {
  return loadApiRoute('admin', 'errors');
}

describe('GET /api/admin/errors', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.ADMIN_PORTAL_PASSWORD;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects non-GET methods', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null });
    registerSupabaseAdminMock(chain.fromMock);

    process.env.ADMIN_PORTAL_PASSWORD = 'secret';
    const handler = loadHandler();

    const req = createApiRequest({ method: 'POST' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(['GET']);
    expect(chain.fromMock).not.toHaveBeenCalled();
  });

  it('requires the admin password to be configured', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null });
    registerSupabaseAdminMock(chain.fromMock);

    const handler = loadHandler();
    const req = createApiRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Admin portal password is not configured' });
  });

  it('rejects missing session tokens', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null });
    registerSupabaseAdminMock(chain.fromMock);

    process.env.ADMIN_PORTAL_PASSWORD = 'secret';
    const handler = loadHandler();

    const req = createApiRequest({ headers: { cookie: '' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Missing session token' });
    expect(chain.fromMock).not.toHaveBeenCalled();
  });

  it('rejects invalid session tokens', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null });
    registerSupabaseAdminMock(chain.fromMock);

    const password = 'secret';
    process.env.ADMIN_PORTAL_PASSWORD = password;
    const handler = loadHandler();

    const req = createApiRequest({ headers: { cookie: 'rank_admin_portal_session=invalid' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid session token' });
    expect(chain.fromMock).not.toHaveBeenCalled();
  });

  it('returns recent error reports with stats', async () => {
    const fixedNow = new Date('2025-01-01T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const data = [
      {
        id: 1,
        session_id: 'abc',
        path: '/a',
        message: 'boom',
        severity: 'ERROR',
        stack: null,
        context: {},
        user_agent: 'UA',
        created_at: new Date(fixedNow - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        session_id: 'def',
        path: '/b',
        message: 'warn',
        severity: 'warn',
        stack: null,
        context: {},
        user_agent: 'UA2',
        created_at: new Date(fixedNow - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 3,
        session_id: 'ghi',
        path: '/c',
        message: 'info',
        severity: 'info',
        stack: null,
        context: {},
        user_agent: 'UA3',
        created_at: new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const chain = createSupabaseSelectChain({ data, error: null });
    registerSupabaseAdminMock(chain.fromMock);

    const password = 'secret';
    process.env.ADMIN_PORTAL_PASSWORD = password;

    const handler = loadHandler();

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex');

    const req = createApiRequest({
      headers: { cookie: `rank_admin_portal_session=${sessionToken}` },
      query: { limit: '20' },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(chain.fromMock).toHaveBeenCalledWith('rank_user_error_reports');
    expect(chain.selectMock).toHaveBeenCalledWith(
      'id, session_id, path, message, severity, stack, context, user_agent, created_at'
    );
    expect(chain.orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limitMock).toHaveBeenCalledWith(20);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual(data);
    expect(res.body.stats).toEqual({
      total: 3,
      last24h: 1,
      bySeverity: { error: 1, warn: 1, info: 1 },
    });
  });

  it('propagates Supabase errors', async () => {
    const chain = createSupabaseSelectChain({ data: null, error: { message: 'db fail' } });
    registerSupabaseAdminMock(chain.fromMock);

    const password = 'secret';
    process.env.ADMIN_PORTAL_PASSWORD = password;
    const handler = loadHandler();

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex');

    const req = createApiRequest({
      headers: { cookie: `rank_admin_portal_session=${sessionToken}` },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch error reports' });
  });
});
