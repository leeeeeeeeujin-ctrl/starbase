// In-memory fallback store for workspace sets with simple ETag handling.
// DB-backed persistence can plug in by replacing these functions.

const crypto = require('crypto');

function hash(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function getStore() {
  if (!globalThis.__WORKSPACE_SETS__) {
    globalThis.__WORKSPACE_SETS__ = new Map();
  }
  return globalThis.__WORKSPACE_SETS__;
}

function normalizeFiles(files) {
  // files: Array<{ path: string, content: string }>
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
    .map((f) => ({ path: f.path.replace(/\\/g, '/'), content: f.content }));
}

function serialize(files) {
  return JSON.stringify(normalizeFiles(files));
}

function createSet({ id, files = [] }) {
  const store = getStore();
  const now = new Date().toISOString();
  const serialized = serialize(files);
  const etag = hash(serialized);
  const record = { id, files: normalizeFiles(files), etag, createdAt: now, updatedAt: now };
  store.set(id, record);
  return record;
}

function getSet(id) {
  const store = getStore();
  return store.get(id) || null;
}

function upsertSet(id, files, ifMatch) {
  const existing = getSet(id);
  if (!existing) {
    // Create new set if none exists; ignore If-Match for initial create
    const serialized = serialize(files);
    const etag = hash(serialized);
    const now = new Date().toISOString();
    const record = { id, files: normalizeFiles(files), etag, createdAt: now, updatedAt: now };
    getStore().set(id, record);
    return record;
  }
  if (ifMatch && existing.etag && existing.etag !== ifMatch) {
    const err = new Error('ETag mismatch');
    err.code = 'ETAG_MISMATCH';
    throw err;
  }
  const serialized = serialize(files);
  const etag = hash(serialized);
  const now = new Date().toISOString();
  const next = { ...existing, files: normalizeFiles(files), etag, updatedAt: now };
  getStore().set(id, next);
  return next;
}

module.exports = {
  createSet,
  getSet,
  upsertSet,
};
