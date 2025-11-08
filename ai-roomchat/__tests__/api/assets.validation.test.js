// Minimal tests for server-side validations on assets endpoints
// Note: These tests focus on early validation and do not hit external services.

jest.mock('../../lib/server/quota.js', () => ({
  enforceBeforeClassA: jest.fn(async () => {}),
  incClassA: jest.fn(async () => {}),
  enforceAndCountClassB: jest.fn(async () => {}),
  reconcileStorageOnCommit: jest.fn(async () => {}),
}));

function mockReqRes({ method = 'POST', body = {}, headers = {} } = {}) {
  const req = { method, body, headers };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status(code){ statusCode = code; return this; },
    json(obj){ jsonBody = obj; return this; },
    get _status(){ return statusCode; },
    get _json(){ return jsonBody; },
  };
  return { req, res };
}

describe('assets validations', () => {
  test('upload-url rejects invalid key shape', async () => {
    const handler = (await import('../../pages/api/assets/upload-url.js')).default;
    const { req, res } = mockReqRes({ body: { key: 'foo/bar', contentType: 'image/png', size: 1234 } });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json && res._json.error).toBeTruthy();
  });

  test('commit rejects non-webp images', async () => {
    const handler = (await import('../../pages/api/assets/commit.js')).default;
    const { req, res } = mockReqRes({ body: { key: 'games/g1/s1/file.png', hash: 'abcd', size: 1024, mime: 'image/png' } });
    await handler(req, res);
    expect(res._status).toBe(415);
  });

  test('upload-url enforces size budget for huge image', async () => {
    const handler = (await import('../../pages/api/assets/upload-url.js')).default;
    const big = 100 * 1024 * 1024; // 100MB
    const { req, res } = mockReqRes({ body: { key: 'games/g1/s1/big.webp', contentType: 'image/webp', size: big } });
    await handler(req, res);
    expect(res._status).toBeGreaterThanOrEqual(400);
    expect(res._json && res._json.error).toBeTruthy();
  });

  test('delete-by-game rejects invalid gameId', async () => {
    const handler = (await import('../../pages/api/storage/delete-by-game.js')).default;
    const { req, res } = mockReqRes({ body: { gameId: '***' } });
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
