const BRIDGE_OBJECT_KEY = 'chatMediaBridge';
const RESPONSE_TIMEOUT = 20000;

let requestCounter = 0;
const pendingRequests = new Map();
let responseHandlerInitialized = false;

function getWindow() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window;
}

function getBridgeObject() {
  const win = getWindow();
  if (!win) return null;
  return win[BRIDGE_OBJECT_KEY] || null;
}

function getMessagePoster() {
  const win = getWindow();
  if (!win) return null;

  const bridge = getBridgeObject();
  if (bridge && typeof bridge.postMessage === 'function') {
    return payload => bridge.postMessage(payload);
  }

  if (win.ReactNativeWebView && typeof win.ReactNativeWebView.postMessage === 'function') {
    return payload => win.ReactNativeWebView.postMessage(payload);
  }

  const handler = win.webkit?.messageHandlers?.[BRIDGE_OBJECT_KEY];
  if (handler && typeof handler.postMessage === 'function') {
    return payload => handler.postMessage(payload);
  }

  return null;
}

function ensureResponseHandler() {
  const win = getWindow();
  if (!win || responseHandlerInitialized) return;
  responseHandlerInitialized = true;

  win.__chatMediaBridgeDispatch__ = function dispatchNativeBridgeResponse(raw) {
    try {
      const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!payload || typeof payload.id !== 'string') return;
      const entry = pendingRequests.get(payload.id);
      if (!entry) return;
      pendingRequests.delete(payload.id);
      clearTimeout(entry.timeout);
      if (payload.error) {
        const error =
          payload.error instanceof Error ? payload.error : new Error(String(payload.error));
        entry.reject(error);
      } else {
        entry.resolve(payload.result ?? payload.data ?? null);
      }
    } catch (error) {
      console.error('[chat] 네이티브 미디어 브릿지 응답 파싱 실패', error);
    }
  };
}

function normalizePermission(result) {
  const status = result?.status || result?.permission || result?.state;
  if (status === 'granted' || status === 'authorized') {
    return { status: 'granted' };
  }
  if (status === 'limited') {
    return { status: 'limited' };
  }
  if (status === 'denied' || status === 'blocked') {
    return { status: 'denied' };
  }
  return { status: 'unknown' };
}

function normalizeEntry(entry) {
  if (!entry) return null;
  const id = String(entry.id ?? entry.localId ?? entry.assetId ?? '');
  if (!id) return null;
  const mimeType = entry.mimeType || entry.type || '';
  const type = mimeType.startsWith('video/')
    ? 'video'
    : mimeType.startsWith('image/')
      ? 'image'
      : 'file';
  return {
    id,
    type: mimeType,
    displayType: type,
    name:
      entry.name ||
      entry.filename ||
      `${id}.${type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'bin'}`,
    size: Number(entry.size || entry.fileSize || 0) || 0,
    width: Number(entry.width || entry.pixelWidth || 0) || undefined,
    height: Number(entry.height || entry.pixelHeight || 0) || undefined,
    duration: Number(entry.duration || entry.playbackDuration || 0) || undefined,
    takenAt: entry.takenAt || entry.creationDate || entry.createdAt || null,
    addedAt: entry.addedAt || entry.modificationDate || entry.modifiedAt || null,
    previewUrl: entry.previewUrl || entry.thumbnailDataUrl || entry.thumbnail || null,
    uri: entry.uri || entry.localIdentifier || entry.assetUri || null,
    layoutHint: entry.layoutHint || null,
    metadata: entry.metadata || {},
    source: 'native',
  };
}

function normalizeTimelineResponse(response) {
  const items = Array.isArray(response?.entries)
    ? response.entries
    : Array.isArray(response)
      ? response
      : [];
  const entries = items.map(item => normalizeEntry(item)).filter(Boolean);

  const cursor = response?.cursor || response?.nextCursor || null;
  const hasMore = Boolean(response?.hasMore || response?.has_more);
  return { entries, cursor, hasMore };
}

function base64ToBlob(base64, contentType) {
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64;
  let binary = '';
  if (typeof atob === 'function') {
    binary = atob(cleaned);
  } else if (typeof Buffer !== 'undefined') {
    binary = Buffer.from(cleaned, 'base64').toString('binary');
  } else {
    throw new Error('base64 데이터를 디코딩할 수 없습니다.');
  }

  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

async function callBridge(method, payload) {
  const bridge = getBridgeObject();
  if (bridge && typeof bridge[method] === 'function') {
    const result = bridge[method](payload);
    return result?.then ? result : Promise.resolve(result);
  }

  if (bridge && typeof bridge.invoke === 'function') {
    return bridge.invoke(method, payload);
  }

  const postMessage = getMessagePoster();
  if (!postMessage) {
    throw new Error('네이티브 미디어 브릿지를 찾을 수 없습니다.');
  }

  ensureResponseHandler();
  const id = `media-${Date.now()}-${(requestCounter += 1)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('네이티브 미디어 브릿지 응답이 없습니다.'));
    }, RESPONSE_TIMEOUT);

    pendingRequests.set(id, { resolve, reject, timeout });

    try {
      postMessage(JSON.stringify({ id, method, payload }));
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

export function hasNativeMediaBridge() {
  try {
    return Boolean(getBridgeObject() || getMessagePoster());
  } catch (error) {
    return false;
  }
}

export async function requestNativeMediaPermission(kind = 'read') {
  const result = await callBridge('requestPermission', { kind });
  return normalizePermission(result);
}

export async function openNativeMediaSettings() {
  await callBridge('openSettings', {});
}

export async function fetchNativeMediaTimeline({
  mediaType = 'image',
  cursor = null,
  limit = 120,
} = {}) {
  const response = await callBridge('fetchTimeline', {
    mediaType,
    cursor,
    limit,
  });
  return normalizeTimelineResponse(response);
}

export async function fetchNativeMediaAsset({
  id,
  mediaType = 'image',
  quality = 'original',
} = {}) {
  if (!id) {
    throw new Error('자산 식별자가 필요합니다.');
  }
  const response = await callBridge('fetchAsset', {
    id,
    mediaType,
    quality,
  });

  if (!response) {
    throw new Error('자산을 불러오지 못했습니다.');
  }

  let blob = response.blob || null;
  if (!blob && response.base64) {
    blob = base64ToBlob(
      response.base64,
      response.mimeType || response.type || 'application/octet-stream'
    );
  }

  if (!blob && response.url) {
    const res = await fetch(response.url);
    if (!res.ok) {
      throw new Error('자산을 다운로드할 수 없습니다.');
    }
    blob = await res.blob();
  }

  if (!(blob instanceof Blob)) {
    throw new Error('자산 데이터를 확인할 수 없습니다.');
  }

  return {
    blob,
    name:
      response.name ||
      response.filename ||
      `${id}.${mediaType === 'video' ? 'mp4' : mediaType === 'image' ? 'jpg' : 'bin'}`,
    mimeType: response.mimeType || response.type || blob.type || 'application/octet-stream',
    size: response.size || blob.size,
    width: response.width || response.pixelWidth,
    height: response.height || response.pixelHeight,
    duration: response.duration || response.playbackDuration,
    metadata: response.metadata || {},
  };
}

export function registerNativeMediaListener(listener) {
  const bridge = getBridgeObject();
  if (bridge && typeof bridge.subscribe === 'function') {
    return bridge.subscribe(listener);
  }

  const win = getWindow();
  if (!win) return () => {};

  function handleMessage(event) {
    const payload = event?.data;
    if (!payload || payload?.namespace !== 'chat-media-bridge') return;
    if (payload.type === 'change' && listener) {
      listener(payload);
    }
  }

  win.addEventListener('message', handleMessage);
  return () => win.removeEventListener('message', handleMessage);
}

export function __debugPendingRequests() {
  return Array.from(pendingRequests.keys());
}
