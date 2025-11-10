// Hook Worker wrapper for running /game/hooks/automation.js in a Web Worker

export function createHookWorker({ source, timeoutMs = 800 } = {}) {
  const blob = new Blob([
    `(${hookWorkerThread.toString()})()`
  ], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  let seq = 0; const pending = new Map();
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data || {};
    const p = pending.get(id); if (!p) return;
    pending.delete(id);
    if (!ok) p.reject(new Error(error || 'worker error')); else p.resolve(result);
  };
  function post(msg) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error('hook timeout')); }, timeoutMs);
      pending.set(id, { resolve: (v)=>{ clearTimeout(t); resolve(v); }, reject: (e)=>{ clearTimeout(t); reject(e); } });
      try { worker.postMessage({ ...msg, id }); } catch (err) { clearTimeout(t); pending.delete(id); reject(err); }
    });
  }
  function load(src) { return post({ type: 'load', source: src || source || '' }); }
  function call(fn, ctx, ...args) { return post({ type: 'call', fn, ctx, args }); }
  function dispose() { try { worker.terminate(); } catch {} }
  return { load, call, dispose };
}

// Inline the worker thread code into the blob (avoid extra file loader complexity)
function hookWorkerThread(){
  let hooks = {};
  function safeLoad(source) {
    const exports = {};
    const module = { exports };
    const require = () => { throw new Error('require disabled'); };
    try { self.fetch = undefined; } catch {}
    try { self.XMLHttpRequest = undefined; } catch {}
    try { self.WebSocket = undefined; } catch {}
    try { self.importScripts = undefined; } catch {}
    const fn = new Function('exports','module','require', String(source||''));
    fn(exports, module, require);
    const out = module.exports || exports || {};
    hooks = {
      transformPrompt: (typeof out.transformPrompt === 'function') ? out.transformPrompt : null,
      onUserAction: (typeof out.onUserAction === 'function') ? out.onUserAction : null,
      selectNext: (typeof out.selectNext === 'function') ? out.selectNext : null,
    };
  }
  self.onmessage = async (e) => {
    const msg = e.data || {};
    const id = msg.id;
    try {
      if (msg.type === 'load') { safeLoad(msg.source||''); self.postMessage({ id, ok:true }); return; }
      if (msg.type === 'call') {
        const fn = hooks[msg.fn];
        if (typeof fn !== 'function') throw new Error('fn not available');
        const res = await Promise.resolve(fn(msg.ctx||{}, ...(Array.isArray(msg.args)?msg.args:[])));
        self.postMessage({ id, ok:true, result: res }); return;
      }
      throw new Error('unknown message');
    } catch (err) { self.postMessage({ id, ok:false, error: String(err?.message||err) }); }
  };
}

