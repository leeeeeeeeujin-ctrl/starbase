// Lightweight Worker-based sandbox for client-side code execution.
// Usage:
//   import { runInWorker } from './workerSandbox.js';
//   const { result, error, logs } = await runInWorker({ code, args: { a: 1 }, timeoutMs: 2000 });
//
// Security notes:
// - This is a best-effort isolation using Web Workers. It does not grant full security.
// - Do not pass secrets. Do not execute untrusted code in production without additional hardening.
// - Network and DOM access are not available inside the worker by default.

export async function runInWorker({ code = '', args = {}, timeoutMs = 3000 } = {}) {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    throw new Error('Worker not available in this environment');
  }
  const logs = [];
  const workerSrc = `
    self.onmessage = async (e) => {
      const { code, args } = e.data || {};
      const logs = [];
      const safeConsole = { log: (...a) => logs.push(['log', a]), warn: (...a) => logs.push(['warn', a]), error: (...a) => logs.push(['error', a]) };
      try {
        // Create async function wrapper with limited globals
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction('args', 'console', `'use strict';\n'__SANDBOX__';\n` + code + `\n;return (typeof main==='function') ? await main(args) : undefined;`);
        const result = await fn(args, safeConsole);
        self.postMessage({ ok: true, result, logs });
      } catch (err) {
        self.postMessage({ ok: false, error: String(err?.message || err), logs });
      }
    };
  `;
  const blob = new Blob([workerSrc], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'module' });
  URL.revokeObjectURL(url);
  try {
    const outcome = await new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return; done = true;
        try { worker.terminate(); } catch {}
        resolve({ ok: false, timeout: true, logs });
      }, Math.max(1, timeoutMs));
      worker.onmessage = (ev) => {
        if (done) return; done = true;
        clearTimeout(timer);
        resolve(ev.data || { ok: false, error: 'No data' });
      };
      worker.onerror = (err) => {
        if (done) return; done = true;
        clearTimeout(timer);
        resolve({ ok: false, error: String(err?.message || err), logs });
      };
      worker.postMessage({ code, args });
    });
    return {
      result: outcome.ok ? outcome.result : undefined,
      error: outcome.ok ? undefined : (outcome.timeout ? 'Timeout' : outcome.error || 'Unknown error'),
      logs: outcome.logs || logs,
      timeout: outcome.timeout || false,
    };
  } finally {
    try { worker.terminate(); } catch {}
  }
}
