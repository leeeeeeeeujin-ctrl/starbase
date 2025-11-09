#!/usr/bin/env node
// Simple device-runner shim for local/dev use
// - Accepts POST /run { prompt, options } and returns a provider-like response
// - Optional header: x-runner-secret to restrict access
// - Intentionally minimal; meant as a local/dev companion process (e.g. Termux or desktop)

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fetch = require('node-fetch');

const DEFAULT_PORT = process.env.PORT || 3001;
const SECRET = process.env.DEVICE_RUNNER_SECRET || '';

function makeApp() {
  const app = express();
  app.use(bodyParser.json({ limit: '256kb' }));

  // health
  app.get('/health', (req, res) => res.json({ ok: true, pid: process.pid }));

  // simple run endpoint
  app.post('/run', async (req, res) => {
    try {
      if (SECRET) {
        const header = req.header('x-runner-secret') || '';
        if (!header || header !== SECRET) {
          return res.status(401).json({ error: 'unauthorized' });
        }
      }

      const body = req.body || {};
      const prompt = String(body.prompt || body.template || '');
      const opts = body.options || {};

      // If the client attached HMAC-style verification headers (X-Device-Id etc.),
      // call the configured server verify endpoint to validate the signature before executing.
      const deviceId = req.header('X-Device-Id') || req.header('x-device-id');
      const ts = req.header('X-Request-Timestamp') || req.header('x-request-timestamp');
      const nonce = req.header('X-Request-Nonce') || req.header('x-request-nonce');
      const signature = req.header('X-Client-Signature') || req.header('x-client-signature');
      if (deviceId && ts && nonce && signature) {
        try {
          const verifyEndpoint = process.env.RUNNER_VERIFY_ENDPOINT || (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/$/, '')}/api/devices/verify` : 'http://localhost:3000/api/devices/verify');
          const verifyRes = await fetch(verifyEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Device-Id': deviceId,
              'X-Request-Timestamp': ts,
              'X-Request-Nonce': nonce,
              'X-Client-Signature': signature,
            },
            body: JSON.stringify(req.body || {}),
            timeout: 5000,
          });
          if (!verifyRes.ok) {
            const txt = await verifyRes.text().catch(() => '');
            return res.status(401).json({ error: 'signature_verification_failed', detail: txt });
          }
        } catch (e) {
          console.warn('Runner shim: verification endpoint call failed', String(e));
          return res.status(500).json({ error: 'verification_endpoint_unreachable' });
        }
      }

      // Very small protective check: disallow obvious attempts to read files
      if (/\b(fs|child_process|require)\b/.test(prompt)) {
        return res.status(400).json({ error: 'prompt contains disallowed tokens' });
      }

      // Simulate a provider response. In future, this can shell out to an installed CLI.
      const timestamp = new Date().toISOString();
      const simulated = `SIMULATED_RUN: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`;

      const response = {
        text: simulated,
        rendered_prompt: prompt,
        meta: { runAt: timestamp, runner: 'shim', options: opts },
      };

      // optional HMAC signature for verification by server (if secret provided)
      if (opts.signWith && typeof opts.signWith === 'string') {
        try {
          const h = crypto.createHmac('sha256', opts.signWith).update(JSON.stringify(response)).digest('hex');
          response.signature = h;
        } catch (e) {}
      }

      return res.json(response);
    } catch (err) {
      console.error('run error', err);
      return res.status(500).json({ error: String(err) });
    }
  });

  return app;
}

if (require.main === module) {
  const app = makeApp();
  const port = Number(process.env.PORT || DEFAULT_PORT) || DEFAULT_PORT;
  app.listen(port, () => {
    console.log(`Device-runner shim listening on http://0.0.0.0:${port}`);
    if (SECRET) console.log('Runner secret is set (hidden)');
  });
}

module.exports = { makeApp };
