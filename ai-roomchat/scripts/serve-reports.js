#!/usr/bin/env node
/* Simple report server for PoC reports
   - Serves a small viewer HTML at /
   - GET /api/reports -> list of report filenames (JSON)
   - GET /api/reports/:name -> raw report JSON
   - GET /events -> SSE stream that emits "update" when reports change
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Security defaults (can be configured via env)
const PORT = process.env.PORT || 4000;
const HOST = process.env.REPORTS_HOST || '127.0.0.1'; // bind to localhost by default
const API_KEY = process.env.REPORTS_API_KEY || process.env.SYNC_API_KEY || null; // required to access APIs if set
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

// CORS: restrict to configured origins
app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true); // non-browser clients
      if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
  })
);

// Basic in-memory rate limiter to avoid adding deps
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10); // requests per window per ip
const rateMap = new Map();
function rateLimit(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = rateMap.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
      entry = { start: now, count: 1 };
      rateMap.set(ip, entry);
      return next();
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return res.status(429).json({ error: 'rate_limited' });
    return next();
  } catch (e) {
    return next();
  }
}

// Apply rate limiting globally for API routes
app.use('/api', rateLimit);
app.use('/events', rateLimit);

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const SYNC_DIR = path.resolve(process.cwd(), 'sync_store');

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'report-viewer.html'));
});

// API key middleware
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // if not configured, allow (dev convenience)
  const header = req.get('x-api-key') || req.get('authorization');
  if (!header) return res.status(401).json({ error: 'missing_api_key' });
  let key = header;
  if (header.toLowerCase().startsWith('bearer ')) key = header.slice(7).trim();
  if (key !== API_KEY) return res.status(403).json({ error: 'invalid_api_key' });
  return next();
}

app.get('/api/reports', requireApiKey, (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return res.json([]);
    const files = fs
      .readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
// fetch a specific report file (safe resolution)
app.get('/api/reports/:name', requireApiKey, (req, res) => {
  try {
    const name = req.params.name;
    const p = path.resolve(REPORTS_DIR, name);
    if (path.relative(REPORTS_DIR, p).startsWith('..'))
      return res.status(400).json({ error: 'invalid' });
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' });
    const content = fs.readFileSync(p, 'utf8');
    res.type('application/json').send(content);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- Sync endpoints (lightweight mobile sync store) ---
if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true });

app.get('/api/sync', requireApiKey, (req, res) => {
  try {
    const files = fs.readdirSync(SYNC_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      const p = path.join(SYNC_DIR, f);
      const stat = fs.statSync(p);
      return { key: f.replace(/\.json$/, ''), updatedAt: stat.mtimeMs };
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
// fetch a specific sync item
app.get('/api/sync/:key', requireApiKey, (req, res) => {
  try {
    const k = req.params.key;
    // sanitize key: allow only simple token to avoid path traversal
    if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(k)) return res.status(400).json({ error: 'invalid_key' });
    const p = path.resolve(SYNC_DIR, k + '.json');
    if (path.relative(SYNC_DIR, p).startsWith('..') || !fs.existsSync(p))
      return res.status(404).json({ error: 'not_found' });
    res.type('application/json').send(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
app.post('/api/sync/upload', requireApiKey, express.json({ limit: '1mb' }), (req, res) => {
  try {
    const { key, content, meta } = req.body || {};
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key_required' });
    // key sanitization
    if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(key)) return res.status(400).json({ error: 'invalid_key' });
    const payload = { content: content || '', meta: meta || {}, updatedAt: Date.now() };
    const p = path.resolve(SYNC_DIR, key + '.json');
    if (path.relative(SYNC_DIR, p).startsWith('..'))
      return res.status(400).json({ error: 'invalid_path' });
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
    notifyAll();
    res.json({ ok: true, key });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
// delete a sync item
app.delete('/api/sync/:key', requireApiKey, (req, res) => {
  try {
    const k = req.params.key;
    if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(k)) return res.status(400).json({ error: 'invalid_key' });
    const p = path.resolve(SYNC_DIR, k + '.json');
    if (path.relative(SYNC_DIR, p).startsWith('..'))
      return res.status(400).json({ error: 'invalid_path' });
    if (fs.existsSync(p)) fs.unlinkSync(p);
    notifyAll();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Simple SSE endpoint to notify watchers when reports change
let clients = [];
app.get('/events', requireApiKey, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 10000\n\n');
  // limit concurrent SSE connections per IP/key
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const connKey = `${ip}:${req.get('x-api-key') || ''}`;
  const maxSSE = parseInt(process.env.MAX_SSE_PER_IP || '3', 10);
  const curr = clients.filter(c => c.meta === connKey).length;
  if (curr >= maxSSE) {
    res.write('event: error\ndata: {"error":"too_many_connections"}\n\n');
    return res.end();
  }
  res.meta = connKey;
  clients.push(res);
  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

function notifyAll() {
  clients.forEach(res => {
    try {
      res.write('event: update\ndata: {}\n\n');
    } catch (e) {
      /* ignore */
    }
  });
}

// Watch reports dir
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
// Watch reports dir
fs.watch(REPORTS_DIR, { persistent: true }, (evt, filename) => {
  if (!filename) return;
  notifyAll();
});

app.listen(PORT, HOST, () => {
  console.log(`Report server listening on http://${HOST}:${PORT}`);
  console.log('Viewer: /');
});
