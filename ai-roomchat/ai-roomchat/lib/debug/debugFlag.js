export function isDebugEditor() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.__DEBUG_EDITOR) return true;
    const v = localStorage.getItem('debug:editor');
    return v === '1' || v === 'true';
  } catch {}
  return false;
}

export function dbg(label, payload) {
  if (!isDebugEditor()) return;
  try {
    // eslint-disable-next-line no-console
    console.log(label, payload);
  } catch {}
}

