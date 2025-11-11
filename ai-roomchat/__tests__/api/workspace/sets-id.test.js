const path = require('path');
const { createApiRequest, createMockResponse, loadApiRoute } = require('../../api/testUtils');
const { ensure, create, remove, list } = require('../../../lib/workspace/setsStore');

jest.mock('@supabase/ssr', () => ({
  createPagesServerClient: jest.fn((opts) => ({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) } })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) } })),
}));

function resetStore() {
  const all = list();
  for (const r of all) remove(r.id);
}

describe('workspace sets API (handler) auth & ownership', () => {
  beforeEach(() => resetStore());

  test('unauthenticated returns 401', async () => {
    const handler = loadApiRoute('workspace', 'sets', '[id].js');
    const req = createApiRequest({ method: 'GET', query: { id: 's1' } });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error', 'missing_user_id');
  });

  test('authenticated user can create/get own starter set', async () => {
    const handler = loadApiRoute('workspace', 'sets', '[id].js');
    const req = createApiRequest({ method: 'GET', query: { id: 'set-xyz' }, headers: { 'x-test-user': 'u1' } });
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', 'set-xyz');
    expect(res.body).toHaveProperty('owner', 'u1');
  });

  test('user cannot modify another user\'s set', async () => {
    // Create set as user A
    const handler = loadApiRoute('workspace', 'sets', '[id].js');
    let req = createApiRequest({ method: 'PUT', headers: { 'x-test-user': 'alice' }, body: { files: [{ path: '/x', content: '1' }] }, query: { id: 's-owner' } });
    let res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);

    // Attempt modify as bob (do NOT reload handler to avoid isolated module re-initialization)
    req = createApiRequest({ method: 'PATCH', headers: { 'x-test-user': 'bob' }, body: { files: [{ path: '/x', content: '2' }] }, query: { id: 's-owner' } });
    res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error', 'forbidden');
  });

  test('owner can delete, others cannot', async () => {
    const handler = loadApiRoute('workspace', 'sets', '[id].js');
    let req = createApiRequest({ method: 'PUT', headers: { 'x-test-user': 'owner-1' }, body: { files: [{ path: '/d', content: 'a' }] }, query: { id: 'can-delete' } });
    let res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  // verify via GET that owner is set
  req = createApiRequest({ method: 'GET', headers: { 'x-test-user': 'owner-1' }, query: { id: 'can-delete' } });
  res = createMockResponse();
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty('owner', 'owner-1');

    // delete as someone else
    req = createApiRequest({ method: 'DELETE', headers: { 'x-test-user': 'someone' }, query: { id: 'can-delete' } });
    res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    // delete as owner
    req = createApiRequest({ method: 'DELETE', headers: { 'x-test-user': 'owner-1' }, query: { id: 'can-delete' } });
    res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
  });
});
