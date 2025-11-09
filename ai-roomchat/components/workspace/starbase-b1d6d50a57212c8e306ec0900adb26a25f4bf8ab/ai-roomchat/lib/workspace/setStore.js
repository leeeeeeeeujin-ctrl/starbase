// Simple in-memory store for workspace sets. Non-persistent; suitable for dev.
const sets = new Map();
const reqCache = new Map(); // idempotency: requestId -> set

function nowTag() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}

export function getSet(id) {
  return sets.get(String(id || '')) || null;
}

export function saveSet(id, files = [], meta = {}) {
  const record = {
    id: String(id || ''),
    files: Array.isArray(files) ? files : [],
    meta: meta && typeof meta === 'object' ? meta : {},
    etag: nowTag(),
    updated_at: nowTag(),
  };
  sets.set(record.id, record);
  return record;
}

export function upsertSet(id, files = [], meta = {}) { return saveSet(id, files, meta); }

export function ensureIdempotent(requestId, record) {
  const key = String(requestId || '').trim();
  if (!key) return null;
  const hit = reqCache.get(key);
  if (hit) return hit;
  reqCache.set(key, record);
  return null;
}

export function getIdempotent(requestId) {
  const key = String(requestId || '').trim();
  return key ? (reqCache.get(key) || null) : null;
}

export function clearAll() { sets.clear(); reqCache.clear(); }

