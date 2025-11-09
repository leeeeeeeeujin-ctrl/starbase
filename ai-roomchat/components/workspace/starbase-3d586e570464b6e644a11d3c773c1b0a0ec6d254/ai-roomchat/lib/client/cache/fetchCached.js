'use client';

import { cacheGet, cachePut, cacheEvictLRU } from './resourceCache';

// Fetch a resource with a simple LRU-backed cache.
// Returns { blob, objectUrl, fromCache }
export async function fetchCached(url, { typeHint, evictOnPressure = true } = {}) {
  if (!url) return { blob: null, objectUrl: null, fromCache: false };
  const key = String(url);

  let blob = await cacheGet(key);
  if (!blob) {
    const resp = await fetch(url, { cache: 'force-cache' }).catch(() => null);
    if (!resp || !resp.ok) return { blob: null, objectUrl: null, fromCache: false };
    const ct = resp.headers.get('content-type') || typeHint || 'application/octet-stream';
    const buf = await resp.arrayBuffer();
    blob = new Blob([buf], { type: ct });
    try {
      await cachePut(key, blob, { type: ct, url });
    } catch { /* ignore quota errors */ }
    if (evictOnPressure) {
      // Try to maintain ~50MB free space opportunistically
      cacheEvictLRU({ targetFreeBytes: 50 * 1024 * 1024 }).catch(() => {});
    }
    const objectUrl = URL.createObjectURL(blob);
    return { blob, objectUrl, fromCache: false };
  }
  const objectUrl = URL.createObjectURL(blob);
  return { blob, objectUrl, fromCache: true };
}
