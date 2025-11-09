import { saveSet } from './saveSet.js';

// Unified save: try MakerEditor save (graph → DB) if available, then save workspace VFS files.
// Safe to call from anywhere in the browser. On server, this will just run saveSet.
export async function unifiedSave(setId, files) {
  try {
    if (typeof window !== 'undefined') {
      const actions = window.__makerActions;
      if (actions && typeof actions.unifiedSaveAll === 'function') {
        await actions.unifiedSaveAll();
        return true;
      }
      // Legacy compatibility: older Maker registers only `saveAll`
      if (actions && typeof actions.saveAll === 'function') {
        await actions.saveAll();
        // fall through to also persist workspace files to backend
      }
    }
  } catch (e) {
    try { console.warn('[unifiedSave] maker save failed, continuing with workspace save', e); } catch {}
  }

  // Persist workspace files for this set id
  await saveSet(String(setId || ''), files);
  return true;
}

