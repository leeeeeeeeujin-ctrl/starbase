/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApiRequest, createMockResponse, loadApiRoute } = require('../testUtils');

describe('POST /api/rank/handle-action sandbox guards', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, prevEnv);
    jest.resetModules();
  });

  test('returns 403 when sandbox execution is disabled', async () => {
    delete process.env.SANDBOX_EXEC_ENABLE;
    const handler = loadApiRoute('rank', 'handle-action.js');
    const req = createApiRequest({
      method: 'POST',
      body: { action: 'sandbox_exec', payload: { cmd: 'echo hi' } },
    });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'sandbox_disabled' });
  });

  test('requires auth for sandbox-related actions', async () => {
    process.env.SANDBOX_EXEC_ENABLE = '1';
    const handler = loadApiRoute('rank', 'handle-action.js');
    const req = createApiRequest({
      method: 'POST',
      body: { action: 'sandbox_exec', payload: { cmd: 'echo hi' } },
    });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'auth_required_for_sandbox' });
  });

  test('batch with sandbox action inherits same guards', async () => {
    const handler = loadApiRoute('rank', 'handle-action.js');
    const req = createApiRequest({
      method: 'POST',
      body: { action: 'batch', payload: { actions: [{ action: 'sandbox_exec', payload: { cmd: 'echo hi' } }] } },
    });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'sandbox_disabled' });
  });

  test('sandbox_exec passes when env enabled, user present, and allowlist matches', async () => {
    // mock supabase client to always return a user id
    jest.resetModules();
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
        },
      }),
    }));
    // prepare isolated workspace root with allowlist permitting node commands
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-api-'));
    const ws = path.join(root, 'workspace');
    fs.mkdirSync(path.join(ws, 'config'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'config', 'ai-actions-allowlist.json'), JSON.stringify({ allow: ['node '] }), 'utf8');
    process.env.WORKSPACE_ROOT = root;
    process.env.SANDBOX_EXEC_ENABLE = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://example.test';
    process.env.SUPABASE_SERVICE_ROLE = 'sr-key';

    const handler = loadApiRoute('rank', 'handle-action.js');
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { action: 'sandbox_exec', payload: { cmd: 'node -e "console.log(123)"' } },
    });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body.result.stdout.trim()).toBe('123');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('sandbox_exec blocked when allowlist misses command', async () => {
    jest.resetModules();
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
        },
      }),
    }));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-api-'));
    const ws = path.join(root, 'workspace');
    fs.mkdirSync(ws, { recursive: true });
    // Write default allowlist (empty)
    fs.mkdirSync(path.join(ws, 'config'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'config', 'ai-actions-allowlist.json'), JSON.stringify({ allow: [] }), 'utf8');
    process.env.WORKSPACE_ROOT = root;
    process.env.SANDBOX_EXEC_ENABLE = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://example.test';
    process.env.SUPABASE_SERVICE_ROLE = 'sr-key';

    const handler = loadApiRoute('rank', 'handle-action.js');
    const req = createApiRequest({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: { action: 'sandbox_exec', payload: { cmd: 'node -v' } },
    });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'sandbox_blocked' });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
