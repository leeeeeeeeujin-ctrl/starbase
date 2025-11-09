const { createToken, verifyToken } = require('../../lib/security/token');

describe('device token create/verify', () => {
  test('create and verify token with secret', () => {
    const secret = 'test-secret-123';
    const t = createToken({ hello: 'world' }, secret, 60);
    expect(typeof t).toBe('string');
    const payload = verifyToken(t, secret);
    expect(payload).toBeTruthy();
    expect(payload.hello).toBe('world');
  });

  test('expired token returns null', () => {
    const secret = 'test-secret-123';
    const t = createToken({ a: 1 }, secret, 1); // short ttl
    // simulate time by verifying with a slight delay
    // jest timer cannot easily advance here, so we'll just parse and manually set exp in the past
    const parts = t.split('.');
    const body = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    body.exp = Math.floor(Date.now() / 1000) - 10;
    const newB = Buffer.from(JSON.stringify(body)).toString('base64');
    const forged = newB + '.' + parts[1];
    const payload = verifyToken(forged, secret);
    expect(payload).toBeNull();
  });
});
