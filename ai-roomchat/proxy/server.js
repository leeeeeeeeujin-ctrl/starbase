const express = require('express');
const crypto = require('crypto');
const IORedis = require('ioredis');
const bodyParser = require('body-parser');

const SECRET = process.env.PROXY_SECRET || 'local-proxy-secret-change-me';
const PORT = process.env.PROXY_PORT || 4100;

function hmacHex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

// Simple in-memory nonce store and rate limiter for PoC (fallback)
const nonceStore = new Map(); // nonce -> expirySec
const RATE_WINDOW_SEC = 60;
const RATE_LIMIT = 10; // per client per window (PoC)
const rateMap = new Map(); // clientId -> { count, windowStart }

// Redis client (optional): use REDIS_URL env to enable Redis-backed nonce/rate
const REDIS_URL = process.env.REDIS_URL || null;
let redis = null;
if (REDIS_URL) {
  try {
    redis = new IORedis(REDIS_URL);
  } catch (e) {
    console.warn('Failed to connect to Redis, falling back to in-memory:', e.message);
    redis = null;
  }
}

function cleanupNonceStore() {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, exp] of nonceStore.entries()) {
    if (exp < now) nonceStore.delete(k);
  }
}

function checkAndStoreNonceFallback(nonce, ttlSec = 60) {
  cleanupNonceStore();
  if (!nonce) return false;
  if (nonceStore.has(nonce)) return false;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  nonceStore.set(nonce, exp);
  return true;
}

function checkRateLimitFallback(clientId) {
  const now = Math.floor(Date.now() / 1000);
  const entry = rateMap.get(clientId) || { count: 0, windowStart: now };
  if (now - entry.windowStart >= RATE_WINDOW_SEC) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateMap.set(clientId, entry);
  return entry.count <= RATE_LIMIT;
}

// Async wrappers: if Redis is configured, use it; otherwise fallback to in-memory
async function checkAndStoreNonceAsync(nonce, ttlSec = 60) {
  if (!nonce) return false;
  if (!redis) return checkAndStoreNonceFallback(nonce, ttlSec);
  const key = `nonce:${nonce}`;
  // SET key NX EX ttl
  const ok = await redis.set(key, '1', 'EX', ttlSec, 'NX');
  return ok === 'OK';
}

async function checkRateLimitAsync(clientId) {
  if (!redis) return checkRateLimitFallback(clientId);
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / RATE_WINDOW_SEC);
  const key = `rate:${clientId}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SEC + 2);
  }
  return count <= RATE_LIMIT;
}

function issueToken(clientId, ttlSec = 60) {
  const tokenId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = JSON.stringify({ tokenId, clientId, exp });
  const sig = hmacHex(SECRET, payload);
  // Per-token secret for client-side request signing
  const tokenSecret = crypto.randomBytes(32).toString('hex');
  return { token: Buffer.from(payload).toString('base64') + '.' + sig, tokenId, tokenSecret, exp };
}

function verifyToken(token) {
  try {
    const [b64, sig] = token.split('.');
    // debug: show token parts when failing
    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const expected = hmacHex(SECRET, payload);
    if (expected !== sig) {
      console.debug('verifyToken mismatch', { b64, sig, expected, payload });
      return null;
    }
    const obj = JSON.parse(payload);
    if (obj.exp < Math.floor(Date.now() / 1000)) return null;
    return obj;
  } catch (e) {
    return null;
  }
}

// Token persistence helpers
async function storeTokenAsync(tokenId, ttlSec, meta = {}) {
  if (!redis) return false;
  const key = `token:${tokenId}`;
  const payload = JSON.stringify(meta || {});
  const ok = await redis.set(key, payload, 'EX', ttlSec);
  return ok === 'OK';
}

async function tokenExistsAsync(tokenId) {
  if (!redis) return true; // if no redis, treat token as existing (no revocation capability)
  const key = `token:${tokenId}`;
  const v = await redis.get(key);
  return v !== null;
}

async function revokeTokenAsync(tokenId) {
  if (!redis) return false;
  const key = `token:${tokenId}`;
  const n = await redis.del(key);
  return n > 0;
}

// In-memory fallback for token secrets (for local dev when Redis absent)
const tokenSecretsMap = new Map(); // tokenId -> { secret, exp, meta }

function storeTokenFallback(tokenId, secret, ttlSec, meta = {}) {
  try {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    tokenSecretsMap.set(tokenId, { secret, exp, meta });
    return true;
  } catch (e) {
    return false;
  }
}

function getTokenSecretFallback(tokenId) {
  const rec = tokenSecretsMap.get(tokenId);
  if (!rec) return null;
  const now = Math.floor(Date.now() / 1000);
  if (rec.exp < now) { tokenSecretsMap.delete(tokenId); return null; }
  return rec.secret;
}

async function getTokenSecretAsync(tokenId) {
  if (redis) {
    const key = `token:${tokenId}`;
    const s = await redis.get(key);
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parsed && parsed.secret ? parsed.secret : null;
    } catch (e) {
      return null;
    }
  }
  return getTokenSecretFallback(tokenId);
}

async function revokeTokenAsyncUnified(tokenId) {
  let ok = false;
  if (redis) {
    ok = await revokeTokenAsync(tokenId);
  }
  if (tokenSecretsMap.has(tokenId)) { tokenSecretsMap.delete(tokenId); ok = true; }
  return ok;
}

function mockProvider(prompt) {
  return { text: `MOCK_PROVIDER: ${prompt.slice(0, 200)}` };
}

const app = express();
app.use(bodyParser.json({ limit: '64kb' }));

// Simple filesystem-backed templates store for Editor templates (PoC)
const fs = require('fs');
const path = require('path');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.resolve(__dirname, '../data/templates');

function ensureTemplatesDir() {
  try {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function listTemplates() {
  ensureTemplatesDir();
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const raw = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) { return null; }
  }).filter(Boolean);
}

function saveTemplate({ id, name, code, meta }) {
  ensureTemplatesDir();
  const now = Date.now();
  const tid = id || crypto.randomUUID();
  const rec = { id: tid, name: name || `template-${tid.slice(0,6)}`, code: code || '', meta: meta || {}, createdAt: (meta && meta.createdAt) || now, updatedAt: now };
  fs.writeFileSync(path.join(TEMPLATES_DIR, `${tid}.json`), JSON.stringify(rec, null, 2), 'utf8');
  return rec;
}


// Simple token issuance endpoint (demo only)
app.post('/token', (req, res) => {
  (async () => {
    // Require an API key for token issuance in production-like setups.
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['X-API-KEY'];
    const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;
    if (ADMIN_API_KEY) {
      if (!apiKeyHeader || apiKeyHeader !== ADMIN_API_KEY) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } else {
      // No ADMIN_API_KEY configured -> allow in dev but log
      console.warn('ADMIN_API_KEY not set; /token is open for development. Set ADMIN_API_KEY to restrict.');
    }

    const clientId = req.body.clientId || 'anon';
    const ttl = parseInt(process.env.TOKEN_TTL || '300', 10);
    const issued = issueToken(clientId, ttl);
    const token = issued.token;
    // persist token metadata and secret if redis available, otherwise store in-memory fallback
    try {
      if (issued && issued.tokenId) {
        const meta = { clientId, issuedAt: Date.now(), secret: issued.tokenSecret };
        if (redis) {
          await storeTokenAsync(issued.tokenId, ttl, meta);
        } else {
          storeTokenFallback(issued.tokenId, issued.tokenSecret, ttl, meta);
        }
      }
    } catch (e) {
      console.warn('token persistence failed:', e.message);
    }
    // Return token and tokenSecret to client (short-lived secret for signing)
    // Attach owner metadata when API key was used for issuance
    try {
      const meta = { clientId, issuedAt: Date.now(), secret: issued.tokenSecret, owner: apiKeyHeader ? ('api-key:' + (apiKeyHeader && apiKeyHeader.slice ? apiKeyHeader.slice(0,6) : 'unknown')) : undefined };
      if (issued && issued.tokenId) {
        if (redis) {
          await storeTokenAsync(issued.tokenId, ttl, meta);
        } else {
          storeTokenFallback(issued.tokenId, issued.tokenSecret, ttl, meta);
        }
      }
    } catch (e) {
      console.warn('token persistence failed:', e.message);
    }
    console.debug('issued token data:', issued);
    res.json({ token, ttl, secret: issued && issued.tokenSecret ? issued.tokenSecret : undefined });
  })();
});

// Token revoke endpoint
app.post('/token/revoke', async (req, res) => {
  const token = req.body.token || req.body.tokenId;
  if (!token) return res.status(400).json({ error: 'missing token/tokenId' });
  // accept both token string and tokenId
  let tokenId = token;
  if (token.includes('.')) {
    try {
      const [b64] = token.split('.');
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      tokenId = payload.tokenId;
    } catch (e) {
      return res.status(400).json({ error: 'invalid token' });
    }
  }
  try {
    const ok = await revokeTokenAsyncUnified(tokenId);
    if (!ok) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'internal' });
  }
});

// Proxy endpoint: expects Authorization: Bearer <token> and x-signature header
app.post('/v1/gemini', async (req, res) => {
  const auth = req.headers['authorization'] || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
  const token = parts[1];
  const tok = verifyToken(token);
  if (!tok) return res.status(401).json({ error: 'invalid token' });
  // Require timestamp and nonce headers to prevent replay
  const ts = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  if (!ts || !nonce) return res.status(400).json({ error: 'missing timestamp or nonce' });
  const nowSec = Math.floor(Date.now() / 1000);
  const tnum = parseInt(ts, 10);
  if (Number.isNaN(tnum) || Math.abs(nowSec - tnum) > 120) return res.status(401).json({ error: 'stale timestamp' });

  // Check nonce uniqueness (async-aware)
  try {
    const okNonce = await checkAndStoreNonceAsync(nonce, 120);
    if (!okNonce) return res.status(401).json({ error: 'nonce reuse or invalid' });
  } catch (e) {
    console.error('nonce check failed:', e.message);
    return res.status(500).json({ error: 'internal' });
  }

  // Rate limit per clientId
  try {
    const okRate = await checkRateLimitAsync(tok.clientId);
    if (!okRate) return res.status(429).json({ error: 'rate_limited' });
  } catch (e) {
    console.error('rate check failed:', e.message);
    return res.status(500).json({ error: 'internal' });
  }

  const body = JSON.stringify(req.body || {});
  // Expected signature includes clientId, timestamp, nonce, and body
  const sig = (req.headers['x-signature'] || '').toString();
  // try per-token secret first (preferred), fall back to global SECRET for compatibility
  let expectedSig = null;
  try {
    const tokenSecret = await getTokenSecretAsync(tok.tokenId);
    if (tokenSecret) {
      expectedSig = hmacHex(tokenSecret, `${tok.clientId}:${ts}:${nonce}:${body}`);
    } else {
      expectedSig = hmacHex(SECRET, `${tok.clientId}:${ts}:${nonce}:${body}`);
    }
  } catch (e) {
    expectedSig = hmacHex(SECRET, `${tok.clientId}:${ts}:${nonce}:${body}`);
  }
  if (!sig || sig !== expectedSig) return res.status(401).json({ error: 'invalid signature' });

  if (!req.body || !req.body.prompt) return res.status(400).json({ error: 'missing prompt' });

  const providerResp = mockProvider(req.body.prompt);
  res.json({ ok: true, clientId: tok.clientId, provider: providerResp });
});

// Editor templates endpoints (PoC)
app.get('/editor/templates', (req, res) => {
  try {
    // require token
    const auth = req.headers['authorization'] || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
    const token = parts[1];
    const tok = verifyToken(token);
    if (!tok) return res.status(401).json({ error: 'invalid token' });

    const list = listTemplates();
    // filter by owner meta if present
    const filtered = list.filter(t => !t.meta || !t.meta.owner || t.meta.owner === tok.clientId);
    res.json({ ok: true, templates: filtered });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/editor/templates/:id', (req, res) => {
  try {
    const id = req.params.id;
    ensureTemplatesDir();
    const p = path.join(TEMPLATES_DIR, `${id}.json`);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' });
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ ok: true, template: parsed });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/editor/templates', (req, res) => {
  try {
    // require token
    const auth = req.headers['authorization'] || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
    const token = parts[1];
    const tok = verifyToken(token);
    if (!tok) return res.status(401).json({ error: 'invalid token' });

    const { name, code, meta } = req.body || {};
    // small server-side validations
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'missing code' });
    const MAX_CODE_BYTES = parseInt(process.env.MAX_CODE_BYTES || '16384', 10);
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) return res.status(413).json({ error: 'code_too_large' });
    const fw = (process.env.FORBIDDEN_WORDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const low = code.toLowerCase();
    for (const w of fw) {
      if (w && low.includes(w.toLowerCase())) return res.status(400).json({ error: 'forbidden_content' });
    }

    const finalMeta = Object.assign({}, meta || {}, { owner: tok.clientId });
    const rec = saveTemplate({ name, code, meta: finalMeta });
    res.json({ ok: true, template: rec });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
});

app.put('/editor/templates/:id', (req, res) => {
  try {
    // require token
    const auth = req.headers['authorization'] || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
    const token = parts[1];
    const tok = verifyToken(token);
    if (!tok) return res.status(401).json({ error: 'invalid token' });

    const id = req.params.id;
    const { name, code, meta } = req.body || {};
    // ownership check
    const p = path.join(TEMPLATES_DIR, `${id}.json`);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' });
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.meta && parsed.meta.owner && parsed.meta.owner !== tok.clientId) return res.status(403).json({ error: 'forbidden' });

    const finalMeta = Object.assign({}, parsed.meta || {}, meta || {}, { owner: tok.clientId });
    const rec = saveTemplate({ id, name, code, meta: finalMeta });
    res.json({ ok: true, template: rec });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
});

  // Run untrusted JS converted from Blockly in a restricted VM (PoC)
  const vm = require('vm');
  const { performance } = require('perf_hooks');

  app.post('/run/blockly', async (req, res) => {
      // Require authorization for running untrusted code
      try {
        const auth = req.headers['authorization'] || '';
        const parts = auth.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
        const token = parts[1];
        const tok = verifyToken(token);
        if (!tok) return res.status(401).json({ error: 'invalid token' });

        // rate limit
        const okRate = await checkRateLimitAsync(tok.clientId);
        if (!okRate) return res.status(429).json({ error: 'rate_limited' });

        const code = req.body && req.body.code;
        if (!code) return res.status(400).json({ error: 'missing code' });

        // Size limit (PoC): reject very large payloads
        const MAX_CODE_BYTES = parseInt(process.env.MAX_CODE_BYTES || '16384', 10); // 16KB default
        if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) return res.status(413).json({ error: 'code_too_large' });

        // Forbidden words filter (env-driven)
        const fw = (process.env.FORBIDDEN_WORDS || '').split(',').map(s => s.trim()).filter(Boolean);
        const low = code.toLowerCase();
        for (const w of fw) {
          if (w && low.includes(w.toLowerCase())) return res.status(400).json({ error: 'forbidden_content' });
        }

        // Provide minimal sandboxed context
        const logs = [];
        const sandbox = {
          console: { log: (...args) => logs.push(args.map(a => String(a)).join(' ')) },
          Date: Date,
          Math: Math,
        };
        try {
          const script = new vm.Script(code, { filename: 'blockly-run.js', displayErrors: true });
          const ctx = vm.createContext(sandbox);
          const start = performance.now();
          script.runInContext(ctx, { timeout: 1000 });
          const duration = performance.now() - start;
          return res.json({ ok: true, logs, duration });
        } catch (e) {
          return res.status(500).json({ error: 'execution_error', message: e && e.message, logs });
        }
      } catch (e) {
        console.error('run/blockly error:', e && e.message);
        return res.status(500).json({ error: 'internal' });
      }
  });

if (require.main === module) {
  app.listen(PORT, () => console.log(`Proxy listening on http://127.0.0.1:${PORT}`));
}

module.exports = { app, issueToken, verifyToken, hmacHex, checkAndStoreNonceAsync, checkRateLimitAsync };
