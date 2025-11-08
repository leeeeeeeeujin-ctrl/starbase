"use client";

// Local staging of resources (IndexedDB via resourceCache) and commit-to-storage helper.
// Files are kept on-device until commit; on commit, we compress (when applicable) and upload each,
// then append entries into template.resources.files and clear the staged items.

import { cacheInit } from '@/lib/client/cache/resourceCache';

const DB_NAME = 'resource-cache';
const STORE_DATA = 'data';
const STORE_META = 'meta';

const STAGING_PREFIX = 'staging:'; // keys under STORE_DATA as staging:<id>

export async function stageFiles(files) {
  const arr = Array.from(files || []);
  if (!arr.length) return [];
  const db = await cacheInit();
  const ids = [];
  for (const f of arr) {
    const id = `sg_${Math.random().toString(36).slice(2,10)}`;
    const key = STAGING_PREFIX + id;
    await putData(db, key, f);
    await putMeta(db, { key, kind: 'staging', name: f.name, size: f.size || 0, mime: f.type || 'application/octet-stream', addedAt: Date.now() });
    ids.push({ id, name: f.name, size: f.size || 0, mime: f.type || 'application/octet-stream' });
  }
  return ids;
}

export async function listStaged() {
  const db = await cacheInit();
  const metas = await getAllMeta(db);
  return metas
    .filter(m => m && typeof m.key === 'string' && m.key.startsWith(STAGING_PREFIX))
    .map(m => ({ id: m.key.slice(STAGING_PREFIX.length), name: m.name, size: m.size, mime: m.mime, addedAt: m.addedAt }));
}

export async function removeStaged(id) {
  const key = STAGING_PREFIX + id;
  const db = await cacheInit();
  await del(db, STORE_DATA, key);
  await del(db, STORE_META, key);
}

export async function clearStaged() {
  const items = await listStaged();
  for (const it of items) await removeStaged(it.id);
}

export async function commitStaged({ getTemplateText, setTemplateText, setId = null } = {}) {
  const staged = await listStaged();
  if (!staged.length) return { uploaded: 0 };
  const db = await cacheInit();
  const outItems = [];
  const { uploadAsset } = await import('@/utils/uploader');
  // Optional pre-compressors
  let compressors = null;
  try { compressors = await import('@/lib/client/media/compress'); } catch {}
  const baseFolder = 'studio/resources';
  const folder = setId ? `${baseFolder}/${setId}` : baseFolder;

  for (const it of staged) {
    const key = STAGING_PREFIX + it.id;
    const file = await getData(db, key);
    if (!file) { await removeStaged(it.id); continue; }
    let toUpload = file;
    try {
      const mime = file.type || '';
      if (compressors) {
        if (mime.startsWith('image/') && !/gif/i.test(mime) && compressors.compressImage) {
          const c = await compressors.compressImage(file, {}); if (c && c.size > 0) toUpload = c;
        } else if (mime.startsWith('video/') && compressors.compressVideo) {
          const c = await compressors.compressVideo(file, { format: 'mp4' }); if (c && c.size > 0) toUpload = c;
        } else if (mime.startsWith('audio/') && compressors.compressAudio) {
          const c = await compressors.compressAudio(file, {}); if (c && c.size > 0) toUpload = c;
        }
      }
    } catch {}
    const safeName = (toUpload.name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const res = await uploadAsset(toUpload, { gameId: 'studio', key: `${folder}/${Date.now()}-${safeName}` });
    outItems.push({
      id: `res_${Math.random().toString(36).slice(2,8)}`,
      name: toUpload.name || file.name || 'file',
      type: classifyType(toUpload.type || file.type || 'application/octet-stream'),
      url: res.url,
      key: res.key,
      hash: res.hash,
      mime: toUpload.type || file.type || 'application/octet-stream',
      size: toUpload.size || file.size || 0,
      setId: setId || undefined,
    });
    // Clear item after successful upload
    await removeStaged(it.id);
  }

  if (outItems.length) {
    try {
      const text = typeof getTemplateText === 'function' ? getTemplateText() : null;
      const obj = text ? JSON.parse(text) : {};
      const now = new Date().toISOString();
      const prev = obj.resources && Array.isArray(obj.resources.files) ? obj.resources.files : [];
      const next = {
        ...obj,
        resources: {
          ...(obj.resources || {}),
          files: [
            ...prev,
            ...outItems.map(it => ({ ...it, uploadedAt: now }))
          ],
        },
      };
      typeof setTemplateText === 'function' && setTemplateText(JSON.stringify(next, null, 2));
    } catch {}
  }

  return { uploaded: outItems.length };
}

function classifyType(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}

function getAllMeta(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function getData(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readonly');
    const store = tx.objectStore(STORE_DATA);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function putData(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readwrite');
    const store = tx.objectStore(STORE_DATA);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function putMeta(db, meta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.put(meta);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function del(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
