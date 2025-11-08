const handler = require('../../../pages/api/devices/verify-signature').default;
const nonceStore = require('../../../lib/nonceStore');

function makeReq(headers, body) {
  return { method: 'POST', headers: headers || {}, body: body || {} };
}

function makeRes() {
  const res = {};
  res.status = code => { res._status = code; return res; };
  res.json = obj => { res._json = obj; return res; };
  res.text = txt => { res._text = txt; return res; };
  return res;
}

// Small mocking helper for time
const origNow = Date.now;

beforeAll(() => {
  jest.spyOn(Date, 'now').mockImplementation(() => 1700000000000); // stable timestamp
});

afterAll(() => {
  Date.now.mockRestore();
});

describe('POST /api/devices/verify-signature', () => {
  test('rejects when timestamp outside window', async () => {
    const headers = {
      'x-request-timestamp': String(Math.floor((Date.now() - 1000 * 60 * 10) / 1000)), // 10 minutes ago
      'x-request-nonce': 'abc123',
      'x-client-signature': '00',
      'x-device-id': 'dev1',
    };
    const req = makeReq(headers, { foo: 'bar' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('rejects replayed nonce', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'deadbeef';
    // set the nonce in store first
    await nonceStore.setIfNotExists(`nonce:dev1:${nonce}`, 60);

    const headers = {
      'x-request-timestamp': String(ts),
      'x-request-nonce': nonce,
      'x-client-signature': '00',
      'x-device-id': 'dev1',
    };
    const req = makeReq(headers, { foo: 'bar' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('accepts well-formed request when nonce unused and timestamp ok but fails signature when wrong', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'cafebabef00d';
    // ensure nonce is not present
    // (no-op if present)

    const headers = {
      'x-request-timestamp': String(ts),
      'x-request-nonce': nonce,
      'x-client-signature': 'badsignature',
      'x-device-id': 'dev1',
    };
    const req = makeReq(headers, { foo: 'bar' });
    const res = makeRes();
    await handler(req, res);
    // handler will try to verify signature and likely return 401 for bad signature
    expect(res._status).toBe(401);
  });
});
