"use strict";

// Simple pluggable nonce store. Uses Redis when REDIS_URL is provided,
// otherwise falls back to an in-process memory store (best-effort, single-instance).

let redisClient = null;
let usingRedis = false;

async function createRedis(url) {
  try {
    const IORedis = require('ioredis');
    const client = new IORedis(url);
    // test connection
    await client.ping();
    return client;
  } catch (err) {
    // propagate up
    throw err;
  }
}

// In-memory fallback
const memStore = new Map(); // key -> expiryTs (seconds)

function pruneMem() {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, exp] of memStore.entries()) {
    if (exp <= now) memStore.delete(k);
  }
}

async function ensureClient() {
  if (redisClient || usingRedis === false) return;
  const url = process.env.REDIS_URL;
  if (!url) {
    usingRedis = false;
    return;
  }
  try {
    redisClient = await createRedis(url);
    usingRedis = true;
  } catch (e) {
    // failed to connect; fallback to mem
    console.warn('nonceStore: failed to connect to Redis, falling back to memory store:', String(e));
    redisClient = null;
    usingRedis = false;
  }
}

/**
 * Check whether a nonce key exists. Returns true if present (replay), false otherwise.
 */
async function has(key) {
  await ensureClient();
  if (usingRedis && redisClient) {
    try {
      const v = await redisClient.exists(key);
      return v === 1;
    } catch (e) {
      // fallback on error
      console.warn('nonceStore.has: redis error, falling back to mem:', String(e));
    }
  }

  pruneMem();
  return memStore.has(key);
}

/**
 * Atomically set the key for ttlSeconds and return true if set (i.e. was not present),
 * or false if already exists.
 */
async function setIfNotExists(key, ttlSeconds) {
  await ensureClient();
  if (usingRedis && redisClient) {
    try {
      // SET key value NX EX ttl
      const r = await redisClient.set(key, '1', 'NX', 'EX', ttlSeconds);
      return r === 'OK';
    } catch (e) {
      console.warn('nonceStore.setIfNotExists: redis error, falling back to mem:', String(e));
    }
  }

  pruneMem();
  if (memStore.has(key)) return false;
  const now = Math.floor(Date.now() / 1000);
  memStore.set(key, now + Math.max(1, Number(ttlSeconds) || 300));
  return true;
}

module.exports = {
  has,
  setIfNotExists,
  // for tests and diagnostics
  _internal: {
    usingRedis: () => usingRedis,
    _memStore: memStore
  }
};
