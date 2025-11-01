#!/usr/bin/env node
// Simple Gemini proxy PoC
// - starts an HTTP server with a POST /v1/gemini endpoint
// - verifies HMAC-SHA256 signature in header 'x-signature'
// - calls a mock provider function and returns the result
// - includes a built-in client that signs a request and posts to the server

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PROXY_PORT || 4000;
const SECRET = process.env.PROXY_SECRET || 'local-dev-secret-please-rotate';

function hmac(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

function mockProviderCall(prompt) {
  // Simulate an LLM/provider response
  return { text: `MOCK_RESPONSE: ${prompt.slice(0, 200)}` };
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/gemini') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const sig = req.headers['x-signature'] || '';
      const expected = hmac(body);
      if (!sig || sig !== expected) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid signature' }));
        return;
      }

      let payload;
      try { payload = JSON.parse(body); } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
        return;
      }

      // Basic request validation
      if (!payload.prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing prompt' }));
        return;
      }

      // call mock provider
      const providerResp = mockProviderCall(payload.prompt);
      const out = { ok: true, provider: providerResp };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

function runClientPrompt(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ prompt });
    const signature = hmac(payload);

    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: '/v1/gemini',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-signature': signature
      }
    };

    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Starting Gemini proxy PoC server on port', PORT);
  const server = await startServer();

  try {
    const prompt = 'Hello from PoC client: translate to Korean: "deploy safe migrations"';
    console.log('Client: sending prompt');
    const resp = await runClientPrompt(prompt);
    console.log('Client: received', resp.status, JSON.stringify(resp.body));
  } finally {
    server.close(() => console.log('Server closed'));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
