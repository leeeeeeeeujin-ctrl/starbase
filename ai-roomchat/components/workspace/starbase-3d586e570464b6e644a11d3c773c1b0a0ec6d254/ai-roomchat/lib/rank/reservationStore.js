// Simple in-memory reservation store for PoC/testing.
// Provides basic reserve/commit/release semantics with TTL support.

const reservations = new Map();

function now() {
  return Date.now();
}

function cleanup() {
  const ts = now();
  for (const [id, meta] of reservations.entries()) {
    if (meta.expiresAt != null && meta.expiresAt <= ts) {
      reservations.delete(id);
    }
  }
}

// Try to atomically reserve a set of ids. Returns { ok, missing, reserved }
function reserve(ids = [], { ttl = 5000 } = {}) {
  cleanup();
  const missing = [];
  const already = [];
  const toReserve = [];

  for (const id of ids) {
    if (!id) continue;
    if (reservations.has(id)) {
      already.push(id);
      continue;
    }
    toReserve.push(id);
  }

  if (already.length) {
    return { ok: false, missing: [], already };
  }

  const expiresAt = now() + ttl;
  for (const id of toReserve) {
    reservations.set(id, { reservedAt: now(), expiresAt });
  }

  return { ok: true, missing, reserved: toReserve.slice() };
}

function commit(ids = []) {
  // commit by removing reservations
  for (const id of ids) {
    if (!id) continue;
    reservations.delete(id);
  }
}

function release(ids = []) {
  // same as commit for PoC
  commit(ids);
}

function isReserved(id) {
  cleanup();
  return reservations.has(id);
}

module.exports = { reserve, commit, release, isReserved, _debug: { reservations } };
