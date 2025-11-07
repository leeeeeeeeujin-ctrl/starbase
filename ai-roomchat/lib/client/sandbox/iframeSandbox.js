// Lightweight iframe sandbox RPC for isolated computations.
// Creates a sandboxed iframe pointing to /sandbox-frame.html and communicates via postMessage.

let iframeRef = null;
let ready = false;
const pending = new Map();
let counter = 0;

function createIframe() {
  if (typeof document === 'undefined') return null;
  const iframe = document.createElement('iframe');
  iframe.src = '/sandbox-frame.html';
  // Tight sandbox: allow scripts only; no same-origin, storage, forms, etc.
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  return iframe;
}

function ensureListeners() {
  if (typeof window === 'undefined') return;
  if (ensureListeners._attached) return;
  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data && data.type === 'sandbox_ready') {
      ready = true;
      return;
    }
    const id = data && data.id;
    if (!id) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'sandbox_error'));
  });
  ensureListeners._attached = true;
}

export function isSandboxAvailable() {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

export function ensureSandbox() {
  if (!isSandboxAvailable()) return false;
  ensureListeners();
  if (!iframeRef) iframeRef = createIframe();
  return !!iframeRef;
}

export async function runInSandbox(cmd, payload, { timeout = 2000 } = {}) {
  if (!ensureSandbox() || !iframeRef || !iframeRef.contentWindow) {
    throw new Error('sandbox_unavailable');
  }
  const id = `rpc_${Date.now()}_${counter++}`;
  const message = { id, cmd, payload };
  const targetWindow = iframeRef.contentWindow;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('sandbox_timeout'));
      }
    }, timeout);

    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    try {
      targetWindow.postMessage(message, '*');
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e);
    }
  });
}

// Convenience: rule simulation in sandbox
export async function runRuleSimInSandbox(state, opts = {}) {
  const result = await runInSandbox('ruleSim.run', { state }, opts);
  return result;
}
