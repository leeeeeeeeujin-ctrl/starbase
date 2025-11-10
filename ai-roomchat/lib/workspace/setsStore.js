// Dev-only in-memory store for workspace sets. Provides optimistic-locking
// via simple etags so the editor can detect conflicts even without a DB.
const crypto = require('crypto');

const sets = new Map();

function nowIso() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}

function normalizeId(id) {
  const trimmed = String(id ?? '').trim();
  if (!trimmed) throw new Error('id required');
  return trimmed;
}

function normalizePath(raw) {
  if (!raw && raw !== 0) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const normalized = '/' + str.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  return normalized.replace(/\/{2,}/g, '/');
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  return { ...meta };
}

function normalizeFiles(files) {
  if (!files) return [];
  const entries = Array.isArray(files)
    ? files
    : Object.entries(files || {}).map(([path, meta]) => ({ path, ...(meta || {}) }));

  const ordered = [];
  const seen = new Map();
  for (const file of entries) {
    if (!file) continue;
    const path = normalizePath(file.path || file.name || file.filename);
    if (!path) continue;
    const content = file.dir ? '' : String(file.content ?? '');
    const normalized = {
      path,
      content,
      readonly: !!file.readonly,
      dir: !!file.dir,
    };
    seen.set(path, normalized);
  }
  for (const [, value] of seen) ordered.push({ ...value });
  return ordered;
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    ...record,
    files: record.files.map((f) => ({ ...f })),
    meta: { ...(record.meta || {}) },
  };
}

function nextEtag(version = 1) {
  const rand = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `W/"${version}-${rand}"`;
}

function buildRecord(prev, id, files, meta) {
  const createdAt = prev?.createdAt || nowIso();
  const updatedAt = nowIso();
  const version = (prev?.version || 0) + 1;
  return {
    id,
    files,
    meta,
    createdAt,
    updatedAt,
    version,
    etag: nextEtag(version),
  };
}

function ensure(id) {
  const key = normalizeId(id);
  return cloneRecord(sets.get(key) || null);
}

function create(id, payload = {}) {
  const key = normalizeId(id);
  const files = normalizeFiles(payload.files);
  const meta = normalizeMeta(payload.meta);
  const record = buildRecord(null, key, files, meta);
  sets.set(key, record);
  return cloneRecord(record);
}

function mergeFiles(base = [], incoming = []) {
  if (!incoming) return base.map((f) => ({ ...f }));
  const baseMap = new Map();
  for (const file of base) baseMap.set(file.path, { ...file });
  const next = normalizeFiles(incoming);
  for (const file of next) baseMap.set(file.path, file);
  return Array.from(baseMap.values());
}

function upsert(id, payload = {}, options = {}) {
  const key = normalizeId(id);
  const prev = sets.get(key) || null;
  const ifMatch = options.ifMatch;

  if (ifMatch && (!prev || (prev.etag && prev.etag !== ifMatch))) {
    const err = new Error('etag mismatch');
    err.code = 'ETAG_MISMATCH';
    err.status = 412;
    err.currentEtag = prev?.etag || null;
    throw err;
  }

  const files = options.merge
    ? mergeFiles(prev?.files || [], payload.files)
    : normalizeFiles(payload.files ?? prev?.files ?? []);
  const meta = { ...(prev?.meta || {}), ...normalizeMeta(payload.meta) };
  const record = buildRecord(prev, key, files, meta);
  sets.set(key, record);
  return cloneRecord(record);
}

function remove(id) {
  const key = normalizeId(id);
  return sets.delete(key);
}

function list() {
  return Array.from(sets.values()).map(cloneRecord);
}

module.exports = {
  ensure,
  create,
  upsert,
  remove,
  list,
};
