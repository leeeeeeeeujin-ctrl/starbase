"use client";

// Lightweight client-side resource cache using Cache Storage + localStorage index.
// - Content-addressed by `hash` (e.g., sha256:xxxx or plain hex).
// - Prefetch from baseUrl + path or external URL defined in manifest.
// - Tracks per-game mapping and global byte usage; supports cleanup on leave.

const CACHE_NAME = 'game-res-v1';
const KEY_INDEX = 'res:index.v1'; // { hash: { size, games: { [gameId]: true } } }
const KEY_GAME = (gameId) => `res:byGame.v1:${gameId}`; // string[] of hashes
const GLOBAL_LIMIT = 50 * 1024 * 1024; // 50MB soft limit

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
    const requestUrl = url || (baseUrl ? baseUrl.replace(/\/$/,'') + '/' + String(path||hash).replace(/^\//,'') : null);
    if (!requestUrl) continue;
    const req = new Request(requestUrl, { mode: 'cors' });
    const already = await cache.match(new Request(`hash:${hash}`));
    if (!already) {
      const cur = await globalBytes();
      if (GLOBAL_LIMIT && cur + size > GLOBAL_LIMIT) break; // soft stop
      const res = await fetch(req);
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const buf = await res.clone().arrayBuffer();
      await cache.put(new Request(`hash:${hash}`), new Response(buf));
      idx[hash] = { size: size || buf.byteLength, games: { ...(idx[hash]?.games||{}), [gameId]: true } };
    } else {
      idx[hash] = { size: idx[hash]?.size || size, games: { ...(idx[hash]?.games||{}), [gameId]: true } };
    }
    gameList.add(hash);
    done++;
    if (typeof onProgress === 'function') onProgress(done, manifest.length);
  }
  writeIndex(idx);
  writeGame(gameId, Array.from(gameList));
  return { done, total: manifest.length };
}

export async function getResourceUrl(hash) {
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(new Request(`hash:${hash}`));
  if (!res) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function cleanupGameResources(gameId) {
  const cache = await caches.open(CACHE_NAME);
  const idx = readIndex();
  const hashes = readGame(gameId);
  for (const h of hashes) {
    if (idx[h]?.games) delete idx[h].games[gameId];
    if (!idx[h] || Object.keys(idx[h].games||{}).length === 0) {
      await cache.delete(new Request(`hash:${h}`));
      delete idx[h];
    }
  }
  writeIndex(idx);
  writeGame(gameId, []);
}

