const BASE_KEY = 'workspace.vfs.v1.set.';
const INJECTED_KEY = 'workspace.injected.set.';

export function vfsKey(setId) {
  return setId ? `${BASE_KEY}${setId}` : 'workspace.vfs.v1';
}

export function injectedFlagKey(setId) {
  return `${INJECTED_KEY}${setId || 'default'}`;
}

export function loadSnapshot(setId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(vfsKey(setId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(setId, files) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(vfsKey(setId), JSON.stringify(files || []));
  } catch {}
}

export function markInjected(setId) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(injectedFlagKey(setId), '1'); } catch {}
}

export function wasInjected(setId) {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(injectedFlagKey(setId)) === '1'; } catch { return false; }
}

