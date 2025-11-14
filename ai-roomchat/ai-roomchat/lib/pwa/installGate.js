// Centralized PWA install-gate helpers and configuration (title/roster gate entry)

export const restrictedPrefixes = [
  '/game/play',
  '/rank',
  '/maker',
  '/arena',
];

export function isStandaloneDisplay(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    if (!win) return false;
    if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return true;
    if (win.navigator && win.navigator.standalone) return true; // iOS Safari
  } catch {}
  return false;
}

export function isRestrictedPath(pathname = '') {
  const p = String(pathname || '').toLowerCase();
  return restrictedPrefixes.some(prefix => p.startsWith(prefix));
}

export function minutesLeftForBypass(now = Date.now(), ls = typeof window !== 'undefined' ? window.localStorage : undefined) {
  try {
    if (!ls) return 0;
    const raw = ls.getItem('ALLOW_BROWSER_TEMP');
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    const exp = obj.expiresAt || 0;
    return Math.max(0, Math.floor((exp - now) / 60000));
  } catch { return 0; }
}

export function shouldGate(pathname, standalone, bypassMinutesLeft) {
  return isRestrictedPath(pathname) && !standalone && bypassMinutesLeft <= 0;
}
