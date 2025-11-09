const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

// Ensure test secret is set before requiring the server module
process.env.PROXY_SECRET = process.env.PROXY_SECRET || 'test-secret';

const { app, hmacHex } = require('../../proxy/server');

let server;

beforeAll((done) => {
  server = app.listen(0, () => done());
});

afterAll((done) => {
  if (server) server.close(() => done()); else done();
});

test('token issuance and signed request succeeds; nonce replay blocked', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1) request token
  const tokenRes = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'test-client' }),
  });
  expect(tokenRes.status).toBe(200);
  const tk = await tokenRes.json();
  expect(tk.token).toBeTruthy();

  // 2) make signed call
  const bodyObj = { prompt: 'hello from e2e test' };
  const body = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = `n-${Date.now()}`;
  const sig = hmacHex(process.env.PROXY_SECRET, `test-client:${ts}:${nonce}:${body}`);

  const proxyRes = await fetch(`${base}/v1/gemini`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${tk.token}`,
      'x-signature': sig,
      'x-nonce': nonce,
      'x-timestamp': ts,
    },
    body,
  });

  expect(proxyRes.status).toBe(200);
  const json = await proxyRes.json();
  expect(json.ok).toBe(true);
  expect(json.provider).toBeTruthy();
  expect(json.provider.text).toMatch(/MOCK_PROVIDER/);

  // 3) replay with same nonce should be rejected
  const replayRes = await fetch(`${base}/v1/gemini`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${tk.token}`,
      'x-signature': sig,
      'x-nonce': nonce,
      'x-timestamp': ts,
    },
    body,
  });

  expect(replayRes.status).toBe(401);
  const replayJson = await replayRes.json();
  expect(replayJson.error).toBeTruthy();
});
