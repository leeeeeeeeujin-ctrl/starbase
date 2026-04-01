const BASE_KEY = 'maker.battle-config.v1';

function storageKey(setId) {
  return `${BASE_KEY}@${String(setId || '').trim()}`;
}

export function readStoredBattleConfig(setId) {
  if (typeof window === 'undefined') return null;
  const key = storageKey(setId);
  if (!key.endsWith('@')) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function writeStoredBattleConfig(setId, config) {
  if (typeof window === 'undefined') return;
  const key = storageKey(setId);
  if (key.endsWith('@')) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(config || {}));
  } catch {
    // ignore storage failures
  }
}
