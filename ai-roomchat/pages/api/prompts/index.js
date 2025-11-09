export const config = { runtime: 'nodejs' };

// In-memory prompt store (dev/preview). Replace with DB later.
const g = globalThis;
const PROMPTS = (g.__PROMPTS_STORE__ ||= new Map()); // id -> { id, name, createdAt }
const SEEN = (g.__PROMPTS_SEEN__ ||= new Set()); // X-Request-Id dedupe

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
    if (rid && SEEN.has(rid)) {
      // Idempotent acknowledgement
      return res.status(200).json({ ok: true });
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
      if (rid) SEEN.add(rid);
      return res.status(200).json({ ok: true, id: byName.id, name: byName.name, existed: true });
    }

    // 2) De-dupe by id
    if (!PROMPTS.has(id)) {
      const createdAt = new Date().toISOString();
      PROMPTS.set(id, { id, name, createdAt });
    }
    if (!SETS.has(id)) {
      SETS.set(id, { etag: `"${Date.now()}"`, files: {} });
    }

    if (rid) SEEN.add(rid);
    return res.status(200).json({ ok: true, id, name });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
