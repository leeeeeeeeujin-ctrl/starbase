const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

process.env.PROXY_SECRET = process.env.PROXY_SECRET || 'test-secret';
const { app, hmacHex } = require('../../proxy/server');

async function run() {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log('Test proxy base:', base);

  try {
    const tokenRes = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'test-client' }),
    });
    if (tokenRes.status !== 200) throw new Error('token failed: ' + tokenRes.status);
    const tk = await tokenRes.json();
  console.log('token response:', tk);

  const bodyObj = { prompt: 'hello from e2e run' };
  const body = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = `n-${Date.now()}`;
  // Use returned token secret if available, otherwise fall back to PROXY_SECRET for compatibility
  const keyForSig = tk.secret || process.env.PROXY_SECRET;
  const sig = hmacHex(keyForSig, `test-client:${ts}:${nonce}:${body}`);

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

    console.log('proxyRes status:', proxyRes.status);
    const json = await proxyRes.json();
    console.log('proxyResp:', json);
    if (!json.ok) throw new Error('proxy returned not ok');

    // replay with same nonce should fail
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

    console.log('replay status:', replayRes.status);
    const replayJson = await replayRes.json();
    console.log('replay json:', replayJson);
    if (replayRes.status === 200) throw new Error('replay accepted unexpectedly');

    // If Redis is available, test token revocation
    if (process.env.REDIS_URL) {
      console.log('Testing revocation...');
      const revokeRes = await fetch(`${base}/token/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tk.token }),
      });
      console.log('revoke status:', revokeRes.status);
      if (revokeRes.status !== 200) {
        console.log('revoke response:', await revokeRes.text());
        throw new Error('revoke failed');
      }

      // Now request should be rejected
      const postRevokeRes = await fetch(`${base}/v1/gemini`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${tk.token}`,
          'x-signature': sig,
          'x-nonce': `n-${Date.now()}-rev`,
          'x-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        body,
      });
      console.log('postRevoke status:', postRevokeRes.status);
      if (postRevokeRes.status === 200) throw new Error('revoked token still accepted');
    } else {
      console.log('REDIS_URL not set; skipping revocation test.');
    }

    console.log('E2E proxy run: SUCCESS');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E proxy run: FAILED', err);
    try { server.close(); } catch (e) {}
    process.exit(2);
  }
}

run();
