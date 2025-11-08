// Ensure a scope value exists before any provider/module-side persistence runs.
// Attempts to infer setId from URL /prompts/{id}/edit; safe no-op on SSR.
if (typeof window !== 'undefined') {
  try {
    const m = window.location.pathname && window.location.pathname.match(/\/prompts\/([^/]+)\/edit/);
    const setId = m && m[1];
    window.__VFS_SCOPED_PATCH__ = window.__VFS_SCOPED_PATCH__ || {};
    if (!window.__VFS_SCOPED_PATCH__.scope) {
      window.__VFS_SCOPED_PATCH__.scope = setId || null;
    }
  } catch {
    // ignore
  }
}

