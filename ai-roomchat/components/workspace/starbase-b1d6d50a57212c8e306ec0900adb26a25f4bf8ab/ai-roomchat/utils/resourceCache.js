"use client";

// Lightweight client-side resource cache using Cache Storage + localStorage index.
// - Content-addressed by `hash` (e.g., sha256:xxxx or plain hex).
// - Prefetch from baseUrl + path or external URL defined in manifest.
// - Tracks per-game mapping and global byte usage; supports cleanup on leave.

const CACHE_NAME = 'game-res-v1';
const KEY_INDEX = 'res:index.v1'; // { id -> { size, games?:{[gameId]:true}, last?:ts, hits?:n } }
const KEY_GAME = (gameId) => `res:byGame.v1:${gameId}`; // string[] of ids
const GLOBAL_LIMIT = 50 * 1024 * 1024; // 50MB soft limit
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const KEY_LAST_CLEANUP = 'res:lastCleanupTs.v1';

function readIndex() {
  try { return JSON.parse(localStorage.getItem(KEY_INDEX) || '{}'); } catch { return {}; }
}
function writeIndex(obj) {
  try { localStorage.setItem(KEY_INDEX, JSON.stringify(obj)); } catch {}
}
function readGame(gameId) {
  try { return JSON.parse(localStorage.getItem(KEY_GAME(gameId)) || '[]'); } catch { return []; }
}
function writeGame(gameId, arr) {
  try { localStorage.setItem(KEY_GAME(gameId), JSON.stringify(arr)); } catch {}
}

async function globalBytes() {
  const idx = readIndex();
  return Object.values(idx).reduce((s, v) => s + (v?.size || 0), 0);
}

export async function prefetchResources({ gameId, baseUrl = '', manifest = [], onProgress } = {}) {
  const cache = await caches.open(CACHE_NAME);
  const idx = readIndex();
  const gameList = new Set(readGame(gameId));
  let done = 0;
  for (const entry of manifest) {
    // entry: { hash, path?, url?, size? }
    const { hash, path, url, size = 0 } = entry || {};
    if (!hash) continue;
    const id = `hash:${hash}`;
    const requestUrl = url || (baseUrl ? baseUrl.replace(/\/$/,'') + '/' + String(path||hash).replace(/^\//,'') : null);
    if (!requestUrl) continue;
    const req = new Request(requestUrl, { mode: 'cors' });
    const already = await cache.match(new Request(id));
    if (!already) {
      await ensureSpace(size || 0);
      const res = await fetch(req);
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const buf = await res.clone().arrayBuffer();
      await cache.put(new Request(id), new Response(buf));
      idx[id] = { size: size || buf.byteLength, games: { ...(idx[id]?.games||{}), [gameId]: true }, last: Date.now(), hits: (idx[id]?.hits||0)+1 };
    } else {
      idx[id] = { size: idx[id]?.size || size, games: { ...(idx[id]?.games||{}), [gameId]: true }, last: Date.now(), hits: (idx[id]?.hits||0)+1 };
    }
    gameList.add(id);
    done++;
    if (typeof onProgress === 'function') onProgress(done, manifest.length);
  }
  writeIndex(idx);
  writeGame(gameId, Array.from(gameList));
  return { done, total: manifest.length };
}

export async function getResourceUrl(hash) {
  const cache = await caches.open(CACHE_NAME);
  const id = hash.startsWith('hash:') || hash.startsWith('key:') ? hash : `hash:${hash}`;
  const res = await cache.match(new Request(id));
  if (!res) return null;
  const blob = await res.blob();
  touchIndex(id, blob.size);
  return URL.createObjectURL(blob);
}

export async function cleanupGameResources(gameId) {
  const cache = await caches.open(CACHE_NAME);
  const idx = readIndex();
  const ids = readGame(gameId);
  for (const id of ids) {
    const rec = idx[id];
    if (rec?.games) delete rec.games[gameId];
    if (!rec || Object.keys(rec.games||{}).length === 0) {
      await cache.delete(new Request(id));
      delete idx[id];
    }
  }
  writeIndex(idx);
  writeGame(gameId, []);
}

function touchIndex(id, size) {
  try {
    const idx = readIndex();
    if (!idx[id]) idx[id] = { size: size||0 };
    idx[id].last = Date.now();
    idx[id].hits = (idx[id].hits||0)+1;
    writeIndex(idx);
  } catch {}
}

export async function getResourceBlob(id) {
  const cache = await caches.open(CACHE_NAME);
  const key = id.startsWith('hash:') || id.startsWith('key:') ? id : `key:${id}`;
  const res = await cache.match(new Request(key));
  if (!res) return null;
  const blob = await res.blob();
  touchIndex(key, blob.size);
  return blob;
}

export async function putResourceBlob(id, blob, { gameId } = {}) {
  const cache = await caches.open(CACHE_NAME);
  const key = id.startsWith('hash:') || id.startsWith('key:') ? id : `key:${id}`;
  await ensureSpace(blob?.size || 0);
  await cache.put(new Request(key), new Response(blob));
  const idx = readIndex();
  const cur = idx[key] || {};
  idx[key] = { ...cur, size: blob?.size || cur.size || 0, last: Date.now(), hits: (cur.hits||0)+1 };
  if (gameId) {
    idx[key].games = { ...(idx[key].games||{}), [gameId]: true };
    const list = new Set(readGame(gameId)); list.add(key); writeGame(gameId, Array.from(list));
  }
  writeIndex(idx);
}

export async function fetchToCache(id, url, { gameId } = {}) {
  const cache = await caches.open(CACHE_NAME);
  const key = id.startsWith('hash:') || id.startsWith('key:') ? id : `key:${id}`;
  const existing = await cache.match(new Request(key));
  if (existing) {
    const blob = await existing.blob();
    touchIndex(key, blob.size);
    return blob;
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const buf = await res.clone().arrayBuffer();
  await ensureSpace(buf.byteLength);
  await cache.put(new Request(key), new Response(buf));
  const idx = readIndex(); idx[key] = { size: buf.byteLength, last: Date.now(), hits: (idx[key]?.hits||0)+1 };
  if (gameId) {
    idx[key].games = { ...(idx[key].games||{}), [gameId]: true };
    const list = new Set(readGame(gameId)); list.add(key); writeGame(gameId, Array.from(list));
  }
  writeIndex(idx);
  return new Blob([buf]);
}

export async function deleteResource(id) {
  const cache = await caches.open(CACHE_NAME);
  const key = id.startsWith('hash:') || id.startsWith('key:') ? id : `key:${id}`;
  await cache.delete(new Request(key));
  const idx = readIndex(); delete idx[key]; writeIndex(idx);
}

export async function ensureSpace(bytesNeeded = 0) {
  try {
    // quick check against soft limit
    const cur = await globalBytes();
    const quota = await estimateQuota();
    const limit = quota?.quota ? Math.min(GLOBAL_LIMIT || Infinity, quota.quota * 0.9) : GLOBAL_LIMIT;
    if (limit && cur + bytesNeeded <= limit) {
      maybeCleanupAged();
      return;
    }
    await evictLRU(cur + bytesNeeded - limit);
  } catch {
    // best-effort: try to evict aged entries if storage estimation fails
    await evictLRU(bytesNeeded || 0);
  }
}

async function estimateQuota() {
  try {
    if (navigator?.storage?.estimate) return await navigator.storage.estimate();
  } catch {}
  return { usage: await globalBytes(), quota: GLOBAL_LIMIT };
}

function maybeCleanupAged() {
  try {
    const last = parseInt(localStorage.getItem(KEY_LAST_CLEANUP) || '0', 10);
    const now = Date.now();
    if (now - last < 6 * 60 * 60 * 1000) return; // every 6 hours
    localStorage.setItem(KEY_LAST_CLEANUP, String(now));
    // evict entries older than MAX_AGE_MS opportunistically
    const idx = readIndex();
    const cutoff = now - MAX_AGE_MS;
    const toDelete = Object.entries(idx).filter(([,v]) => (v?.last||0) < cutoff).map(([k])=>k);
    if (!toDelete.length) return;
    caches.open(CACHE_NAME).then(cache => {
      toDelete.forEach(key => { cache.delete(new Request(key)); delete idx[key]; });
      writeIndex(idx);
    });
  } catch {}
}

async function evictLRU(bytesToFree = 0) {
  if (!bytesToFree || bytesToFree <= 0) return;
  const cache = await caches.open(CACHE_NAME);
  const idx = readIndex();
  const entries = Object.entries(idx).map(([k,v]) => ({ key:k, last: v?.last||0, size: v?.size||0, hits: v?.hits||0 }));
  entries.sort((a,b)=> (a.last||0) - (b.last||0) || (a.hits||0) - (b.hits||0));
  let freed = 0;
  for (const e of entries) {
    await cache.delete(new Request(e.key));
    delete idx[e.key];
    freed += e.size || 0;
    if (freed >= bytesToFree) break;
  }
  writeIndex(idx);
}
