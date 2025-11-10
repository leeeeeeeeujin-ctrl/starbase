// Web Worker thread for executing workspace hook code safely-ish
// Receives messages: { id, type: 'load', source } and { id, type: 'call', fn, ctx, args }

let hooks = {};

function safeLoad(source) {
  const exports = {};
  const module = { exports };
  const require = () => { throw new Error('require disabled'); };
  // minimal global hardening
  try { self.fetch = undefined; } catch {}
  try { self.XMLHttpRequest = undefined; } catch {}
  try { self.WebSocket = undefined; } catch {}
  try { self.importScripts = undefined; } catch {}
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports','module','require', String(source||''));
  fn(exports, module, require);
  const out = module.exports || exports || {};
  hooks = {
    transformPrompt: (typeof out.transformPrompt === 'function') ? out.transformPrompt : null,
    onUserAction: (typeof out.onUserAction === 'function') ? out.onUserAction : null,
    selectNext: (typeof out.selectNext === 'function') ? out.selectNext : null,
    onTurnStart: (typeof out.onTurnStart === 'function') ? out.onTurnStart : null,
    onEnterNode: (typeof out.onEnterNode === 'function') ? out.onEnterNode : null,
    onLeaveNode: (typeof out.onLeaveNode === 'function') ? out.onLeaveNode : null,
  };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  const id = msg.id;
  try {
    if (msg.type === 'load') {
      safeLoad(msg.source || '');
      self.postMessage({ id, ok: true });
      return;
    }
    if (msg.type === 'call') {
      const fn = hooks[msg.fn];
      if (typeof fn !== 'function') throw new Error('fn not available');
      const res = await Promise.resolve(fn(msg.ctx || {}, ...(Array.isArray(msg.args)?msg.args:[])));
      self.postMessage({ id, ok: true, result: res });
      return;
    }
    throw new Error('unknown message');
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message||err) });
  }
};
