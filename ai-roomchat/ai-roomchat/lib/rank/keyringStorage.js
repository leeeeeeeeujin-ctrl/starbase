const RANK_KEYRING_STORAGE_KEY = 'rankKeyringSnapshot';
const RANK_KEYRING_STORAGE_EVENT = 'rank-keyring:refresh';

const EMPTY_KEYRING_SNAPSHOT = { userId: '', entries: [], updatedAt: 0 };

export function createEmptyRankKeyringSnapshot() {
  return {
    userId: '',
    entries: [],
    updatedAt: 0,
  };
}

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.error('[RankKeyringStorage] Failed to access localStorage:', error);
    return null;
  }
}

function normalizeId(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  return trimmed;
}

function broadcastChange() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(RANK_KEYRING_STORAGE_EVENT));
  } catch (error) {
    console.warn('[RankKeyringStorage] Failed to dispatch storage event:', error);
  }
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(entry => ({
      id: entry?.id ? String(entry.id) : '',
      isActive: !!entry?.isActive,
      provider: entry?.provider || 'unknown',
      modelLabel: entry?.modelLabel || null,
      apiVersion: entry?.apiVersion || null,
      geminiMode: entry?.geminiMode || null,
      geminiModel: entry?.geminiModel || null,
      keySample: entry?.keySample || '',
      createdAt: entry?.createdAt || null,
      updatedAt: entry?.updatedAt || null,
    }))
    .filter(entry => entry.id || entry.keySample);
}

export function persistRankKeyringSnapshot({ userId, entries } = {}) {
  const storage = safeStorage();
  if (!storage) return;

  const normalizedUserId = normalizeId(userId);
  const sanitizedEntries = sanitizeEntries(entries);

  const payload = {
    userId: normalizedUserId,
    entries: sanitizedEntries,
    updatedAt: Date.now(),
  };

  try {
    if (!normalizedUserId && !sanitizedEntries.length) {
      storage.removeItem(RANK_KEYRING_STORAGE_KEY);
    } else {
      storage.setItem(RANK_KEYRING_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (error) {
    console.error('[RankKeyringStorage] Failed to persist snapshot:', error);
  }

  broadcastChange();
}

export function clearRankKeyringSnapshot() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(RANK_KEYRING_STORAGE_KEY);
  } catch (error) {
    console.error('[RankKeyringStorage] Failed to clear snapshot:', error);
  }
  broadcastChange();
}

export function readRankKeyringSnapshot() {
  const storage = safeStorage();
  if (!storage) {
    return createEmptyRankKeyringSnapshot();
  }

  try {
    const raw = storage.getItem(RANK_KEYRING_STORAGE_KEY);
    if (!raw) {
      return createEmptyRankKeyringSnapshot();
    }

    const parsed = JSON.parse(raw);
    const snapshot = {
      userId: normalizeId(parsed?.userId),
      entries: sanitizeEntries(parsed?.entries),
      updatedAt: Number.isFinite(Number(parsed?.updatedAt)) ? Number(parsed.updatedAt) : 0,
    };

    return snapshot;
  } catch (error) {
    console.warn('[RankKeyringStorage] Failed to read snapshot:', error);
    clearRankKeyringSnapshot();
    return createEmptyRankKeyringSnapshot();
  }
}

export function hasActiveKeyInSnapshot(snapshot, userId) {
  if (!snapshot) return false;
  const normalizedUserId = normalizeId(userId);
  const snapshotUserId = normalizeId(snapshot.userId);
  if (!normalizedUserId || !snapshotUserId || snapshotUserId !== normalizedUserId) {
    return false;
  }

  return Array.isArray(snapshot.entries) ? snapshot.entries.some(entry => !!entry.isActive) : false;
}

export function hasActiveRankApiKey(userId) {
  const snapshot = readRankKeyringSnapshot();
  return hasActiveKeyInSnapshot(snapshot, userId);
}

export { RANK_KEYRING_STORAGE_EVENT, RANK_KEYRING_STORAGE_KEY };
