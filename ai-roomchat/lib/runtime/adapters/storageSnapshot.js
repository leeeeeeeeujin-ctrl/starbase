// Snapshot/Save adapter (skeleton)

export function createSnapshotStore({ keyPrefix = 'ws:snap:' } = {}) {
  function key(id){ return keyPrefix + id; }
  function save(id, data){ try { localStorage.setItem(key(id), JSON.stringify(data)); return true; } catch { return false; } }
  function load(id){ try { const s = localStorage.getItem(key(id)); return s ? JSON.parse(s) : null; } catch { return null; } }
  function remove(id){ try { localStorage.removeItem(key(id)); } catch {} }
  return { save, load, remove };
}

