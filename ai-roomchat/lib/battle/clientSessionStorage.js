const KEY_PREFIX = 'text-battle-session:';

function resolveStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTextBattleSession(textSessionId) {
  const storage = resolveStorage();
  const key = `${KEY_PREFIX}${String(textSessionId || '').trim()}`;
  if (!storage || !textSessionId) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredTextBattleSession(textSessionId, session) {
  const storage = resolveStorage();
  const key = `${KEY_PREFIX}${String(textSessionId || '').trim()}`;
  if (!storage || !textSessionId || !session || typeof session !== 'object') return;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...session,
        __savedAt: Date.now(),
      })
    );
  } catch {}
}

export function removeStoredTextBattleSession(textSessionId) {
  const storage = resolveStorage();
  const key = `${KEY_PREFIX}${String(textSessionId || '').trim()}`;
  if (!storage || !textSessionId) return;
  try {
    storage.removeItem(key);
  } catch {}
}
