export const config = { runtime: 'nodejs' };

// In-memory prompt store (dev/preview). Replace with DB later.
const g = globalThis;
const PROMPTS = (g.__PROMPTS_STORE__ ||= new Map()); // id -> { id, name, createdAt }
const SEEN = (g.__PROMPTS_SEEN__ ||= new Set()); // X-Request-Id dedupe

// Short-term recent request cache to handle cases where callers don't set stable ids
// Keyed by X-Request-Id (preferred) or by a lightweight signature of referer+body
const RECENT_REQ = (g.__PROMPTS_RECENT_REQ__ ||= new Map()); // key -> { at, result }

// Reuse workspace set store if present to ensure parity
const SETS = (g.__SET_STORE__ ||= new Map()); // id -> { etag, files }

function makeId() {
  try { return crypto.randomUUID(); } catch (_) { return String(Date.now()) + Math.random().toString(16).slice(1); }
}

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'GET') {
    const items = Array.from(PROMPTS.values());
    return res.status(200).json({ items });
  }

  if (method === 'POST') {
    const rid = req.headers['x-request-id'];
    if (process.env.NODE_ENV !== 'production') {
      try {
        const bodyLog = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
        // Lightweight request trace for debugging duplicate creations
        console.log('[api/prompts] POST', {
          rid,
          referer: req.headers['referer'] || null,
          ua: req.headers['user-agent'] || null,
          body: bodyLog,
        });
      } catch {}
    }
    // Fast-path idempotency by X-Request-Id
    if (rid && SEEN.has(rid)) {
      return res.status(200).json({ ok: true });
    }

    // If client didn't set a stable X-Request-Id, try dedupe by a short-term
    // signature (referer + name/body). This helps when clients generate distinct
    // random ids per attempt or Strict Mode double-invoke.
    try {
      const sigBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const sig = `${(req.headers['referer']||'')}:${sigBody}`;
      const recent = RECENT_REQ.get(sig);
      if (recent && (Date.now() - recent.at) < 3000) {
        // Return cached result to avoid duplicate creation
        if (rid) SEEN.add(rid);
        return res.status(200).json(recent.result || { ok: true });
      }
    } catch (e) {
      // ignore signature errors
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    let { id, name } = body;
    if (!id && !name) return res.status(400).json({ error: 'missing id or name' });
    if (!id) id = makeId();
    if (!name) name = id;

    // 1) Strong idempotency by name: if a prompt with the same name exists, return it
    const byName = Array.from(PROMPTS.values()).find(p => p.name === name);
    if (byName) {
      // Ensure set exists for that id
      if (!SETS.has(byName.id)) {
        SETS.set(byName.id, { etag: `"${Date.now()}"`, files: {} });
      }
      const out = { ok: true, id: byName.id, name: byName.name, existed: true };
      if (rid) SEEN.add(rid);
      try { RECENT_REQ.set(`${(req.headers['referer']||'')}:${JSON.stringify(req.body||{})}`, { at: Date.now(), result: out }); } catch {}
      return res.status(200).json(out);
    }

    // 2) De-dupe by id
    if (!PROMPTS.has(id)) {
      const createdAt = new Date().toISOString();
      PROMPTS.set(id, { id, name, createdAt });
    }
    if (!SETS.has(id)) {
      SETS.set(id, { etag: `"${Date.now()}"`, files: {} });
    }

  const out = { ok: true, id, name };
  if (rid) SEEN.add(rid);
  try { RECENT_REQ.set(`${(req.headers['referer']||'')}:${JSON.stringify(req.body||{})}`, { at: Date.now(), result: out }); } catch {}
  return res.status(200).json(out);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
