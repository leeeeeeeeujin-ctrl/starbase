const G = globalThis;
G.__SET_STORE__ = G.__SET_STORE__ || new Map();

export function getWorkspaceSetStore() {
  return {
    async create(id) {
      if (!G.__SET_STORE__.has(id)) {
        G.__SET_STORE__.set(id, { etag: '1', files: {} });
      }
      return true;
    },
    async get(id) {
      return G.__SET_STORE__.get(id) || null;
    },
    async put(id, body, ifMatch) {
      const existing = G.__SET_STORE__.get(id);
      if (!existing) return { code: 428 };
      if (ifMatch && String(ifMatch) !== String(existing.etag)) return { code: 412 };
      // simple etag bump
      const next = String(Number(existing.etag || '0') + 1);
      const files = body || {};
      G.__SET_STORE__.set(id, { etag: next, files });
      return { etag: next };
    }
  };
}
