const g = globalThis;
const MEM = (g.__SET_STORE__ ||= new Map()); // id -> { etag, files }

function newEtag() {
  return `"${Date.now()}"`;
}

export function memoryStore() {
  return {
    async get(id) {
      const e = MEM.get(id);
      if (!e) return null;
      return { etag: e.etag, files: e.files };
    },
    async create(id) {
      if (!MEM.has(id)) MEM.set(id, { etag: newEtag(), files: {} });
      return { ok: true };
    },
    async put(id, files, ifMatch) {
      const cur = MEM.get(id);
      if (!cur) return { error: 'missing', code: 428 };
      if (!ifMatch || ifMatch !== cur.etag) return { error: 'precondition', code: 412 };
      const etag = newEtag();
      MEM.set(id, { etag, files });
      return { etag };
    },
  };
}

