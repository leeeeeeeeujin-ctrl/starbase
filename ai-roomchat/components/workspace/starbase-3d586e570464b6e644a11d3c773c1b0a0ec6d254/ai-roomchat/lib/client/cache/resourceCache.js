'use client';

// Minimal IndexedDB-backed cache with LRU eviction

const DB_NAME = 'resource-cache';
const STORE_DATA = 'data';
const STORE_META = 'meta';

export async function cacheInit() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DATA)) db.createObjectStore(STORE_DATA);
      if (!db.objectStoreNames.contains(STORE_META)) {
        const s = db.createObjectStore(STORE_META, { keyPath: 'key' });
        s.createIndex('lastAccess', 'lastAccess');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cachePut(key, blob, meta = {}) {
  const db = await cacheInit();
  await txPut(db, STORE_DATA, key, blob);
  await txPut(db, STORE_META, { key, size: blob.size || 0, lastAccess: Date.now(), ...meta });
}

export async function cacheGet(key) {
  const db = await cacheInit();
  const blob = await txGet(db, STORE_DATA, key);
  if (blob) await txPut(db, STORE_META, { key, lastAccess: Date.now() }, true);
  return blob || null;
}

export async function cacheDelete(key) {
  const db = await cacheInit();
  await txDel(db, STORE_DATA, key);
  await txDel(db, STORE_META, key);
}

export async function cacheEstimate() {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null;
  const e = await navigator.storage.estimate();
  return { quota: e.quota || 0, usage: e.usage || 0 };
}

export async function cacheEvictLRU({ targetFreeBytes = 50 * 1024 * 1024 } = {}) {
  const db = await cacheInit();
  const estimate = await cacheEstimate();
  if (!estimate) return { evicted: 0 };
  const free = (estimate.quota || 0) - (estimate.usage || 0);
  if (free >= targetFreeBytes) return { evicted: 0 };

  const toFree = targetFreeBytes - free;
  let freed = 0, evicted = 0;

  const metas = await getAllMetaSortedByLastAccess(db);
  for (const m of metas) {
    await cacheDelete(m.key);
    freed += m.size || 0;
    evicted += 1;
    if (freed >= toFree) break;
  }
  return { evicted, freed };
}

async function getAllMetaSortedByLastAccess(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const idx = store.index('lastAccess');
    const req = idx.getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (a.lastAccess||0) - (b.lastAccess||0)));
    req.onerror = () => reject(req.error);
  });
}

function txPut(db, storeName, keyOrValue, merge = false) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (storeName === STORE_META) {
      if (merge) {
        const getReq = store.get(keyOrValue.key);
        getReq.onsuccess = () => {
          const cur = getReq.result || { key: keyOrValue.key };
          const merged = { ...cur, ...keyOrValue };
          const putReq = store.put(merged);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
        return;
      }
      const req = store.put(keyOrValue);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      return;
    }
    const req = store.put(keyOrValue, typeof keyOrValue === 'string' ? keyOrValue : undefined);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function txGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDel(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
