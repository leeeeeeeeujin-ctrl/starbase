// Server-side helpers to validate asset keys and enforce media constraints
// Keep this small and dependency-free; import config limits from config/mediaLimits.js

import { IMAGE_LIMITS, VIDEO_LIMITS, AUDIO_LIMITS } from '../../../config/mediaLimits.js';

export function parseAndValidateAssetKey(key) {
  const k = String(key || '').replace(/^\/+/, '');
  if (!k.startsWith('games/')) throw withStatus(new Error('key must start with games/'), 400);
  const parts = k.split('/');
  // Expect at least: games/{gameId}/{setId}/filename
  if (parts.length < 4) throw withStatus(new Error('key must include games/{gameId}/{setId}/...'), 400);
  const gameId = parts[1];
  const setId = parts[2];
  if (!isSafeId(gameId)) throw withStatus(new Error('invalid gameId in key'), 400);
  if (!isSafeId(setId)) throw withStatus(new Error('invalid setId in key'), 400);
  const filename = parts.slice(3).join('/');
  if (!filename || filename.endsWith('/')) throw withStatus(new Error('key must include a file name'), 400);
  return { key: k, gameId, setId, filename };
}

export function ensureImageExtensionWebp(key) {
  const i = key.lastIndexOf('.');
  const base = i >= 0 ? key.slice(0, i) : key;
  return base + '.webp';
}

export function isImage(mime) { return /^image\//i.test(String(mime||'')); }
export function isVideo(mime) { return /^video\//i.test(String(mime||'')); }
export function isAudio(mime) { return /^audio\//i.test(String(mime||'')); }

export function validateBudget({ mime, size }) {
  const n = Number(size) || 0;
  if (n <= 0) return;
  if (isImage(mime)) {
    if (IMAGE_LIMITS?.targetBytes && n > Math.max(IMAGE_LIMITS.targetBytes * 6, 600 * 1024)) {
      throw withStatus(new Error('image too large; please compress'), 413);
    }
  } else if (isVideo(mime)) {
    if (VIDEO_LIMITS?.maxBytes && n > VIDEO_LIMITS.maxBytes) {
      throw withStatus(new Error('video too large; please compress'), 413);
    }
  } else if (isAudio(mime)) {
    if (AUDIO_LIMITS?.maxBytes && n > AUDIO_LIMITS.maxBytes) {
      throw withStatus(new Error('audio too large; please compress'), 413);
    }
  }
}

export function withStatus(err, statusCode = 400) {
  err.statusCode = statusCode;
  return err;
}

function isSafeId(v) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(String(v||''));
}
