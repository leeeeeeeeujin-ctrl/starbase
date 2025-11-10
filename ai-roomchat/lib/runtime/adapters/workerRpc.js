// Worker RPC Adapter (skeleton)

export function createWorkerRpc(url) {
  const worker = new Worker(url, { type: 'module' });
  let seq = 0; const pending = new Map();
  worker.onmessage = (e) => {
    const { id, result, error } = e.data || {};
    const p = pending.get(id); if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error)); else p.resolve(result);
  };
  function call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, params });
    });
  }
  function dispose(){ try { worker.terminate(); } catch {} }
  return { call, dispose };
}

