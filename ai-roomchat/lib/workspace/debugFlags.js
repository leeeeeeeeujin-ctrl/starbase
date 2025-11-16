// Lightweight helpers for enabling workspace/editor debug logging
// without requiring a rebuild. Intended for use in client-side code.
//
// Debug is considered enabled if any of the following are true:
// - NEXT_PUBLIC_WORKSPACE_DEBUG === '1' at build time
// - window.__WORKSPACE_DEBUG__ === true at runtime
// - URL query string contains `wsdebug=1`
// - localStorage['workspace:debug'] is '1' or 'true'

export function isWorkspaceDebug() {
  // On the server we can only see build-time env.
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_WORKSPACE_DEBUG === '1';
  }

  try {
    if (window.__WORKSPACE_DEBUG__ === true) return true;
  } catch {
    // ignore
  }

  try {
    const search = window.location && typeof window.location.search === 'string'
      ? window.location.search
      : '';
    if (search.includes('wsdebug=1')) return true;
  } catch {
    // ignore
  }

  try {
    const v =
      (window.localStorage && window.localStorage.getItem('workspace:debug')) ||
      null;
    if (v === '1' || v === 'true') return true;
  } catch {
    // ignore
  }

  return process.env.NEXT_PUBLIC_WORKSPACE_DEBUG === '1';
}

export function markWorkspaceDebug(enabled = true) {
  if (typeof window === 'undefined') return;
  try {
    window.__WORKSPACE_DEBUG__ = !!enabled;
    try {
      if (enabled) {
        window.localStorage && window.localStorage.setItem('workspace:debug', '1');
      } else {
        window.localStorage && window.localStorage.removeItem('workspace:debug');
      }
    } catch {
      // ignore storage issues
    }
  } catch {
    // ignore
  }
}

