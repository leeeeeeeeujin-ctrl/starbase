// A small, framework‑agnostic document store that models the
// workspace files, drafts, and "filesForSave" snapshot.
//
// React components (`CodeWorkspaceProvider` + `useWorkspace`) are
// expected to be a thin wrapper around this store.

/**
 * @typedef {{ content?: string, readonly?: boolean, dir?: boolean, [key: string]: any }} FileMeta
 * @typedef {Record<string, FileMeta>} FileMap
 */

export function canon(path) {
  if (!path) return '/';
  const raw = String(path || '').trim();
  return raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
}

// Simple stable hash (djb2) used for content signatures.
export function stableHash(str) {
  try {
    let h = 5381;
    for (let i = 0; i < str.length; i += 1) {
      h = ((h << 5) + h) + str.charCodeAt(i);
    }
    return `h${(h >>> 0).toString(16)}`;
  } catch {
    return 'h0';
  }
}

// Unified content signature compatible with the one used in
// CodeWorkspaceProvider (supports compressed entries).
export function contentSignature(meta) {
  try {
    if (!meta) return 'h0';
    if (meta.compressed && meta.data && typeof meta.rawLen === 'number') {
      const d = String(meta.data || '');
      const sample = d.slice(0, 16) + d.slice(-16);
      return stableHash(`${sample}|${meta.rawLen}|${meta.compLen}`);
    }
    if (meta.meta && (meta.meta.algo || meta.meta.data)) {
      const d = String(meta.meta.data || '');
      const sample = d.slice(0, 16) + d.slice(-16);
      return stableHash(`${sample}|${meta.meta.algo}|${meta.meta.rawLen}`);
    }
    if (typeof meta.content === 'string') return stableHash(meta.content);
    return 'h0';
  } catch {
    return 'h0';
  }
}

/**
 * Create a new document store.
 *
 * @param {FileMap} initialFiles
 */
export function createDocumentStore(initialFiles) {
  /** @type {FileMap} */
  let files = { ...(initialFiles || {}) };
  /** @type {Record<string, string>} */
  let drafts = {};
  /** @type {Record<string, boolean>} */
  let dirty = {};
  /** @type {Record<string, string>} */
  let savedSig = {};

  // Initialise signatures from the initial snapshot.
  for (const [p, meta] of Object.entries(files)) {
    const key = canon(p);
    savedSig[key] = contentSignature(meta);
  }

  function getSnapshot(path) {
    const key = canon(path);
    return files[key] || null;
  }

  function getWorkingCopy(path) {
    const key = canon(path);
    if (Object.prototype.hasOwnProperty.call(drafts, key)) {
      return drafts[key];
    }
    const meta = files[key];
    return meta && typeof meta.content === 'string' ? meta.content : '';
  }

  function applyDraft(path, content) {
    const key = canon(path);
    drafts[key] = content;
    dirty[key] = true;
  }

  function discardDraft(path) {
    const key = canon(path);
    delete drafts[key];
    delete dirty[key];
  }

  function markSaved(path, content) {
    const key = canon(path);
    const meta = files[key] || { content: '' };
    const nextMeta = { ...meta, content };
    files[key] = nextMeta;
    savedSig[key] = contentSignature(nextMeta);
    delete drafts[key];
    delete dirty[key];
  }

  function isDirty(path) {
    const key = canon(path);
    if (Object.prototype.hasOwnProperty.call(drafts, key)) return true;
    const meta = files[key];
    if (!meta) return false;
    const sig = savedSig[key];
    const curSig = contentSignature(meta);
    if (sig && sig === curSig) {
      return !!dirty[key];
    }
    // Signature mismatch or missing → treat as dirty.
    return true;
  }

  /**
   * Returns a snapshot of files where `content` already includes any
   * pending drafts. This is what should be sent to the server on save.
   *
   * @returns {FileMap}
   */
  function filesForSave() {
    /** @type {FileMap} */
    const merged = {};
    for (const [p, meta] of Object.entries(files)) {
      const key = canon(p);
      const draftContent = drafts[key];
      if (typeof draftContent === 'string') {
        merged[key] = { ...meta, content: draftContent };
      } else {
        merged[key] = { ...meta };
      }
    }
    // Drafts for paths that do not yet exist in `files` (new files).
    for (const [p, content] of Object.entries(drafts)) {
      if (!Object.prototype.hasOwnProperty.call(merged, p)) {
        merged[p] = { content };
      }
    }
    return merged;
  }

  /**
   * Rehydrate from a new server snapshot.
   * This overwrites `files` but intentionally keeps drafts and dirty flags.
   *
   * @param {FileMap} nextFiles
   */
  function rehydrateFromServer(nextFiles) {
    files = { ...(nextFiles || {}) };
    savedSig = {};
    for (const [p, meta] of Object.entries(files)) {
      const key = canon(p);
      savedSig[key] = contentSignature(meta);
    }
    // drafts + dirty remain as‑is so that unsaved work survives reloads.
  }

  function getState() {
    return {
      files,
      drafts,
      dirty,
      savedSig,
    };
  }

  return {
    getSnapshot,
    getWorkingCopy,
    applyDraft,
    discardDraft,
    markSaved,
    isDirty,
    filesForSave,
    rehydrateFromServer,
    getState,
  };
}
